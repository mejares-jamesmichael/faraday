---
name: omarchy-control
description: >
  Control the live Omarchy/Hyprland desktop and system controls via CLI: switch workspaces,
  launch or focus apps, move or close windows, inspect what is open, adjust workspace layouts,
  and control volume/audio, Wi-Fi, Bluetooth, display/keyboard brightness, night light,
  do-not-disturb, idle, touchpad, and power profiles. Use when the user asks things like
  "go to workspace 2", "open Spotify", "move this to workspace 3", "what's open",
  "lower the volume", "turn off Wi-Fi", "set brightness to 50%", or "toggle night light".
  NOT for editing config files, keybindings, themes, or window rules (use the `omarchy` skill
  for those).
---

# Omarchy Live Desktop Control

Control a running Omarchy (4.5+) / Hyprland (0.55+ Lua) desktop using `hyprctl` and the `omarchy` CLI.

> **Scope boundary:** This skill is strictly for **live runtime actions** (workspaces, windows, launching/focusing apps). Never edit `~/.config/hypr/*`, `/usr/share/omarchy/*`, `~/.bashrc`, or `~/.zshrc` under this skill — use the official `omarchy` skill for configuration changes.

## Reference Guides

Read these files alongside this skill when you need more detail:

- [`references/hyprctl-lua-dispatch.md`](references/hyprctl-lua-dispatch.md) — Hyprland 0.55+ Lua `hl.dsp.*` dispatcher reference & legacy-to-Lua mapping
- [`references/omarchy-launchers.md`](references/omarchy-launchers.md) — `omarchy launch`, `omarchy hyprland`, and discovery commands
- [`references/system-controls.md`](references/system-controls.md) — Audio/volume, Wi-Fi, Bluetooth, brightness, quick toggles, and power profiles
- [`references/recipes.md`](references/recipes.md) — End-to-end recipes for common requests

## Safety & Confirmation Rules

1. **Read-only inspection needs no confirmation** (`hyprctl workspaces -j`, `clients -j`, `activeworkspace -j`, `monitors -j`, `omarchy network status`, `omarchy powerprofiles list`).
2. **Confirm before destructive or disconnecting actions:**
   - Closing **all** windows (`omarchy hyprland window close all`)
   - Turning **Wi-Fi off** (`nmcli radio wifi off`) — disconnects cloud-hosted agents until re-enabled manually
   - Session/power actions (`omarchy system reboot/shutdown/logout/lock`, `hl.dsp.exit()`, `hyprctl kill`)
   - Closing a **single** window does **not** require confirmation when explicitly requested.
3. **Protect your own session:** Never close, kill, or move the terminal/window hosting this agent session unless the user explicitly asks you to.
4. **Never edit configs** under this skill.
5. **Quote all arguments** passed to shell commands to avoid shell injection from window titles or app names.
6. **Verify after acting:** Re-query `activeworkspace -j` or `clients -j` after state changes and report concisely what happened.
7. **Fail loudly:** If a command errors, show the error and check `--help` or the Hyprland wiki (`https://wiki.hypr.land/`). Never guess syntax in a loop.

## Step 1: Inspect Live State First

Always check current state before moving, focusing, or closing windows:

```bash
hyprctl activeworkspace -j
hyprctl workspaces -j | jq -c '.[] | {id, name, windows, monitor}'
hyprctl clients -j | jq -c '.[] | {address, class, workspace: .workspace.id, title}'
```

## Step 2: Core Actions

> **Critical (Hyprland 0.55+ Lua):** Legacy `hyprctl dispatch workspace 1` is **removed** and fails with `hl.dispatch: expected a dispatcher`. Always use `hl.dsp.*` Lua dispatchers.

