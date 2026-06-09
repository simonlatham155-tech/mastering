#!/usr/bin/env bash
# Rhythmic Space AU diagnostics — run on your Mac in Terminal

set -euo pipefail

COMPONENT_USER="$HOME/Library/Audio/Plug-Ins/Components/RhythmicSpace.component"
COMPONENT_SYSTEM="/Library/Audio/Plug-Ins/Components/RhythmicSpace.component"

echo "=== Rhythmic Space AU Diagnostics ==="
echo ""

echo "1. Looking for RhythmicSpace.component..."
FOUND=0
for path in "$COMPONENT_USER" "$COMPONENT_SYSTEM"; do
    if [[ -d "$path" ]]; then
        echo "   FOUND: $path"
        FOUND=1
        COMPONENT="$path"
    else
        echo "   not found: $path"
    fi
done

if [[ $FOUND -eq 0 ]]; then
    echo ""
    echo "   ERROR: No RhythmicSpace.component installed."
    echo "   Build RhythmicSpace - AU in Xcode (Release), then:"
    echo "   cp -R ~/Documents/GitHub/RhythmicSpace/Builds/MacOSX/build/Release/RhythmicSpace.component \\"
    echo "         ~/Library/Audio/Plug-Ins/Components/"
    exit 1
fi

echo ""
echo "2. Bundle structure..."
EXEC="$COMPONENT/Contents/MacOS/RhythmicSpace"
if [[ -f "$EXEC" ]]; then
    echo "   Executable: OK"
    file "$EXEC"
    lipo -info "$EXEC" 2>/dev/null || true
else
    echo "   ERROR: Missing executable at $EXEC"
    echo "   The .component bundle is incomplete — rebuild AU target in Xcode."
    ls -la "$COMPONENT/Contents/MacOS/" 2>/dev/null || echo "   (MacOS folder missing)"
fi

echo ""
echo "3. Info.plist AudioComponents entry..."
PLIST="$COMPONENT/Contents/Info.plist"
if [[ -f "$PLIST" ]]; then
    if plutil -p "$PLIST" 2>/dev/null | grep -q AudioComponents; then
        echo "   AudioComponents: OK"
        plutil -p "$PLIST" | grep -A30 "AudioComponents" | head -35
    else
        echo "   ERROR: Info.plist has NO AudioComponents section."
        echo "   Open RhythmicSpace.jucer → confirm AU is enabled → Save and Open in IDE → rebuild AU."
    fi
else
    echo "   ERROR: Info.plist missing"
fi

echo ""
echo "4. Code signature..."
codesign -dv --verbose=2 "$COMPONENT" 2>&1 | head -8 || echo "   WARNING: Not signed (run: codesign --force --deep --sign - \"$COMPONENT\")"

echo ""
echo "5. System AU registry (looking for Ltha / Rysp)..."
auval -a 2>/dev/null | grep -iE "Ltha|Rysp|Rhythmic" || echo "   NOT REGISTERED — macOS cannot see this AU"

echo ""
echo "6. Direct validation..."
auval -v aufx Rysp Ltha 2>&1 | tail -15

echo ""
echo "=== If NOT REGISTERED, run these fixes ==="
echo "codesign --force --deep --sign - \"$COMPONENT\""
echo "xattr -cr \"$COMPONENT\""
echo "killall -9 AudioComponentRegistrar"
echo "auval -a | grep -i Ltha"
