import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { homedir } from "node:os";
import { join } from "node:path";
import { Plugin } from "@opencode/plugin";

const MAX_CHARS = 1600;
const env = (name, legacy) => process.env[name] ?? process.env[legacy];
const PIPER_BIN = env("FARADAY_TTS_PIPER_BIN", "AGENT_TTS_PIPER_BIN") || join(homedir(), ".local/bin/piper");
const PIPER_MODEL = env("FARADAY_TTS_PIPER_MODEL", "AGENT_TTS_PIPER_MODEL") || join(homedir(), ".local/share/piper-voices/en_US-amy-medium.onnx");
const PLAYER_BIN = env("FARADAY_TTS_PLAYER_BIN", "AGENT_TTS_PLAYER_BIN") || "paplay";
const PLAYER_ARGS = (
  process.env.FARADAY_TTS_PLAYER_ARGS || process.env.AGENT_TTS_PLAYER_ARGS || "--raw --format=s16le --rate=22050 --channels=1"
)
  .split(/\s+/)
  .filter(Boolean);

const SPEECH_DEDUPE_WINDOW_MS = 3000;
const STATE_KEY = Symbol.for("faraday-voice.opencode.shared");

// OpenCode instantiates a global plugin once per active location. All instances
// run in the same server process, so keep mutable state on globalThis to share
// a single dedupe set, text buffer, and speech queue across them.
const state = (globalThis[STATE_KEY] ??= {
  seenMessages: new Set(),
  sessionText: new Map(),
  speechQueue: [],
  speaking: false,
  recentSpeech: new Map(),
});

function claimSpeech(text) {
  const hash = createHash("sha256").update(text).digest("hex");
  const now = Date.now();
  const last = state.recentSpeech.get(hash);
  if (last !== undefined && now - last < SPEECH_DEDUPE_WINDOW_MS) return false;
  state.recentSpeech.set(hash, now);
  if (state.recentSpeech.size > 200) {
    for (const [key, at] of state.recentSpeech) {
      if (now - at >= SPEECH_DEDUPE_WINDOW_MS) state.recentSpeech.delete(key);
    }
  }
  return true;
}

function eventSessionID(event) {
  return event?.data?.sessionID ?? event?.properties?.sessionID;
}

function cleanText(text) {
  return text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/https?:\/\/\S+/g, " link ")
    .replace(/[\p{Extended_Pictographic}\p{Regional_Indicator}\p{Emoji_Modifier}\uFE0F\u200D\u20E3]/gu, "")
    .replace(/^\s{0,3}#{1,6}\s*/gm, "")
    .replace(/^\s{0,3}[-*+>]\s+/gm, "")
    .replace(/^\s{0,3}\d+\.\s+/gm, "")
    .replace(/(\*\*|__)(.*?)\1/g, "$2")
    .replace(/(\*|_)(.*?)\1/g, "$2")
    .replace(/~~(.*?)~~/g, "$1")
    .replace(/\*/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_CHARS);
}

function spawnSpeech(command, args, stdinText) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    let child;
    try {
      child = spawn(command, args, {
        stdio: [stdinText === undefined ? "ignore" : "pipe", "ignore", "ignore"],
      });
    } catch (error) {
      finish({ error });
      return;
    }

    child.once("error", (error) => finish({ error }));
    child.once("close", (code, signal) => finish({ code, signal }));
    if (stdinText !== undefined) {
      child.stdin.once("error", () => {});
      child.stdin.end(stdinText);
    }
  });
}

function spawnPiperSpeech(text) {
  return new Promise((resolve) => {
    let settled = false;
    let piper;
    let player;
    let piperDone = false;
    let playerDone = false;
    let piperResult = null;
    let playerResult = null;

    const cleanup = () => {
      try {
        piper?.stdout?.unpipe(player?.stdin);
      } catch {}
      try {
        piper?.stdout?.destroy();
      } catch {}
      try {
        player?.stdin?.end();
      } catch {}
    };

    const finish = (result) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(result);
    };

    const maybeFinish = () => {
      if (!piperDone || !playerDone) return;
      if (piperResult?.error) return finish(piperResult);
      if (piperResult?.code !== 0) return finish(piperResult);
      if (playerResult?.error) {
        console.error("[faraday-voice] audio player failed to start:", playerResult.error.message);
      } else if (playerResult?.code !== 0) {
        console.error("[faraday-voice] audio player exited unsuccessfully:", playerResult);
      }
      finish(piperResult);
    };

    try {
      piper = spawn(PIPER_BIN, ["-m", PIPER_MODEL, "--output-raw"], {
        stdio: ["pipe", "pipe", "ignore"],
      });
    } catch (error) {
      finish({ error });
      return;
    }

    piper.stdout.once("error", () => {});
    piper.once("error", (error) => {
      piperDone = true;
      piperResult = { error };
      finish(piperResult);
    });
    piper.once("close", (code, signal) => {
      piperDone = true;
      piperResult = { code, signal };
      if (code !== 0) return finish(piperResult);
      maybeFinish();
    });

    try {
      player = spawn(PLAYER_BIN, PLAYER_ARGS, {
        stdio: ["pipe", "ignore", "ignore"],
      });
    } catch (error) {
      piper.kill();
      finish({ error });
      return;
    }

    player.stdin.once("error", () => {});
    player.once("error", (error) => {
      playerDone = true;
      playerResult = { error };
      piper.kill();
      finish({ error });
    });
    player.once("close", (code, signal) => {
      playerDone = true;
      playerResult = { code, signal };
      maybeFinish();
    });

    piper.stdout.pipe(player.stdin);
    piper.stdin.once("error", () => {});
    try {
      piper.stdin.end(`${text}\n`);
    } catch {}
  });
}

