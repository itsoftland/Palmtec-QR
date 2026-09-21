#!/bin/bash
# One-time setup: registers the palmtec:// URL scheme so the browser can
# auto-launch PalmtechDataTransfer from this downloaded tool folder.
# Run this script from PalmtechDataTransfer/protocol-handler after choosing
# the download folder in the web app. No sudo needed — installs into the
# user's own applications directory.
set -e

APPDIR="$HOME/.local/share/applications"
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
TOOL_ROOT="$(cd -- "$SCRIPT_DIR/.." && pwd)"
BUILD_SCRIPT="$TOOL_ROOT/build.sh"
TOOL_EXE="$TOOL_ROOT/dist/PalmtechDataTransfer"

# The downloaded folder normally ships a prebuilt binary; only build when missing.
if [ ! -f "$TOOL_EXE" ]; then
  echo "PalmtechDataTransfer not found. Building it..."
  if [ ! -f "$BUILD_SCRIPT" ]; then
    echo "Build script not found: $BUILD_SCRIPT" >&2
    exit 1
  fi
  if ! bash "$BUILD_SCRIPT"; then
    echo "PalmtechDataTransfer build failed. The launcher was not registered." >&2
    exit 1
  fi
  if [ ! -f "$TOOL_EXE" ]; then
    echo "Build completed but executable was not found: $TOOL_EXE" >&2
    exit 1
  fi
fi

mkdir -p "$APPDIR"

cat > "$APPDIR/palmtec-launcher.sh" <<EOF
#!/bin/bash
if [ ! -f "$TOOL_EXE" ]; then
  echo "PalmtechDataTransfer not found: $TOOL_EXE" >&2
  exit 1
fi
chmod +x "$TOOL_EXE"
exec "$TOOL_EXE" "\$@"
EOF
chmod +x "$APPDIR/palmtec-launcher.sh"

cat > "$APPDIR/palmtec-launcher.desktop" <<EOF
[Desktop Entry]
Type=Application
Name=Palmtec Launcher
Exec=/bin/bash "$APPDIR/palmtec-launcher.sh" %u
NoDisplay=true
StartupNotify=false
MimeType=x-scheme-handler/palmtec;
EOF

update-desktop-database "$APPDIR" 2>/dev/null || true
xdg-mime default palmtec-launcher.desktop x-scheme-handler/palmtec

echo "Palmtec protocol handler registered."
echo "Registered executable: $TOOL_EXE"
echo "The web app can now launch the tool from the selected download folder."
