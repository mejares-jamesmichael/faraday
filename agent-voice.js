import { spawn } from "node:child_process";
import { Plugin } from "@opencode/plugin";

const MAX_CHARS = 1600;
const seenMessages = new Set();
const sessionText = new Map();
const speechQueue = [];
let speaking = false;

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
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_CHARS);
}

function speak(text) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    let child;
    try {
      child = spawn("espeak-ng", ["--stdin"], {
        stdio: ["pipe", "ignore", "ignore"],
      });
    } catch (error) {
      finish({ error });
      return;
    }

    child.once("error", (error) => finish({ error }));
    child.once("close", (code, signal) => finish({ code, signal }));
    child.stdin.end(text);
  });
}

function enqueueSpeech(text) {
  return new Promise((resolve) => {
    speechQueue.push({ text, resolve });
    void drainSpeechQueue();
  });
}

async function drainSpeechQueue() {
  if (speaking) return;
  speaking = true;

  try {
    while (speechQueue.length > 0) {
      const job = speechQueue.shift();
      const result = await speak(job.text);
      if (result.error) {
        console.error("[agent-voice] Could not start espeak-ng:", result.error.message);
      } else if (result.code !== 0) {
        console.error("[agent-voice] espeak-ng exited unsuccessfully:", result);
      }
      job.resolve(result);
    }
  } finally {
    speaking = false;
    if (speechQueue.length > 0) void drainSpeechQueue();
  }
}

function collectTextEvent(event) {
  const data = event?.data ?? event?.properties ?? {};
  const { sessionID, assistantMessageID, ordinal, text } = data;
  if (!sessionID || !assistantMessageID || typeof text !== "string") return;

  let current = sessionText.get(sessionID);
  if (!current || current.messageID !== assistantMessageID) {
    current = { messageID: assistantMessageID, parts: new Map() };
    sessionText.set(sessionID, current);
  }
  current.parts.set(Number(ordinal) || 0, text);
}

async function speakCompletedAnswer(sessionID) {
  const current = sessionText.get(sessionID);
  sessionText.delete(sessionID);
  if (!current) {
    console.error("[agent-voice] No assistant text events captured for completed response");
    return;
  }

  const rawText = [...current.parts.entries()]
    .sort(([a], [b]) => a - b)
    .map(([, text]) => text)
    .join("\n");
  const text = cleanText(rawText);
  if (!text) return;

  const key = `${sessionID}:${current.messageID}`;
  if (seenMessages.has(key)) return;
  seenMessages.add(key);
  if (seenMessages.size > 500) seenMessages.clear();

  await enqueueSpeech(`OpenCode: ${text}`);
}

export default Plugin.define({
  id: "agent-voice.opencode",

  async setup(ctx) {
    const controller = new AbortController();

    await ctx.command.transform((editor) => {
      editor.add({
        name: "agent-voice-test",
        description: "Speak a short eSpeak NG test phrase",
        execute: async () => {
          await enqueueSpeech("OpenCode voice test. If you hear this, speech playback works.");
        },
      });
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
          if (sessionID) sessionText.delete(sessionID);
          continue;
        }

        if (event?.type === "session.text.ended") {
          collectTextEvent(event);
          continue;
        }

        const sessionID = eventSessionID(event);
        if (!sessionID) {
          console.error("[agent-voice] Completion event did not include a session ID");
          continue;
        }

        try {
          await speakCompletedAnswer(sessionID);
        } catch (error) {
          console.error("[agent-voice] Could not speak final response:", error);
        }
      }
    })().catch((error) => {
      if (!controller.signal.aborted) {
        console.error("[agent-voice] Completion listener stopped:", error);
      }
    });

    return () => controller.abort();
  },
});
