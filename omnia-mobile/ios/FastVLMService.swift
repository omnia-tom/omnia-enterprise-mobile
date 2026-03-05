import Foundation
import CoreImage
import CoreGraphics

#if canImport(MLX) && canImport(MLXVLM)
import MLX
import MLXLMCommon
import MLXVLM
#endif

/// Singleton wrapper around FastVLM (MLX Swift) for on-device vision-language inference.
/// Requires iOS 18.2+ and iPhone 15+ (6 GB RAM). Falls back gracefully on older devices.
@available(iOS 18.2, *)
final class FastVLMService {

  static let shared = FastVLMService()

  private init() {}

  #if canImport(MLX) && canImport(MLXVLM)

  private var modelContainer: ModelContainer?
  private var isLoading = false

  /// The currently selected model key. Defaults to "fastvlm".
  private(set) var currentModelKey: String = "fastvlm"

  /// Whether the model has been loaded and is ready for inference.
  var isModelLoaded: Bool { modelContainer != nil }

  /// All models suitable for on-device mobile inference, keyed by short name.
  static let availableModels: [(key: String, label: String, size: String, config: ModelConfiguration)] = [
    ("fastvlm",    "FastVLM 0.5B",     "~500MB", VLMRegistry.fastvlm),
    ("smolvlm",    "SmolVLM2 500M",    "~500MB", VLMRegistry.smolvlm),
    ("qwen2vl2b",  "Qwen2-VL 2B",      "~1.5GB", VLMRegistry.qwen2VL2BInstruct4Bit),
    ("qwen25vl3b", "Qwen2.5-VL 3B",    "~2GB",   VLMRegistry.qwen2_5VL3BInstruct4Bit),
    ("gemma3_4b",  "Gemma3 4B",         "~2.5GB", VLMRegistry.gemma3_4B_qat_4bit),
    ("lfm25vl",    "LFM2.5-VL 1.6B",   "~1GB",   VLMRegistry.lfm2_5_vl_1_6B_4bit),
  ]

  /// Returns model info as dictionaries for the JS layer.
  static func availableModelsList() -> [[String: String]] {
    return availableModels.map { [
      "key": $0.key,
      "label": $0.label,
      "size": $0.size,
    ] }
  }

  /// Set the model to use for next loadModel() call. Unloads current model if loaded.
  func setModel(key: String) {
    guard FastVLMService.availableModels.contains(where: { $0.key == key }) else {
      print("[FastVLM] Unknown model key: \(key)")
      return
    }
    if key != currentModelKey {
      print("[FastVLM] Switching model: \(currentModelKey) → \(key)")
      unloadModel()
      currentModelKey = key
    }
  }

  // MARK: - Model Lifecycle

  /// Downloads (first launch) and loads the selected model into memory.
  /// Safe to call multiple times — returns immediately if already loaded / loading.
  func loadModel() async throws {
    if isModelLoaded { return }
    guard !isLoading else { return }
    isLoading = true
    defer { isLoading = false }

    guard let entry = FastVLMService.availableModels.first(where: { $0.key == currentModelKey }) else {
      throw FastVLMError.modelNotLoaded
    }

    print("[FastVLM] Loading model: \(entry.label)...")

    // Cap GPU cache to 2 GB so we don't starve the rest of the app.
    Memory.cacheLimit = 2_000_000_000

    let container = try await VLMModelFactory.shared.loadContainer(
      configuration: entry.config
    ) { progress in
      print("[FastVLM] Download progress: \(Int(progress.fractionCompleted * 100))%")
    }

    self.modelContainer = container
    print("[FastVLM] Model loaded successfully: \(entry.label)")
  }

  /// Run VLM inference on a single image + text prompt.
  /// Returns the raw text response from the model.
  func predict(image: CGImage, prompt: String) async throws -> String {
    guard let container = modelContainer else {
      print("[FastVLM] predict() called but model not loaded!")
      throw FastVLMError.modelNotLoaded
    }

    print("[FastVLM] predict() preparing input...")
    let userInput = UserInput(
      prompt: prompt,
      images: [.ciImage(CIImage(cgImage: image))]
    )

    let input = try await container.prepare(input: userInput)
    print("[FastVLM] predict() generating response...")

    let stream = try await container.generate(
      input: input,
      parameters: .init(maxTokens: 60, temperature: 0.1)
    )

    var output = ""
    for await generation in stream {
      if let chunk = generation.chunk {
        output += chunk
      }
    }

    let result = output.trimmingCharacters(in: CharacterSet.whitespacesAndNewlines)
    print("[FastVLM] predict() complete -> \"\(result)\"")
    return result
  }

  /// Free model memory. Call when leaving the recording screen.
  func unloadModel() {
    modelContainer = nil
    Memory.clearCache()
    print("[FastVLM] Model unloaded")
  }

  #else
  // Stub implementation when MLX packages are not available (CI, older Xcode, etc.)
  private(set) var currentModelKey: String = "fastvlm"
  var isModelLoaded: Bool { false }
  static let availableModels: [(key: String, label: String, size: String, config: Any)] = []
  static func availableModelsList() -> [[String: String]] { return [] }
  func setModel(key: String) {}
  func loadModel() async throws {
    print("[FastVLM] MLX packages not available — skipping model load")
  }
  func predict(image: CGImage, prompt: String) async throws -> String {
    throw FastVLMError.modelNotLoaded
  }
  func unloadModel() {}
  #endif
}

enum FastVLMError: LocalizedError {
  case modelNotLoaded

  var errorDescription: String? {
    switch self {
    case .modelNotLoaded:
      return "FastVLM model is not loaded. Call loadModel() first."
    }
  }
}

