#!/bin/zsh
# Builds Lightbox and installs it on an iPhone plugged in by cable, then launches it.
#   lightbox-ios/install.sh            # the first connected iPhone
#   lightbox-ios/install.sh <UDID>     # a particular device (xcrun devicectl list devices)
# Needs: Xcode signed in to team 7FR35W6Q64, XcodeGen (brew install xcodegen), and the phone in Developer Mode
# and trusting this Mac. The game's files are taken from ../lightbox as they are right now.
set -e
cd "${0:A:h}"
BUNDLE=com.stevenhester.lightbox

DEVICE=$1
if [[ -z $DEVICE ]]; then
	DEVICE=$(xcrun devicectl list devices 2>/dev/null | awk '/connected/ && /iPhone/ { for (i = 1; i <= NF; i++) if ($i ~ /^[0-9A-F]{8}-[0-9A-F]{16}$/) { print $i; exit } }')
fi
if [[ -z $DEVICE ]]; then
	echo "No connected iPhone found. Plug it in, unlock it, and tap Trust if asked." >&2
	exit 1
fi

echo "==> Making the Xcode project"
xcodegen generate

echo "==> Building and signing (log: build/xcodebuild.log)"
mkdir -p build
xcodebuild -project Lightbox.xcodeproj -scheme Lightbox -configuration Release \
	-destination "id=$DEVICE" -allowProvisioningUpdates -derivedDataPath build/dd build \
	> build/xcodebuild.log 2>&1 || { grep -E 'error:' build/xcodebuild.log | head -20; exit 1; }

echo "==> Installing"
xcrun devicectl device install app --device "$DEVICE" build/dd/Build/Products/Release-iphoneos/Lightbox.app
echo "==> Launching"
xcrun devicectl device process launch --device "$DEVICE" --terminate-existing $BUNDLE || \
	echo "Installed. If it didn't open, the phone may be locked: open Lightbox from the home screen."
