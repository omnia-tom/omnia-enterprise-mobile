import Foundation
import QuartzCore

/// Thread-safe singleton that decouples the frame source (Meta SDK) from consumers
/// (display views, ML pipeline, recorder). Frames never cross the JS bridge for display.
final class FrameDistributor {
  static let shared = FrameDistributor()

  // MARK: - Types

  struct FrameMetadata {
    let cgImage: CGImage
    let timestamp: TimeInterval
    let width: Int
    let height: Int
    let frameNumber: Int
  }

  // MARK: - Properties

  private var lock = os_unfair_lock()
  private var displayViews: [WeakViewRef] = []
  private var mlPipeline: MLProcessingPipeline?
  private var recorder: StreamingRecorder?

  // Stats
  private(set) var totalFrames: Int = 0
  private(set) var droppedFrames: Int = 0
  private var fpsTimestamps: [CFTimeInterval] = []
  private(set) var currentFPS: Double = 0

  // Adaptive JS metadata throttle
  private var jsMetadataSkipCount: Int = 0
  private var jsMetadataEveryN: Int = 1 // 1 = every frame, 3 = every 3rd

  // Stats emission
  private var statsTimer: Timer?
  weak var eventEmitter: MetaWearablesModule?

  private init() {}

  // MARK: - View Registration

  func registerView(_ view: MetaFrameView) {
    os_unfair_lock_lock(&lock)
    // Clean up any dead refs
    displayViews.removeAll { $0.view == nil }
    displayViews.append(WeakViewRef(view: view))
    os_unfair_lock_unlock(&lock)
  }

  func unregisterView(_ view: MetaFrameView) {
    os_unfair_lock_lock(&lock)
    displayViews.removeAll { $0.view === view || $0.view == nil }
    os_unfair_lock_unlock(&lock)
  }

  // MARK: - Pipeline / Recorder Registration

  func setMLPipeline(_ pipeline: MLProcessingPipeline?) {
    os_unfair_lock_lock(&lock)
    self.mlPipeline = pipeline
    os_unfair_lock_unlock(&lock)
  }

  func setRecorder(_ recorder: StreamingRecorder?) {
    os_unfair_lock_lock(&lock)
    self.recorder = recorder
    os_unfair_lock_unlock(&lock)
  }

  // MARK: - Frame Distribution

  /// Called from the Meta SDK video publisher callback. Must be called on main thread.
  func distributeFrame(_ cgImage: CGImage, timestamp: TimeInterval, width: Int, height: Int) {
    os_unfair_lock_lock(&lock)
    totalFrames += 1
    let frameNumber = totalFrames
    let views = displayViews.compactMap { $0.view }
    let pipeline = self.mlPipeline
    let rec = self.recorder
    os_unfair_lock_unlock(&lock)

    // Track FPS (rolling 1-second window)
    let now = CACurrentMediaTime()
    fpsTimestamps.append(now)
    fpsTimestamps.removeAll { now - $0 > 1.0 }
    currentFPS = Double(fpsTimestamps.count)

    let metadata = FrameMetadata(
      cgImage: cgImage,
      timestamp: timestamp,
      width: width,
      height: height,
      frameNumber: frameNumber
    )

    // 1. Display views — main thread, trivial cost via CALayer.contents
    for view in views {
      view.displayFrame(cgImage)
    }

    // 2. Recording — background queue, O(1) memory
    rec?.writeFrame(cgImage: cgImage, timestamp: timestamp)

    // 3. ML pipeline — background queues with frame skipping
    pipeline?.processFrame(metadata)

    // 4. Lightweight metadata event to JS (no pixel data)
    jsMetadataSkipCount += 1
    if jsMetadataSkipCount >= jsMetadataEveryN {
      jsMetadataSkipCount = 0
      eventEmitter?.sendEvent(withName: "onVideoFrame", body: [
        "timestamp": timestamp * 1000,
        "width": width,
        "height": height,
        "frameNumber": frameNumber
      ])
    }
  }

  // MARK: - Adaptive Throttling

  /// Call when JS thread appears slow to reduce metadata events
  func setJSMetadataRate(everyNFrames: Int) {
    jsMetadataEveryN = max(1, everyNFrames)
  }

  // MARK: - Stats Emission

  func startStatsEmission() {
    stopStatsEmission()
    DispatchQueue.main.async { [weak self] in
      self?.statsTimer = Timer.scheduledTimer(withTimeInterval: 1.0, repeats: true) { [weak self] _ in
        self?.emitStats()
      }
    }
  }

  func stopStatsEmission() {
    statsTimer?.invalidate()
    statsTimer = nil
  }

  private func emitStats() {
    os_unfair_lock_lock(&lock)
    let rec = self.recorder
    os_unfair_lock_unlock(&lock)

    let isRecording = rec?.isCurrentlyRecording ?? false
    let recordingDuration = rec?.currentDuration ?? 0

    eventEmitter?.sendEvent(withName: "onStreamingStats", body: [
      "fps": currentFPS,
      "totalFrames": totalFrames,
      "droppedFrames": droppedFrames,
      "isRecording": isRecording,
      "recordingDuration": recordingDuration
    ])
  }

  // MARK: - Reset

  func reset() {
    os_unfair_lock_lock(&lock)
    totalFrames = 0
    droppedFrames = 0
    fpsTimestamps.removeAll()
    currentFPS = 0
    jsMetadataSkipCount = 0
    jsMetadataEveryN = 1
    os_unfair_lock_unlock(&lock)
    stopStatsEmission()
  }
}

// MARK: - Weak Reference Wrapper

private struct WeakViewRef {
  weak var view: MetaFrameView?
}
