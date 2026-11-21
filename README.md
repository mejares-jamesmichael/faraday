# Faraday — OpenCode Text-to-Speech Plugin

Speaks OpenCode's final assistant answers aloud on Linux (Omarchy) using local
[Piper](https://github.com/OHF-Voice/piper1-gpl) TTS, with an `espeak-ng` fallback.

- Local, private speech synthesis — no cloud TTS.
- One voice, one utterance: per-message and text-hash deduplication.
- Serialized playback queue, so answers never talk over each other.
- Graceful fallback to `espeak-ng` when Piper or the audio player is unavailable.

## What it does

1. Listens for OpenCode session events:
   - `session.execution.started`
   - `session.text.ended`
   - `session.execution.succeeded`
2. Buffers streamed assistant text parts by message ID and ordinal.
3. On a successful completion, joins the parts, cleans Markdown, prefixes the
   answer with **"Faraday:"**, and enqueues it for speech.
4. Plays the answer through Piper → `paplay`, falling back to `espeak-ng`.

Only **final answers** are spoken. Reasoning and tool output are ignored.

## Requirements

| Component | Purpose |
|---|---|
| OpenCode v2 | Host harness |
| `piper` (Piper TTS) | Local neural TTS |
| `en_US-amy-medium.onnx` + `.onnx.json` | Voice model |
| `paplay` (PulseAudio / PipeWire) | Raw PCM playback |
| `espeak-ng` | Fallback TTS |

### Install Piper with `uv`

```bash
uv tool install --python 3.13 piper-tts
```

This installs `~/.local/bin/piper` with its own isolated Python environment.

### Download the Amy voice

```bash
mkdir -p ~/.local/share/piper-voices
curl -fsSL -o ~/.local/share/piper-voices/en_US-amy-medium.onnx \
  'https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/amy/medium/en_US-amy-medium.onnx'
curl -fsSL -o ~/.local/share/piper-voices/en_US-amy-medium.onnx.json \
  'https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/amy/medium/en_US-amy-medium.onnx.json'
```

The model is 22,050 Hz, mono, 16-bit PCM.

### Install the plugin

```bash
mkdir -p ~/.config/opencode/plugins
cp faraday-voice.js ~/.config/opencode/plugins/faraday-voice.js
```

### Restart OpenCode's background service

```bash
opencode service restart
```

Plugin JavaScript is evaluated when the background service starts.
`opencode reload` reloads configuration but **not** plugin code. OpenCode also
watches plugin files and hot-reloads them, but a service restart is the reliable
way to pick up changes.

Verify discovery with:

```bash
opencode plugin list
```

## Configuration

All settings are environment variables read by the plugin:

| Variable | Default | Purpose |
|---|---|---|
| `FARADAY_TTS_PIPER_BIN` | `~/.local/bin/piper` | Piper executable |
| `FARADAY_TTS_PIPER_MODEL` | `~/.local/share/piper-voices/en_US-amy-medium.onnx` | Voice model path |
| `FARADAY_TTS_PLAYER_BIN` | `paplay` | Audio player |
| `FARADAY_TTS_PLAYER_ARGS` | `--raw --format=s16le --rate=22050 --channels=1` | Player arguments |

If you switch to a different Piper voice, update `FARADAY_TTS_PLAYER_ARGS` to match
that model's sample rate and channel count (see the voice's `.onnx.json`).

**Legacy environment variables** (`AGENT_TTS_*`) are also supported as fallbacks,
so existing configurations continue to work without changes.

The spoken prefix is set in `speakCompletedAnswer()`:

```js
const spoken = `Faraday: ${text}`;
```

## Commands

- `/faraday-test` — speaks "Faraday voice test. If you hear this, speech playback works."
- `/agent-voice-test` — **alias** for `/faraday-test`, kept for legacy support

## How it works

### Event flow

