#!/bin/bash

# Stream Deck Utility CLI wrapper
# Usage: ./cli.sh <command> [options]

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
node "$SCRIPT_DIR/src/cli.js" "$@"
