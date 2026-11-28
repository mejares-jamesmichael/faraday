# System Controls (Omarchy CLI & `nmcli`)

Verified on **Omarchy 4.5.0-3**. All commands below are native — no extra MCP or plugins required.

## Audio & Volume

```bash
# Output volume (triggers Omarchy OSD)
omarchy audio output volume raise
omarchy audio output volume lower
omarchy audio output volume mute-toggle
omarchy audio output volume +10
omarchy audio output volume -10

# Switch between audio output devices (speakers, headphones, etc.)
omarchy audio output switch

# Toggle microphone mute (also drives laptop mic-mute LED if supported)
omarchy audio input mute

# Cycle media source
omarchy audio source switch [next|previous]
```

## Wi-Fi & Network

> **Confirm before turning Wi-Fi off:** Disabling Wi-Fi immediately disconnects cloud-hosted agents until the user turns it back on manually.

```bash
# Check Wi-Fi / network status
nmcli radio wifi
omarchy network status [--verbose]

# Turn Wi-Fi on or off
nmcli radio wifi on
nmcli radio wifi off          # ASK CONFIRMATION FIRST

# Unblock & restart Wi-Fi service
omarchy restart wifi
```

## Display & Keyboard Brightness

```bash
# Focused display brightness
omarchy brightness display              # Show current brightness
omarchy brightness display 50%          # Set to 50%
omarchy brightness display +10%         # Increase by 10%
omarchy brightness display 10%-         # Decrease by 10%
omarchy brightness display off          # Turn display off
omarchy brightness display on           # Turn display on

# Keyboard backlight
omarchy brightness keyboard up
omarchy brightness keyboard down
omarchy brightness keyboard cycle
omarchy brightness keyboard off
omarchy brightness keyboard restore
```

## Bluetooth

```bash
# Power state (remembered across reboots)
omarchy bluetooth power on
omarchy bluetooth power off
omarchy bluetooth power toggle
omarchy bluetooth power is-on

# Device management
omarchy bluetooth device connect <address>
omarchy bluetooth device disconnect <address>
omarchy bluetooth device pair <address>
```

## Quick Desktop Toggles

```bash
# Night light (screen color temperature)
omarchy toggle nightlight [--status]

# Do Not Disturb (silence notifications)
omarchy toggle notification silencing

# Idle / stay-awake
omarchy toggle idle status
omarchy toggle idle stay-awake
omarchy toggle idle allow-idle
omarchy toggle idle toggle

# Input & UI toggles
omarchy toggle touchpad [on|off|toggle]
omarchy toggle touchscreen [on|off|toggle]
omarchy toggle bar [on|off|toggle]
omarchy toggle fullscreen desktop [on|off|toggle]
omarchy toggle animations [on|off|toggle]
```

## Power Profiles

```bash
# List available profiles & active state
omarchy powerprofiles list --active-state

# Set profile (optional scope: autodetect | ac | battery)
omarchy powerprofiles set power-saver
omarchy powerprofiles set balanced
omarchy powerprofiles set performance
```