| Intent | Command |
|---|---|
| Switch to workspace `N` | `hyprctl dispatch 'hl.dsp.focus({ workspace = N })'` |
| Next / previous workspace | `hyprctl dispatch 'hl.dsp.focus({ workspace = "m+1" })'` / `"m-1"` |
| Previous visited workspace | `hyprctl dispatch 'hl.dsp.focus({ workspace = "previous_per_monitor" })'` |
| Launch app (or focus if open) | `omarchy launch or focus <class-pattern> "<cmd>"` |
| Launch app on workspace `N` | `hyprctl dispatch 'hl.dsp.exec_cmd("<cmd>", { workspace = "N" })'` |
| Launch app silently on `N` | `hyprctl dispatch 'hl.dsp.exec_cmd("<cmd>", { workspace = "N silent" })'` |
| Focus window by address | `hyprctl dispatch 'hl.dsp.focus({ window = "address:0x..." })'` |
| Focus app by name | `omarchy hyprland focus app "<app-name>"` |
| Move specific window to `N` | `hyprctl dispatch 'hl.dsp.window.move({ workspace = "N", follow = false, window = "address:0x..." })'` |
| Move focused window to `N` | `hyprctl dispatch 'hl.dsp.window.move({ workspace = "N", follow = false })'` |
| Close focused window | `hyprctl dispatch 'hl.dsp.window.close()'` |
| Toggle floating / fullscreen | `hyprctl dispatch 'hl.dsp.window.float({ action = "toggle" })'` / `hl.dsp.window.fullscreen({ mode = "fullscreen" })` |
| Check / toggle workspace layout | `omarchy hyprland workspace layout current [id]` / `toggle` |
| Adjust / mute volume | `omarchy audio output volume <raise\|lower\|mute-toggle\|+N\|-N>` |
| Switch audio output / mute mic | `omarchy audio output switch` / `omarchy audio input mute` |
| Display / keyboard brightness | `omarchy brightness display <+N%\|N%-\|N%>` / `omarchy brightness keyboard <up\|down\|off\|restore>` |
| Wi-Fi on / off *(confirm off)* | `nmcli radio wifi on` / `nmcli radio wifi off` |
| Bluetooth on / off / toggle | `omarchy bluetooth power <on\|off\|toggle\|is-on>` |
| Night light / DND / stay-awake | `omarchy toggle nightlight` / `omarchy toggle notification silencing` / `omarchy toggle idle <stay-awake\|allow-idle\|status>` |
| Power profile | `omarchy powerprofiles set [ac\|battery] <power-saver\|balanced\|performance>` |

### Focus Behavior When Launching Apps

- **Default:** Switch to the target workspace when launching an app (`{ workspace = "N" }`).
- Only use `{ workspace = "N silent" }` if the user explicitly asks to open it silently / in the background.
- If the app is already open and the user just says **"open X"** → prefer `omarchy launch or focus` or focus its existing window.

### Common Omarchy Launchers

Prefer `omarchy launch ...` over raw binary names so default apps and styling are respected:

- Browser: `omarchy launch browser [url]`
- Editor: `omarchy launch editor <path>`
- Terminal: `omarchy launch terminal [command...]`
- Files: `omarchy launch nautilus`
- Web app: `omarchy launch webapp <url>`
- TUI app: `omarchy launch tui <command> [args...]`
- Bundled apps: `omarchy launch spotify`, `signal`, `1password`

## Troubleshooting & Maintenance

- **`hl.dispatch: expected a dispatcher`**: You used legacy Hyprland syntax instead of `hl.dsp.*`. Check [`references/hyprctl-lua-dispatch.md`](references/hyprctl-lua-dispatch.md).
- **`Target not found.` from `omarchy-shell`**: That command belongs to an optional plugin that is not installed. Do not rely on `omarchy-shell workspace-layout ...`.
- **After `omarchy update` or Hyprland upgrades**: Dispatcher and CLI signatures can change across releases. If a command breaks, check `omarchy commands --json`, `hyprctl --help`, `/usr/share/omarchy/default/hypr/bindings/tiling.lua`, and `https://wiki.hypr.land/`.
