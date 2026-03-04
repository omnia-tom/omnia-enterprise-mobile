# Clean Build & Run — Dakkota Omnia App

## VLM On-Device AI (Re-enabled for Glasses Testing)

The **mlx-swift-lm** Swift package is included for on-device Vision Language Model (VLM) inference. This enables step-by-step assembly validation during recording with Meta glasses.

- **FastVLM (VLM step validation)**: Enabled — uses MLXVLM from mlx-swift-lm for on-device AI.
- **Requirements**: iOS 18.2+, iPhone 15+ or equivalent (6 GB RAM recommended for larger models).
- **Models**: FastVLM 0.5B (default), SmolVLM2 500M, Qwen2-VL 2B, Qwen2.5-VL 3B, etc.

**If package resolution fails** (e.g. submodule clone errors):
1. In Xcode: **File → Packages → Reset Package Caches**
2. **File → Packages → Resolve Package Versions**
3. See `ios/FASTVLM_PACKAGES.md` for troubleshooting.

---

## Why You See the expo.dev Screen

The **expo.dev screen** is the Expo Dev Client launcher. It appears when the app cannot connect to Metro (the JavaScript bundler). Your Dakkota app code is fine; the app just hasn't loaded it yet.

**Fix:** Start Metro first, then open the app. The app will connect and show the Dakkota login/home flow.

---

## Step-by-Step: Clean Build & Run

### 1. Navigate to the project

```bash
cd ~/tom-data-recording/omnia-enterprise-mobile/omnia-mobile
```

### 2. (Optional) Clean Xcode DerivedData

```bash
rm -rf ~/Library/Developer/Xcode/DerivedData/omniamobile-*
```

### 3. (Optional) Clear Expo cache

```bash
rm -rf .expo
```

### 4. Build and run on a specific device

**iOS Simulator (e.g., iPhone 17):**
```bash
npx expo run:ios --device "iPhone 17"
```

**Physical device:**
```bash
npx expo run:ios --device "Aldo Boss 17 Pro Max"
```

This will:
- Build the app
- Install it on the device/simulator
- **Start Metro automatically** (important — keep this terminal open)

### 5. When the app launches

- If you see the expo.dev launcher: Metro may still be starting. Wait a few seconds; the app should connect and switch to the Dakkota splash → login → home.
- If it stays on expo.dev: Metro might not be reachable. In the launcher, try entering the URL shown in the Metro terminal (e.g. `http://192.168.x.x:8081`).

---

## Alternative: Start Metro First, Then Build

**Terminal 1 — Start Metro:**
```bash
cd ~/tom-data-recording/omnia-enterprise-mobile/omnia-mobile
npx expo start --dev-client
```

**Terminal 2 — Build & install (no need to run if app is already installed):**
```bash
cd ~/tom-data-recording/omnia-enterprise-mobile/omnia-mobile
npx expo run:ios --device "iPhone 17"
```

Keep Terminal 1 running. Launch the app on the simulator/device; it will connect to Metro and load the Dakkota app.

---

## Quick Reference

| Step | Command |
|------|---------|
| Go to project | `cd ~/tom-data-recording/omnia-enterprise-mobile/omnia-mobile` |
| Clean Xcode | `rm -rf ~/Library/Developer/Xcode/DerivedData/omniamobile-*` |
| Full clean build + run | `npx expo run:ios --device "iPhone 17"` |

**Rule:** Metro must be running for the Dev Client to load your app. If you see expo.dev, Metro isn't connected.
