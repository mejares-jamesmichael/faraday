# Common Desktop Control Recipes

## 1. "What's open right now?"

```bash
hyprctl activeworkspace -j | jq -c '{active_workspace: .id, monitor}'
hyprctl clients -j | jq -c 'sort_by(.workspace.id) | .[] | {ws: .workspace.id, class, title, address}'
```

Summarize cleanly by workspace number.

## 2. "Switch to workspace 2"

```bash
hyprctl dispatch 'hl.dsp.focus({ workspace = 2 })'
hyprctl activeworkspace -j | jq -c '{id, monitor, windows}'
```

## 3. "Go to workspace 2 and open my browser"

```bash
hyprctl dispatch 'hl.dsp.focus({ workspace = 2 })'
hyprctl dispatch 'hl.dsp.exec_cmd("omarchy launch browser", { workspace = "2" })'
```

Or, if you want to focus an already-open browser instead of opening a second window:

```bash
omarchy launch or focus chromium "omarchy launch browser"
```

## 4. "Open Spotify on workspace 3 without switching away"

```bash
hyprctl dispatch 'hl.dsp.exec_cmd("omarchy launch spotify", { workspace = "3 silent" })'
```

## 5. "Move Chrome / Messenger to workspace 4"

1. Find its address first:
   ```bash
   hyprctl clients -j | jq -c '.[] | {address, class, ws: .workspace.id, title}'
   ```
2. Move that specific window (without stealing focus unless asked):
   ```bash
   hyprctl dispatch 'hl.dsp.window.move({ workspace = "4", follow = false, window = "address:0x..." })'
   ```
3. Verify it landed on workspace 4:
   ```bash
   hyprctl clients -j | jq -c '.[] | select(.address == "0x...") | {ws: .workspace.id, title}'
   ```

## 6. "Close Spotify" (single window)

1. Find its address in `hyprctl clients -j` (verify it is **not** the agent's own terminal).
2. Focus it and close it:
   ```bash
   hyprctl dispatch 'hl.dsp.focus({ window = "address:0x..." })'
   hyprctl dispatch 'hl.dsp.window.close()'
   ```
3. Verify it is gone from `hyprctl clients -j`.

## 7. "Close everything"

**Stop and ask the user for confirmation first.** Only after they confirm:

```bash
omarchy hyprland window close all
```
