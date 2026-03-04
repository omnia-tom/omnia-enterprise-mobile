# FastVLM and Xcode Package Dependencies

## Why You Can't Add `apple/ml-fastvlm` Directly in Xcode

**[apple/ml-fastvlm](https://github.com/apple/ml-fastvlm)** is a **Python project**, not a Swift Package. It has:

- Python/PyTorch training and inference code
- Conda/pip setup (`pip install -e .`)
- **No `Package.swift`** at the repo root

Xcode’s "Add Package Dependency" only works with Swift Package Manager, which requires a `Package.swift`. So adding `https://github.com/apple/ml-fastvlm.git` will fail because the repo is not set up as a Swift package.

---

## How Your Project Uses FastVLM

Your app already has FastVLM support via these Swift packages:

| Package | URL | Purpose |
|---------|-----|---------|
| **mlx-swift** | `https://github.com/ml-explore/mlx-swift` | MLX runtime for Apple Silicon |
| **mlx-swift-lm** | `https://github.com/ml-explore/mlx-swift-lm` | LLMs and VLMs, including **FastVLM** via `VLMRegistry.fastvlm` |

`FastVLMService.swift` uses `VLMRegistry.fastvlm` from **MLXVLM** (part of mlx-swift-lm). The Apple ml-fastvlm repo provides the training and research; mlx-swift-lm provides the Swift runtime and model support for on-device inference.

---

## If You See Package Resolution Errors

Try these in order:

### 1. Reset and resolve packages in Xcode

1. **File → Packages → Reset Package Caches**
2. **File → Packages → Resolve Package Versions**
3. Build (⌘B)

### 2. From the command line

```bash
cd omnia-mobile/ios
xcodebuild -resolvePackageDependencies -workspace omniamobile.xcworkspace -scheme omniamobile
```

### 3. Delete Derived Data

1. **Xcode → Settings → Locations → Derived Data**
2. Click the path to open in Finder
3. Delete the `omniamobile-*` folder
4. In Xcode: **File → Packages → Resolve Package Versions**
5. Build again

### 4. Ensure minimum versions

Your `project.pbxproj` currently has:

- **mlx-swift** ≥ 0.30.6
- **mlx-swift-lm** ≥ 2.30.3

If needed, bump these in Xcode (Project → Package Dependencies → select package → Update to Latest).

---

## If You Need Code from Apple’s ml-fastvlm Repo

Apple’s repo has an [`app`](https://github.com/apple/ml-fastvlm/tree/main/app) folder for iOS/Mac inference. To reuse it you must:

1. Clone the repo locally:  
   `git clone https://github.com/apple/ml-fastvlm.git`
2. Inspect `app/` for Swift/Objective‑C and any Xcode project
3. Copy or vendor the parts you need into your own target (there is no SPM `Package.swift` for this)

---

## Summary

| What | Action |
|------|--------|
| FastVLM model support | Use **mlx-swift-lm** (already in the project) |
| Training or Python inference | Use **apple/ml-fastvlm** separately |
| Swift/iOS code from Apple’s `app` folder | Clone repo and copy code manually |

---

*References: [apple/ml-fastvlm](https://github.com/apple/ml-fastvlm), [ml-explore/mlx-swift-lm](https://github.com/ml-explore/mlx-swift-lm)*
