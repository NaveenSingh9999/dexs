#!/data/data/com.termux/files/usr/bin/sh
# Launch a packaged Dexs build inside the Debian proot on the Termux X server.
# Usage: sh ~/dexs/scripts/run-desktop.sh [path/to/unpacked] [extra flags...]
APP=${1:-/root/dexs/dist/linux-arm64-unpacked/dexs}
[ $# -gt 0 ] && shift
exec /data/data/com.termux/files/usr/bin/pdrun --nogpu \
  "$APP" --no-sandbox --disable-gpu "$@"