1. `session.execution.started` clears buffered text for that session.
2. `session.text.ended` stores text keyed by `assistantMessageID` + `ordinal`.
   Duplicate ordinals overwrite rather than append.
3. `session.execution.succeeded` joins the parts in ordinal order, cleans the
   text, deduplicates, and enqueues it.

### Deduplication

- **Per message:** `seenMessages` keyed by `${sessionID}:${messageID}`.
- **Per text:** `claimSpeech()` SHA-256 hashes the spoken text and suppresses the
  same text within a 3-second window. This catches duplicate completions with
  different message IDs.

### Multi-instance safety

OpenCode instantiates a global plugin **once per active location/project**. All
instances share the same server process, so mutable state is stored on
`globalThis` under `Symbol.for("faraday-voice.opencode.shared")`:

```js
const state = (globalThis[STATE_KEY] ??= {
  seenMessages: new Set(),
  sessionText: new Map(),
  speechQueue: [],
  speaking: false,
  recentSpeech: new Map(),
});
```

This gives every instance one dedupe set, one text buffer, and one speech queue.
Without it, each location would spawn its own Piper and you would hear the same
answer two or three times.

### Speech queue

`enqueueSpeech()` pushes jobs onto a shared queue. `drainSpeechQueue()` runs one
utterance at a time, so overlapping answers wait their turn.

### Markdown cleanup

`cleanText()` removes:

- fenced code blocks and inline code
- Markdown links and bare URLs
- emoji and pictographs
- headings, bullets, blockquotes, and numbered-list markers
- `**bold**`, `__bold__`, `*italic*`, `_italic_`, and `~~strikethrough~~`
- leftover `*` characters

Text is collapsed to single spaces and truncated to 1,600 characters.

### Fallback

`speak()` first tries Piper piped into the player. If any of the following
happens, it logs the failure and speaks through `espeak-ng --stdin`:

- Piper is missing (`ENOENT`)
- Piper exits non-zero (for example, a missing model file)
- The audio player fails to start

If Piper succeeds but the player exits non-zero mid-playback, the error is
logged but no fallback runs — this avoids replaying audio that was already
partly heard.

## Troubleshooting

### It sounds robotic / wrong voice

Piper is failing and `espeak-ng` is being used. Test the chain manually:

```bash
echo "test" | ~/.local/bin/piper \
  -m ~/.local/share/piper-voices/en_US-amy-medium.onnx \
  --output-raw |
paplay --raw --format=s16le --rate=22050 --channels=1
```

### No sound at all

- Confirm `paplay` works: `paplay /usr/share/sounds/alsa/Front_Center.wav`
- Confirm the model sample rate matches `FARADAY_TTS_PLAYER_ARGS`.
- Confirm `espeak-ng` is installed as a fallback.

### Plugin changes do not take effect

Run `opencode service restart`. Reloading configuration or restarting only the
TUI window does not re-evaluate plugin JavaScript.

### Two voices speaking the same answer

This is why shared `globalThis` state exists. If it recurs:

1. Confirm only one `faraday-voice.js` exists:
   ```bash
   find ~ -name faraday-voice.js -not -path '*/node_modules/*'
   ```
2. Restart the service: `opencode service restart`.
3. Check active locations: `opencode api get /api/debug/location`.

### It says "asterisk"

Inline Markdown is stripped by `cleanText()`. If a new syntax appears, extend the
regex chain there.

## Design notes

- **No daemon, no systemd service.** Speech is spawned per utterance.
- **Latency:** Piper model load adds roughly 0.8 s before audio starts; playback
  is local, so there is no network round-trip.
- **Privacy:** speech never leaves the machine. The only network access is the
  one-time model download.
- **Voice input:** this plugin only handles output. Superwhisper remains the
  dictation/input layer and is unchanged.

## Files

| File | Description |
|---|---|
| `faraday-voice.js` | OpenCode plugin |
| `README.md` | This document |

## License

Personal use. No license specified.