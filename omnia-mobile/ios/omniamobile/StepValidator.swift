import Foundation
import CoreGraphics
import CoreImage
import UIKit
import Photos
import React

/// MLModelConsumer that continuously validates recording steps at ~1fps.
/// Emits VLM responses to React Native for display in the debug log.
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
  private let validationQueue = DispatchQueue(label: "com.spectask.stepValidator", qos: .userInitiated)
  private var debugFramesSaved = 0

  // MARK: - MLModelConsumer

  func process(cgImage: CGImage, timestamp: TimeInterval, width: Int, height: Int) {
    // Back-pressure: skip frame if previous inference still running
    guard isEnabled, !isProcessing, !currentPrompt.isEmpty else { return }

    isProcessing = true

    // Emit "checking" state so JS shows activity
    emitValidation(stepIndex: currentStepIndex, validated: false, checking: true, response: nil, prompt: currentPrompt)

    let prompt = currentPrompt
    let stepIndex = currentStepIndex

    validationQueue.async { [weak self] in
      guard let self = self else { return }

      Task {
        defer { self.isProcessing = false }

        do {
          let vlmPrompt = "What text is written on the page in this image? Read carefully and output ONLY the exact text you can see. If no text is visible, say NONE."

          // Pre-process: fix aspect ratio, center-crop, upscale
          let processed = self.preprocessForVLM(cgImage)

          // DEBUG: uncomment to save processed frame to Photos for inspection
          // if self.debugFramesSaved < 1 {
          //   self.debugFramesSaved += 1
          //   self.saveDebugFrame(processed)
          //   print("[StepValidator] Raw: \(cgImage.width)x\(cgImage.height) → Processed: \(processed.width)x\(processed.height)")
          // }

          let startTime = CFAbsoluteTimeGetCurrent()
          let response = try await FastVLMService.shared.predict(image: processed, prompt: vlmPrompt)
          let elapsedMs = Int((CFAbsoluteTimeGetCurrent() - startTime) * 1000)

          print("[StepValidator] Step \(stepIndex) | VLM: \"\(response)\" (\(elapsedMs)ms)")

          self.emitValidation(stepIndex: stepIndex, validated: false, checking: false, response: "\(response) (\(elapsedMs)ms)", prompt: prompt)
        } catch {
          print("[StepValidator] Inference error: \(error.localizedDescription)")
          self.emitValidation(stepIndex: stepIndex, validated: false, checking: false, response: "ERROR: \(error.localizedDescription)", prompt: prompt)
        }
      }
    }
  }

  // MARK: - Step Management

  func configure(stepIndex: Int, description: String) {
    currentStepIndex = stepIndex
    currentPrompt = description
    print("[StepValidator] Configured for step \(stepIndex): \(description)")
  }

  func reset() {
    currentStepIndex = 0
    currentPrompt = ""
    isEnabled = false
    debugFramesSaved = 0
  }

  // MARK: - Image Preprocessing

  /// Fix aspect ratio (un-squish 4:3 → 16:9), center-crop 60%, and upscale to 1024px wide.
  /// The Meta glasses camera is natively 16:9 but the stream may deliver squished 640x480.
  private func preprocessForVLM(_ cgImage: CGImage) -> CGImage {
    let srcW = CGFloat(cgImage.width)
    let srcH = CGFloat(cgImage.height)

    // Step 1: Fix aspect ratio — if image is squished from 16:9 to 4:3
    let nativeAspect: CGFloat = 16.0 / 9.0
    let currentAspect = srcW / srcH
    let correctedH: CGFloat
    if currentAspect < nativeAspect - 0.05 {
      correctedH = srcW / nativeAspect
    } else {
      correctedH = srcH
    }

    // Step 2: Center-crop 60% of the frame
    let cropFraction: CGFloat = 0.6
    let cropW = srcW * cropFraction
    let cropH = correctedH * cropFraction
    let cropX = (srcW - cropW) / 2.0
    let cropYCorrected = (correctedH - cropH) / 2.0
    let cropYOriginal = cropYCorrected * (srcH / correctedH)
    let cropHOriginal = cropH * (srcH / correctedH)

    let cropRect = CGRect(x: cropX, y: cropYOriginal, width: cropW, height: cropHOriginal)
    let cropped = cgImage.cropping(to: cropRect) ?? cgImage

    // Step 3: Upscale to 1024px wide with correct aspect ratio
    let targetW = 1024
    let scale = CGFloat(targetW) / CGFloat(cropped.width)
    let croppedCorrectedH = cropH
    let targetH = Int(croppedCorrectedH * scale * (CGFloat(cropped.width) / cropW))

    let colorSpace = cgImage.colorSpace ?? CGColorSpaceCreateDeviceRGB()
    guard let ctx = CGContext(
      data: nil,
      width: targetW,
      height: targetH,
      bitsPerComponent: 8,
      bytesPerRow: 0,
      space: colorSpace,
      bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
    ) else {
      return cropped
    }

    ctx.interpolationQuality = .high
    ctx.draw(cropped, in: CGRect(x: 0, y: 0, width: targetW, height: targetH))

    return ctx.makeImage() ?? cropped
  }

  // MARK: - Debug

  private func saveDebugFrame(_ cgImage: CGImage) {
    let uiImage = UIImage(cgImage: cgImage)
    PHPhotoLibrary.requestAuthorization(for: .addOnly) { status in
      guard status == .authorized || status == .limited else { return }
      PHPhotoLibrary.shared().performChanges({
        PHAssetChangeRequest.creationRequestForAsset(from: uiImage)
      }) { success, _ in
        if success {
          print("[StepValidator] DEBUG: Processed frame saved to Photos (\(cgImage.width)x\(cgImage.height))")
        }
      }
    }
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
