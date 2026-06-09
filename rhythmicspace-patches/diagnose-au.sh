#!/usr/bin/env bash
# Rhythmic Space AU diagnostics — run on your Mac in Terminal

set -euo pipefail

COMPONENT_USER="$HOME/Library/Audio/Plug-Ins/Components/RhythmicSpace.component"
COMPONENT_SYSTEM="/Library/Audio/Plug-Ins/Components/RhythmicSpace.component"
AU_TYPE="aumf"
AU_SUBTYPE="Rysp"
AU_MANUFACTURER="Ltha"

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
    echo "   Build Release AU, then copy to ~/Library/Audio/Plug-Ins/Components/"
    echo ""
    echo "   Build:"
    echo "   cd ~/Documents/GitHub/RhythmicSpace/Builds/MacOSX"
    echo "   xcodebuild -scheme \"RhythmicSpace - AU\" -configuration Release build"
    echo ""
    echo "   Find build output:"
    echo "   find ~/Documents/GitHub/RhythmicSpace/Builds/MacOSX/build -name RhythmicSpace.component 2>/dev/null"
    echo "   find ~/Library/Developer/Xcode/DerivedData/RhythmicSpace-*/Build/Products/Release -name RhythmicSpace.component 2>/dev/null"
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
        AU_TYPE=$(plutil -extract AudioComponents.0.type raw "$PLIST" 2>/dev/null || echo "aumf")
        echo "   → Use: auval -v $AU_TYPE $AU_SUBTYPE $AU_MANUFACTURER"
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
echo "6. Direct validation (aumf = MIDI-controlled effect)..."
auval -v "$AU_TYPE" "$AU_SUBTYPE" "$AU_MANUFACTURER" 2>&1 | tail -15

echo ""
echo "=== If NOT REGISTERED, run these fixes ==="
echo "codesign --force --deep --sign - \"$COMPONENT\""
echo "xattr -cr \"$COMPONENT\""
echo "killall -9 AudioComponentRegistrar"
echo "auval -a | grep -i Ltha"
echo ""
echo "=== If Initialize -10868 with leak detector messages ==="
echo "You have a Debug build installed. Rebuild Release and copy again."