async function speak(text) {
  const piperResult = await spawnPiperSpeech(text);
  if (!piperResult.error && piperResult.code === 0) return piperResult;

  if (piperResult.error) {
    console.error("[faraday-voice] Piper failed to start:", piperResult.error.message);
  } else {
    console.error("[faraday-voice] Piper exited unsuccessfully:", piperResult);
  }
  console.error("[faraday-voice] falling back to espeak-ng");
  return spawnSpeech("espeak-ng", ["--stdin"], text);
}

function enqueueSpeech(text) {
  return new Promise((resolve) => {
    state.speechQueue.push({ text, resolve });
    void drainSpeechQueue();
  });
}

async function drainSpeechQueue() {
  if (state.speaking) return;
  state.speaking = true;

  try {
    while (state.speechQueue.length > 0) {
      const job = state.speechQueue.shift();
      const result = await speak(job.text);
      if (result.error) {
        console.error("[faraday-voice] Could not start speech:", result.error.message);
      } else if (result.code !== 0) {
        console.error("[faraday-voice] speech exited unsuccessfully:", result);
      }
      job.resolve(result);
    }
  } finally {
    state.speaking = false;
    if (state.speechQueue.length > 0) void drainSpeechQueue();
  }
}

function collectTextEvent(event) {
  const data = event?.data ?? event?.properties ?? {};
  const { sessionID, assistantMessageID, ordinal, text } = data;
  if (!sessionID || !assistantMessageID || typeof text !== "string") return;

  let current = state.sessionText.get(sessionID);
  if (!current || current.messageID !== assistantMessageID) {
    current = { messageID: assistantMessageID, parts: new Map() };
    state.sessionText.set(sessionID, current);
  }
  current.parts.set(Number(ordinal) || 0, text);
}

async function speakCompletedAnswer(sessionID) {
  const current = state.sessionText.get(sessionID);
  state.sessionText.delete(sessionID);
  // Another plugin instance already handled this completion.
  if (!current) return;

  const rawText = [...current.parts.entries()]
    .sort(([a], [b]) => a - b)
    .map(([, text]) => text)
    .join("\n");
  const text = cleanText(rawText);
  if (!text) return;

  const key = `${sessionID}:${current.messageID}`;
  if (state.seenMessages.has(key)) return;
  state.seenMessages.add(key);
  if (state.seenMessages.size > 500) state.seenMessages.clear();

  const spoken = `Faraday: ${text}`;
  if (!claimSpeech(spoken)) return;

  await enqueueSpeech(spoken);
}

export default Plugin.define({
  id: "faraday-voice.opencode",

  async setup(ctx) {
    const controller = new AbortController();

    await ctx.command.transform((editor) => {
      for (const name of ["faraday-test", "agent-voice-test"]) {
        editor.add({
          name,
          description: "Speak a short Piper test phrase",
          execute: async () => {
            await enqueueSpeech("Faraday voice test. If you hear this, speech playback works.");
          },
        });
      }
    });

    void (async () => {
      for await (const event of ctx.event.subscribe({
        types: [
          "session.execution.started",
          "session.text.ended",
          "session.execution.succeeded",
        ],
        signal: controller.signal,
      })) {
        if (event?.type === "session.execution.started") {
          const sessionID = eventSessionID(event);
          if (sessionID) state.sessionText.delete(sessionID);
          continue;
        }

        if (event?.type === "session.text.ended") {
          collectTextEvent(event);
          continue;
        }

        const sessionID = eventSessionID(event);
        if (!sessionID) {
          console.error("[faraday-voice] Completion event did not include a session ID");
          continue;
        }

        try {
          await speakCompletedAnswer(sessionID);
        } catch (error) {
          console.error("[faraday-voice] Could not speak final response:", error);
        }
      }
    })().catch((error) => {
      if (!controller.signal.aborted) {
        console.error("[faraday-voice] Completion listener stopped:", error);
      }
    });

    return () => controller.abort();
  },
});