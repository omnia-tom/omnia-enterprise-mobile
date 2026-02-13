import Foundation
import CoreGraphics
import React

/// MLModelConsumer that validates recording steps by sending camera frames
/// to FastVLM and emitting validation events back to React Native.
@available(iOS 18.2, *)
final class StepValidator: MLModelConsumer {

  // MARK: - MLModelConsumer conformance

  let modelName = "stepValidator"
  let processEveryNFrames = 15  // ~1fps at 15fps input
  var isEnabled = false

  // MARK: - Configuration

  var currentStepIndex: Int = 0
  var currentPrompt: String = ""
  weak var eventEmitter: RCTEventEmitter?

  // MARK: - Internal state

  private var isProcessing = false
  private var consecutiveYesCount = 0
  private let requiredConsensus = 2  // 2 consecutive YES → validated
  private let validationQueue = DispatchQueue(label: "com.spectask.stepValidator", qos: .userInitiated)

  // MARK: - MLModelConsumer

  func process(cgImage: CGImage, timestamp: TimeInterval, width: Int, height: Int) {
    guard isEnabled, !isProcessing, !currentPrompt.isEmpty else { return }

    isProcessing = true

    // Emit "checking" state so JS can show the pulsing indicator
    emitValidation(stepIndex: currentStepIndex, validated: false, checking: true)

    let prompt = currentPrompt
    let stepIndex = currentStepIndex

    validationQueue.async { [weak self] in
      guard let self = self else { return }

      Task {
        defer { self.isProcessing = false }

        do {
          let vlmPrompt = "Look at this image. Is the person currently doing this: '\(prompt)'? Answer only YES or NO."
          let response = try await FastVLMService.shared.predict(image: cgImage, prompt: vlmPrompt)

          let upperResponse = response.uppercased()
          let isYes = upperResponse.contains("YES")

          if isYes {
            self.consecutiveYesCount += 1
          } else {
            self.consecutiveYesCount = 0
          }

          let validated = self.consecutiveYesCount >= self.requiredConsensus

          // Only emit if still on the same step (user might have advanced)
          if self.currentStepIndex == stepIndex {
            self.emitValidation(stepIndex: stepIndex, validated: validated, checking: !validated)
          }

          print("[StepValidator] Step \(stepIndex): response=\(response), consecutive=\(self.consecutiveYesCount), validated=\(validated)")
        } catch {
          print("[StepValidator] Inference error: \(error.localizedDescription)")
          self.isProcessing = false
        }
      }
    }
  }

  // MARK: - Step Management

  func configure(stepIndex: Int, description: String) {
    currentStepIndex = stepIndex
    currentPrompt = description
    consecutiveYesCount = 0
    print("[StepValidator] Configured for step \(stepIndex): \(description)")
  }

  func reset() {
    currentStepIndex = 0
    currentPrompt = ""
    consecutiveYesCount = 0
    isEnabled = false
  }

  // MARK: - Event Emission

  private func emitValidation(stepIndex: Int, validated: Bool, checking: Bool) {
    DispatchQueue.main.async { [weak self] in
      self?.eventEmitter?.sendEvent(withName: "onStepValidation", body: [
        "stepIndex": stepIndex,
        "validated": validated,
        "checking": checking
      ])
    }
  }
}
