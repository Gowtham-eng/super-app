# Refex Super App - iOS Setup Guide

## Prerequisites
- Mac with Xcode installed (14.0+)
- iPhone/iPad connected via USB
- Any Apple ID (free is fine for testing)
- CocoaPods installed (`sudo gem install cocoapods`)

## Steps

### 1. Download & Extract
Download the iOS project zip from:
`https://kissflow-access-hub.preview.emergentagent.com/api/uploads/RefexSuperApp-iOS.zip`

Extract it to a folder on your Mac.

### 2. Install CocoaPods Dependencies
Open Terminal, navigate to the extracted folder:
```bash
cd path/to/extracted/ios/App
pod install
```

### 3. Open in Xcode
```bash
open App.xcworkspace
```
**Important:** Open `.xcworkspace` (NOT `.xcodeproj`)

### 4. Configure Signing
1. In Xcode, click on **App** in the project navigator (left sidebar)
2. Select the **App** target
3. Go to **Signing & Capabilities** tab
4. Check **Automatically manage signing**
5. Select your **Team** (your Apple ID → "Personal Team")
6. If the Bundle Identifier has conflicts, change it to something unique like `com.refex.superapp.yourname`

### 5. Select Your Device
1. Connect your iPhone via USB
2. Trust the computer on your phone if prompted
3. In Xcode's toolbar, select your iPhone from the device dropdown

### 6. Run
1. Click the **Play** button (or press `Cmd + R`)
2. First time: Your phone will show "Untrusted Developer" - go to **Settings → General → VPN & Device Management** → Trust your developer profile
3. Run again from Xcode

## How It Works
- The app loads the Refex Super App from the web
- When you click a Kissflow tile, it opens the native Kissflow DW app
- If Kissflow isn't installed, it redirects to the App Store

## Notes
- Free Apple ID: App expires after 7 days (just re-run from Xcode)
- The app loads from the live server URL, so any web changes appear automatically
- No need to rebuild for web-side updates
