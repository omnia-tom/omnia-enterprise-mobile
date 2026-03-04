# Dakkota Meta Catalyst — Quick Start for Testing

## Open the project in Xcode

**Path to Xcode workspace:**
```
omnia-mobile/ios/omniamobile.xcworkspace
```

**Full absolute path:**
```
/Users/aldopetruzzelli/tom-data-recording/omnia-enterprise-mobile/omnia-mobile/ios/omniamobile.xcworkspace
```

**Open from terminal:**
```bash
cd omnia-mobile/ios
open omniamobile.xcworkspace
```

> ⚠️ **Use the `.xcworkspace` file, not `.xcodeproj`** — the workspace includes Swift Package Manager dependencies (Meta Wearables DAT).

---

## Native Swift files (for Dakkota edits)

| File | Purpose |
|------|---------|
| `omnia-mobile/ios/omniamobile/MetaWearablesModule.swift` | Voice recognition (yes/no added for consent), TTS, video streaming |
| `omnia-mobile/ios/omniamobile/MetaWearablesModule.m` | React Native bridge exports |
| `omnia-mobile/ios/omniamobile/MLProcessingPipeline.swift` | Hand pose, barcode detection |

---

## Run the app

```bash
cd omnia-mobile
npx expo run:ios --device
```

Or from Xcode: select your device/simulator and press `Cmd + R`.

---

## Test the Dakkota flow

1. Log in and go to the **Account** screen (profile icon).
2. Tap **"🔧 Dakkota Assembly"**.
3. **ConsentScreen:** Audio prompt plays; say **"yes"** or **"no"** into the phone/glasses mic.
4. **WorkstationScanScreen:** Scan a QR code. For testing without physical codes, use any QR generator with payload `DAKKOTA-FBG-001` (or `DAKKOTA-{domain}-{stationId}`).
5. After scan → "Start Assembly" creates session context (Firestore integration is stubbed for now).

---

## QR code format for workstation testing

- **Format:** `DAKKOTA-{procedureId}-{stationId}`
- **Example:** `DAKKOTA-FBG-001` (Front Bumper & Grille, station 001)
- Generate at https://www.qr-code-generator.com/ or similar.
