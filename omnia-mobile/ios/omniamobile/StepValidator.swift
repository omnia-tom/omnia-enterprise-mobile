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

  private var frameCount = 0

  func process(cgImage: CGImage, timestamp: TimeInterval, width: Int, height: Int) {
    frameCount += 1
    if frameCount <= 3 || frameCount % 30 == 0 {
      print("[StepValidator] process() called — frame #\(frameCount), enabled=\(isEnabled), isProcessing=\(isProcessing), prompt='\(currentPrompt.prefix(30))'")
    }
    guard isEnabled, !isProcessing, !currentPrompt.isEmpty else { return }

    isProcessing = true

    // Emit "checking" state so JS can show the pulsing indicator
    emitValidation(stepIndex: currentStepIndex, validated: false, checking: true, response: nil, prompt: currentPrompt)

    let prompt = currentPrompt
    let stepIndex = currentStepIndex

    validationQueue.async { [weak self] in
      guard let self = self else { return }

      Task {
        defer { self.isProcessing = false }

        do {
          let vlmPrompt = "Look at this image. Is the person currently doing this: '\(prompt)'? Answer only YES or NO."

          print("[StepValidator] ──────────────────────────────────")
          print("[StepValidator] Step \(stepIndex) | Sending to FastVLM")
          print("[StepValidator]   Image: \(cgImage.width)x\(cgImage.height)")
          print("[StepValidator]   Prompt: \(vlmPrompt)")

          let startTime = CFAbsoluteTimeGetCurrent()
          let response = try await FastVLMService.shared.predict(image: cgImage, prompt: vlmPrompt)
          let elapsed = CFAbsoluteTimeGetCurrent() - startTime

          let upperResponse = response.uppercased()
          let isYes = upperResponse.contains("YES")

          if isYes {
            self.consecutiveYesCount += 1
          } else {
            self.consecutiveYesCount = 0
          }

          let validated = self.consecutiveYesCount >= self.requiredConsensus

          print("[StepValidator]   Raw response: \"\(response)\"")
          print("[StepValidator]   Parsed as: \(isYes ? "YES" : "NO") | Consecutive YES: \(self.consecutiveYesCount)/\(self.requiredConsensus)")
          print("[StepValidator]   Validated: \(validated) | Inference time: \(String(format: "%.0f", elapsed * 1000))ms")
          print("[StepValidator] ──────────────────────────────────")

          // Only emit if still on the same step (user might have advanced)
          if self.currentStepIndex == stepIndex {
            self.emitValidation(stepIndex: stepIndex, validated: validated, checking: !validated, response: response, prompt: prompt)
          }
        } catch {
          print("[StepValidator] Inference error: \(error.localizedDescription)")
          self.emitValidation(stepIndex: stepIndex, validated: false, checking: false, response: "ERROR: \(error.localizedDescription)", prompt: prompt)
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
