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

  /// Whether the model has been loaded and is ready for inference.
  var isModelLoaded: Bool { modelContainer != nil }

  // MARK: - Model Lifecycle

  /// Downloads (first launch) and loads the FastVLM-0.5B 4-bit model into memory.
  /// Safe to call multiple times — returns immediately if already loaded / loading.
  func loadModel() async throws {
    if isModelLoaded { return }
    guard !isLoading else { return }
    isLoading = true
    defer { isLoading = false }

    print("[FastVLM] Loading model...")

    // Cap GPU cache to 2 GB so we don't starve the rest of the app.
    MLX.GPU.set(cacheLimit: 2_000_000_000)

    // Use the library's built-in FastVLM preset (mlx-community/FastVLM-0.5B-bf16)
    let modelConfig = VLMRegistry.fastvlm

    let container = try await VLMModelFactory.shared.loadContainer(
      configuration: modelConfig
    ) { progress in
      print("[FastVLM] Download progress: \(Int(progress.fractionCompleted * 100))%")
    }

    self.modelContainer = container
    print("[FastVLM] Model loaded successfully")
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
      parameters: .init(maxTokens: 20, temperature: 0.1)
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
    MLX.GPU.clearCache()
    print("[FastVLM] Model unloaded")
  }

  #else
  // Stub implementation when MLX packages are not available (CI, older Xcode, etc.)
  var isModelLoaded: Bool { false }
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
