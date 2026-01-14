# Stream Deck Utility

A command-line utility for managing Stream Deck profiles across multiple devices. This tool addresses a limitation in Elgato's Stream Deck software, which only allows copying individual profiles one at a time.

## Features

- List all Stream Deck devices and their profiles
- Copy individual profiles between devices
- Copy all profiles from one device to another in a single operation
- Automatically remap profile references (for "Switch Profile" buttons)
- Preserve device preferences (default profile, sort order)
- Delete profiles with confirmation prompts

## Installation

```bash
npm install
```

## Usage

Run commands using the wrapper script:

```bash
./cli.sh <command> [options]
```

Or directly with Node:

```bash
node src/cli.js <command> [options]
```

### Device Commands

#### List all devices

```bash
./cli.sh devices list
```

Shows all connected Stream Deck devices with their names, models, UUIDs, and profile counts.

#### Show device details

```bash
./cli.sh devices info <uuid>
```

Displays detailed information about a specific device, including all profiles assigned to it.

### Profile Commands

#### List all profiles

```bash
./cli.sh profiles list
./cli.sh profiles list --device <uuid>
```

Lists all profiles, optionally filtered by device UUID.

#### Show profile details

```bash
./cli.sh profiles info <profileId>
```

Displays detailed information about a specific profile, including pages and action counts.

#### Copy a single profile

```bash
./cli.sh profiles copy <profileId> --to-device <uuid>
```

Copies a profile to another device.

#### Copy all profiles between devices

```bash
./cli.sh profiles copy-all --from-device <uuid> --to-device <uuid>
```

Copies all profiles from one device to another. This command:

- Copies all profile directories
- Remaps internal profile references (so "Switch Profile" buttons work correctly)
- Copies device preferences (default profile, sort order)

**Options:**

- `-r, --replace` - Delete existing profiles on target device before copying
- `-y, --yes` - Skip confirmation prompts

**Examples:**

```bash
# Copy all profiles, keeping existing ones on target
./cli.sh profiles copy-all -f '@(1)[4057/143/SOURCE]' -t '@(1)[4057/143/TARGET]'

# Replace all profiles on target device
./cli.sh profiles copy-all -f '@(1)[4057/143/SOURCE]' -t '@(1)[4057/143/TARGET]' --replace

# Replace without confirmation prompts
./cli.sh profiles copy-all -f '@(1)[4057/143/SOURCE]' -t '@(1)[4057/143/TARGET]' --replace --yes
```

#### Delete a profile

```bash
./cli.sh profiles delete <profileId>
./cli.sh profiles delete <profileId> --yes
```

Deletes a single profile. Use `--yes` or `-y` to skip the confirmation prompt.

## How It Works

Stream Deck profiles are stored in:

```
~/Library/Application Support/com.elgato.StreamDeck/ProfilesV3/
```

Each profile is a `.sdProfile` directory containing:

- `manifest.json` - Profile metadata and device binding
- `Profiles/` - Subdirectory containing page definitions

Device preferences (default profile, sort order) are stored in the macOS preferences system:

```
~/Library/Preferences/com.elgato.StreamDeck.plist
```

When copying profiles, this utility:

1. Copies the profile directory with a new UUID
2. Updates the device binding in the manifest
3. Remaps any "Switch Profile" action references to point to the new profile UUIDs
4. Copies device preferences with remapped profile references

## Notes

- After making changes, restart the Stream Deck app to see updates
- Profile UUIDs are case-insensitive but stored in uppercase
- The tool reads device names from the Elgato preferences plist

## Requirements

- Node.js 18+
- macOS (uses PlistBuddy for preference management)
- Stream Deck software installed

## License

MIT
