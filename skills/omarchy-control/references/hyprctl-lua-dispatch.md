# Hyprland 0.55+ Lua `hyprctl dispatch` Reference

Tested on **Hyprland 0.56.2** / **Omarchy 4.5.0-3**.

Hyprland 0.55+ replaced string dispatchers (`hyprctl dispatch workspace 1`) with Lua `hl.dsp.*` dispatcher tables. Passing legacy syntax fails with:

```text
error: return hl.dispatch(...):1: hl.dispatch: expected a dispatcher (e.g. hl.dsp.window.close())
```

## Legacy-to-Lua Mapping

| Legacy (`< 0.55`) | Hyprland 0.55+ Lua (`hyprctl dispatch '...'`) |
|---|---|
| `workspace 3` | `hl.dsp.focus({ workspace = 3 })` |
| `workspace m+1` | `hl.dsp.focus({ workspace = "m+1" })` |
| `workspace m-1` | `hl.dsp.focus({ workspace = "m-1" })` |
| `workspace previous` | `hl.dsp.focus({ workspace = "previous_per_monitor" })` |
| `focuswindow address:0x...` | `hl.dsp.focus({ window = "address:0x..." })` |
| `focusmonitor eDP-1` | `hl.dsp.focus({ monitor = "eDP-1" })` |
| `exec cmd` | `hl.dsp.exec_cmd("cmd")` |
| `exec [workspace 2 silent] cmd` | `hl.dsp.exec_cmd("cmd", { workspace = "2 silent" })` |
| `movetoworkspace 2` | `hl.dsp.window.move({ workspace = "2", follow = true })` |
| `movetoworkspacesilent 2` | `hl.dsp.window.move({ workspace = "2", follow = false })` |
| `killactive` | `hl.dsp.window.close()` |
| `togglefloating` | `hl.dsp.window.float({ action = "toggle" })` |
| `fullscreen 0` | `hl.dsp.window.fullscreen({ mode = "fullscreen" })` |
| `fullscreen 1` | `hl.dsp.window.fullscreen({ mode = "maximized" })` |
| `togglespecialworkspace scratchpad` | `hl.dsp.workspace.toggle_special("scratchpad")` |

## Targeting a Specific Window or Monitor

Omarchy's own Hyprland Lua modules (`/usr/share/omarchy/default/hypr/monitor-workspaces.lua`) use these exact forms:

```bash
# Focus a specific window by address (get address from `hyprctl clients -j`)
hyprctl dispatch 'hl.dsp.focus({ window = "address:0x55b3bcb07140" })'

# Move a specific window to workspace 2 without following focus
hyprctl dispatch 'hl.dsp.window.move({ workspace = "2", follow = false, window = "address:0x55b3bcb07140" })'

# Move a workspace to another monitor
hyprctl dispatch 'hl.dsp.workspace.move({ workspace = "2", monitor = "DP-1" })'

# Move a window to scratchpad silently
hyprctl dispatch 'hl.dsp.window.move({ workspace = "special:scratchpad", follow = false })'
```

## Notes on `hl.dsp.exec_cmd`

- Argument 1 must be a string command (`"omarchy launch browser"`). Passing a table as argument 1 fails with `bad argument 1: expected string, got table`.
- Optional argument 2 is a rules table, e.g. `{ workspace = "2 silent" }` or `{ workspace = "2" }`.
- Some Electron/Chromium or single-instance apps reuse an existing process and ignore spawn rules; for those, check `hyprctl clients -j` after launching and move the window by `address` if needed.

## Authoritative Local & Upstream Sources

- Local bindings reference: `/usr/share/omarchy/default/hypr/bindings/tiling.lua`
- Local workspace logic: `/usr/share/omarchy/default/hypr/monitor-workspaces.lua`
- Upstream wiki: <https://wiki.hypr.land/>
