# Omarchy CLI Launchers & Window Commands

Omarchy exposes its desktop actions via the `omarchy` command center (`omarchy commands --json` for the complete live catalog).

## Application Launchers (`omarchy launch`)

```bash
# Core default apps
omarchy launch browser [url]
omarchy launch editor [--inline] <path>
omarchy launch terminal [command...]
omarchy launch nautilus              # Files
omarchy launch nautilus cwd          # Files in current terminal's directory

# Smart launch-or-focus (avoids duplicate windows)
omarchy launch or focus <window-pattern> <launch-command>
omarchy launch or focus tui [--app-id=<app-id>] <command> [args...]
omarchy launch or focus webapp <window-pattern> <url-and-flags...>

# Web apps & TUIs
omarchy launch webapp <url>
omarchy launch tui [--app-id=<app-id>] <command> [args...]

# Bundled optional apps
omarchy launch spotify
omarchy launch signal
omarchy launch 1password
```

## Window & Workspace Layout Controls (`omarchy hyprland`)

```bash
# Focus an app window by identity
omarchy hyprland focus app <app-name>

# Workspace layouts (dwindle | scrolling | floating)
omarchy hyprland workspace layout current [workspace-id]
omarchy hyprland workspace layout toggle [back]
omarchy hyprland workspace layout default [dwindle|scrolling|floating]

# Window visual controls
omarchy hyprland window tiled fullscreen toggle
omarchy hyprland window minimize [window-address]
omarchy hyprland window gaps toggle
omarchy hyprland window transparency [opaque|transparent|glassy|toggle]

# Destructive — ALWAYS ask confirmation first
omarchy hyprland window close all [--wait]
```

## Discovery

Whenever you aren't sure whether a command exists or what flags it accepts:

```bash
omarchy <group> --help
omarchy <group> <command> --help
omarchy commands --json
```

> **Note:** Omarchy has **no** built-in `omarchy workspace switch` command, and `omarchy-shell workspace-layout ...` only exists if the third-party `bjarneo/omarchy-workspace-layout` plugin is installed. Use `hyprctl dispatch 'hl.dsp.focus(...)'` for workspace switching.
