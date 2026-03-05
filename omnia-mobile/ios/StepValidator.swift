import Foundation
import CoreGraphics
import CoreImage
import React

/// MLModelConsumer that validates recording steps on-demand (single-shot).
/// Sits idle until triggerCheck() is called, then analyzes the next frame
/// and emits the result back to React Native. Zero GPU cost when idle.
@available(iOS 18.2, *)
final class StepValidator: MLModelConsumer {

  // MARK: - MLModelConsumer conformance

  let modelName = "stepValidator"
  let processEveryNFrames = 1  // Check every frame so we catch it quickly after trigger
  var isEnabled = false

  // MARK: - Configuration

  var currentStepIndex: Int = 0
  var currentPrompt: String = ""
  weak var eventEmitter: (RCTEventEmitter & AnyObject)?

  // MARK: - Internal state

  private var isProcessing = false
  private var pendingCheck = false  // single-shot flag
  private let validationQueue = DispatchQueue(label: "com.spectask.stepValidator", qos: .userInitiated)
  private static let ciContext = CIContext(options: [.useSoftwareRenderer: false])
  var onCheckComplete: (() -> Void)?  // Called on main thread when check finishes

  // MARK: - MLModelConsumer

  func process(cgImage: CGImage, timestamp: TimeInterval, width: Int, height: Int) {
    // Log every frame when a check is pending so we can diagnose
    if pendingCheck {
      print("[StepValidator] Frame arrived while pendingCheck=true, enabled=\(isEnabled), isProcessing=\(isProcessing), prompt='\(currentPrompt.prefix(20))'")
    }
    // Only process if a check was explicitly requested
    guard isEnabled, pendingCheck, !isProcessing, !currentPrompt.isEmpty else { return }

    pendingCheck = false  // single-shot: consume the trigger
    isProcessing = true

    // Emit "checking" state so JS shows spinner
    emitValidation(stepIndex: currentStepIndex, validated: false, checking: true, response: nil, prompt: currentPrompt)

    let prompt = currentPrompt
    let stepIndex = currentStepIndex

    validationQueue.async { [weak self, cgImage, prompt, stepIndex] in
      guard let self = self else { return }

      let sharpened = self.sharpenForVLM(cgImage)

      Task {
        defer {
          self.validationQueue.async {
            self.isProcessing = false
          }
        }

        do {
          // Unbiased prompt — do NOT include expected text to prevent hallucination
          let vlmPrompt = "What text is written on the page in this image? Read carefully and output ONLY the exact text you can see. If no text is visible, say NONE."

          print("[StepValidator] ──────────────────────────────────")
          print("[StepValidator] Step \(stepIndex) | Single-shot check")
          print("[StepValidator]   Image: \(cgImage.width)x\(cgImage.height)")
          print("[StepValidator]   Looking for: \(prompt)")

          let startTime = CFAbsoluteTimeGetCurrent()
          let response = try await FastVLMService.shared.predict(image: sharpened, prompt: vlmPrompt)
          let elapsedMs = Int((CFAbsoluteTimeGetCurrent() - startTime) * 1000)

          print("[StepValidator]   VLM says: \"\(response)\" (\(elapsedMs)ms)")
          print("[StepValidator] ──────────────────────────────────")

          await MainActor.run {
            self.emitValidation(stepIndex: stepIndex, validated: false, checking: false, response: "\(response) (\(elapsedMs)ms)", prompt: prompt)
          }
          await MainActor.run {
            self.onCheckComplete?()
            self.onCheckComplete = nil
          }
        } catch {
          print("[StepValidator] Inference error: \(error.localizedDescription)")
          await MainActor.run {
            self.emitValidation(stepIndex: stepIndex, validated: false, checking: false, response: "ERROR: \(error.localizedDescription)", prompt: prompt)
          }
          await MainActor.run {
            self.onCheckComplete?()
            self.onCheckComplete = nil
          }
        }
      }
    }
  }

  // MARK: - On-Demand Check

  /// Trigger a single-shot check on the next available frame.
  func triggerCheck() {
    print("[StepValidator] triggerCheck() called — enabled=\(isEnabled), isProcessing=\(isProcessing), prompt='\(currentPrompt.prefix(30))', pendingCheck=\(pendingCheck)")
    guard !isProcessing else {
      print("[StepValidator] Already processing — ignoring check request")
      return
    }
    pendingCheck = true
    print("[StepValidator] ✓ pendingCheck set to true — waiting for next frame")
  }

  // MARK: - Step Management

  func configure(stepIndex: Int, description: String) {
    currentStepIndex = stepIndex
    currentPrompt = description
    pendingCheck = false
    print("[StepValidator] Configured for step \(stepIndex): \(description)")
  }

  func reset() {
    currentStepIndex = 0
    currentPrompt = ""
    pendingCheck = false
    isEnabled = false
  }

  // MARK: - Image Sharpening

  /// Apply luminance sharpening to improve VLM text recognition accuracy.
  private func sharpenForVLM(_ cgImage: CGImage) -> CGImage {
    let ci = CIImage(cgImage: cgImage)
    guard let filter = CIFilter(name: "CISharpenLuminance") else { return cgImage }
    filter.setValue(ci, forKey: kCIInputImageKey)
    filter.setValue(0.6, forKey: kCIInputSharpnessKey)
    guard let output = filter.outputImage,
          let result = Self.ciContext.createCGImage(output, from: output.extent) else {
      return cgImage
    }
    return result
  }

  // MARK: - Event Emission

  private func emitValidation(stepIndex: Int, validated: Bool, checking: Bool, response: String?, prompt: String?) {
    DispatchQueue.main.async { [weak self] in
      var body: [String: Any] = [
        "stepIndex": stepIndex,
        "validated": validated,
        "checking": checking
      ]
      if let response = response {
        body["response"] = response
      }
      if let prompt = prompt {
        body["prompt"] = prompt
      }
      self?.eventEmitter?.sendEvent(withName: "onStepValidation", body: body)
    }
  }
}

