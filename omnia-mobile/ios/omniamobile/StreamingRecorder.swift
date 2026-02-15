import AVFoundation
import Photos
import VideoToolbox

/// Writes video frames to disk in real-time using AVAssetWriter.
/// Memory usage is O(1) — a single reusable CVPixelBuffer instead of storing thousands of UIImages.
class StreamingRecorder {

  // MARK: - Properties

  private var assetWriter: AVAssetWriter?
  private var videoInput: AVAssetWriterInput?
  private var pixelBufferAdaptor: AVAssetWriterInputPixelBufferAdaptor?
  private var audioInput: AVAssetWriterInput?

  private let writerQueue = DispatchQueue(label: "com.spectask.streamingRecorder", qos: .userInitiated)

  private var startTime: TimeInterval = 0
  private var frameCount: Int = 0
  private var droppedFrameCount: Int = 0
  private var sessionStarted: Bool = false

  private(set) var isCurrentlyRecording: Bool = false
  private var outputURL: URL?

  // Reusable pixel buffer pool (managed by adaptor)
  private var videoWidth: Int = 0
  private var videoHeight: Int = 0

  // Audio recording
  private var audioRecorder: AVAudioRecorder?
  private var audioFileURL: URL?

  var currentDuration: TimeInterval {
    guard isCurrentlyRecording, startTime > 0 else { return 0 }
    return Date().timeIntervalSince1970 - startTime
  }

  // MARK: - Start Recording

  func startRecording(width: Int, height: Int) throws {
    self.videoWidth = width
    self.videoHeight = height

    let tempDir = FileManager.default.temporaryDirectory
    let fileName = "spectask_recording_\(Int(Date().timeIntervalSince1970)).mov"
    let url = tempDir.appendingPathComponent(fileName)
    try? FileManager.default.removeItem(at: url)
    self.outputURL = url

    let writer = try AVAssetWriter(outputURL: url, fileType: .mov)

    let videoSettings: [String: Any] = [
      AVVideoCodecKey: AVVideoCodecType.h264,
      AVVideoWidthKey: width,
      AVVideoHeightKey: height,
      AVVideoCompressionPropertiesKey: [
        AVVideoAverageBitRateKey: 6_000_000,
        AVVideoMaxKeyFrameIntervalKey: 30,
        AVVideoExpectedSourceFrameRateKey: 15
      ]
    ]

    let vInput = AVAssetWriterInput(mediaType: .video, outputSettings: videoSettings)
    vInput.expectsMediaDataInRealTime = true

    let sourceAttrs: [String: Any] = [
      kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA,
      kCVPixelBufferWidthKey as String: width,
      kCVPixelBufferHeightKey as String: height
    ]

    let adaptor = AVAssetWriterInputPixelBufferAdaptor(
      assetWriterInput: vInput,
      sourcePixelBufferAttributes: sourceAttrs
    )

    guard writer.canAdd(vInput) else {
      throw NSError(domain: "StreamingRecorder", code: 1, userInfo: [NSLocalizedDescriptionKey: "Cannot add video input"])
    }
    writer.add(vInput)

    // Audio input
    let audioSettings: [String: Any] = [
      AVFormatIDKey: kAudioFormatMPEG4AAC,
      AVSampleRateKey: 44100,
      AVNumberOfChannelsKey: 1,
      AVEncoderBitRateKey: 128000
    ]
    let aInput = AVAssetWriterInput(mediaType: .audio, outputSettings: audioSettings)
    aInput.expectsMediaDataInRealTime = true
    if writer.canAdd(aInput) {
      writer.add(aInput)
      self.audioInput = aInput
    }

    guard writer.startWriting() else {
      throw NSError(domain: "StreamingRecorder", code: 2,
                    userInfo: [NSLocalizedDescriptionKey: "Failed to start writing: \(writer.error?.localizedDescription ?? "unknown")"])
    }

    self.assetWriter = writer
    self.videoInput = vInput
    self.pixelBufferAdaptor = adaptor
    self.frameCount = 0
    self.droppedFrameCount = 0
    self.sessionStarted = false
    self.startTime = Date().timeIntervalSince1970
    self.isCurrentlyRecording = true

    // Start separate audio recording to file, then merge
    try startAudioCapture()

    print("[StreamingRecorder] Recording started (\(width)x\(height))")
  }

  // MARK: - Write Frame

  /// Called from FrameDistributor for each video frame. Converts CGImage → CVPixelBuffer and appends.
  func writeFrame(cgImage: CGImage, timestamp: TimeInterval) {
    guard isCurrentlyRecording else { return }

    writerQueue.async { [weak self] in
      guard let self = self,
            let writer = self.assetWriter,
            let input = self.videoInput,
            let adaptor = self.pixelBufferAdaptor,
            writer.status == .writing else { return }

      // Start session on first frame
      if !self.sessionStarted {
        let cmTime = CMTime(seconds: timestamp, preferredTimescale: 600)
        writer.startSession(atSourceTime: cmTime)
        self.sessionStarted = true
      }

      guard input.isReadyForMoreMediaData else {
        self.droppedFrameCount += 1
        return
      }

      // Get pixel buffer from pool (or create one)
      guard let pixelBuffer = self.createPixelBuffer(from: cgImage) else {
        self.droppedFrameCount += 1
        return
      }

      let presentationTime = CMTime(seconds: timestamp, preferredTimescale: 600)
      if adaptor.append(pixelBuffer, withPresentationTime: presentationTime) {
        self.frameCount += 1
        if self.frameCount % 100 == 0 {
          let duration = Date().timeIntervalSince1970 - self.startTime
          print("[StreamingRecorder] \(self.frameCount) frames written (\(String(format: "%.1f", duration))s), \(self.droppedFrameCount) dropped")
        }
      } else {
        self.droppedFrameCount += 1
      }
    }
  }

  // MARK: - Write Frame from CVPixelBuffer (zero-copy fast path)

  /// Appends a CVPixelBuffer directly when format and dimensions match. Falls back to CGImage conversion otherwise.
  func writeFrameFromPixelBuffer(_ srcBuffer: CVPixelBuffer, timestamp: TimeInterval) {
    guard isCurrentlyRecording else { return }

    writerQueue.async { [weak self] in
      guard let self = self,
            let writer = self.assetWriter,
            let input = self.videoInput,
            let adaptor = self.pixelBufferAdaptor,
            writer.status == .writing else { return }

      // Start session on first frame
      if !self.sessionStarted {
        let cmTime = CMTime(seconds: timestamp, preferredTimescale: 600)
        writer.startSession(atSourceTime: cmTime)
        self.sessionStarted = true
      }

      guard input.isReadyForMoreMediaData else {
        self.droppedFrameCount += 1
        return
      }

      let presentationTime = CMTime(seconds: timestamp, preferredTimescale: 600)

      // Check if format and dimensions match — append directly if BGRA and correct size
      let srcFormat = CVPixelBufferGetPixelFormatType(srcBuffer)
      let srcWidth = CVPixelBufferGetWidth(srcBuffer)
      let srcHeight = CVPixelBufferGetHeight(srcBuffer)

      if srcFormat == kCVPixelFormatType_32BGRA && srcWidth == self.videoWidth && srcHeight == self.videoHeight {
        // Direct append — AVAssetWriter copies internally per Apple docs
        if adaptor.append(srcBuffer, withPresentationTime: presentationTime) {
          self.frameCount += 1
          if self.frameCount % 100 == 0 {
            let duration = Date().timeIntervalSince1970 - self.startTime
            print("[StreamingRecorder] \(self.frameCount) frames written (\(String(format: "%.1f", duration))s), \(self.droppedFrameCount) dropped")
          }
        } else {
          self.droppedFrameCount += 1
        }
      } else {
        // Format mismatch (e.g. YUV): convert via CGImage fallback
        var cgImage: CGImage?
        let vtStatus = VTCreateCGImageFromCVPixelBuffer(srcBuffer, options: nil, imageOut: &cgImage)

        guard vtStatus == noErr, let image = cgImage,
              let pixelBuffer = self.createPixelBuffer(from: image) else {
          self.droppedFrameCount += 1
          return
        }

        if adaptor.append(pixelBuffer, withPresentationTime: presentationTime) {
          self.frameCount += 1
          if self.frameCount % 100 == 0 {
            let duration = Date().timeIntervalSince1970 - self.startTime
            print("[StreamingRecorder] \(self.frameCount) frames written (\(String(format: "%.1f", duration))s), \(self.droppedFrameCount) dropped")
          }
        } else {
          self.droppedFrameCount += 1
        }
      }
    }
  }

  // MARK: - Stop Recording

  func stopRecording(completion: @escaping (Result<(filePath: String, frameCount: Int, duration: Double), Error>) -> Void) {
    guard isCurrentlyRecording else {
      completion(.failure(NSError(domain: "StreamingRecorder", code: 3, userInfo: [NSLocalizedDescriptionKey: "Not recording"])))
      return
    }

    isCurrentlyRecording = false

    // Stop audio capture
    audioRecorder?.stop()
    audioRecorder = nil

    let capturedFrameCount = frameCount
    let capturedDuration = Date().timeIntervalSince1970 - startTime
    let capturedAudioURL = audioFileURL
    let capturedOutputURL = outputURL

    writerQueue.async { [weak self] in
      guard let self = self, let writer = self.assetWriter else {
        completion(.failure(NSError(domain: "StreamingRecorder", code: 4, userInfo: [NSLocalizedDescriptionKey: "No asset writer"])))
        return
      }

      self.videoInput?.markAsFinished()
      self.audioInput?.markAsFinished()

      writer.finishWriting {
        if writer.status == .completed, let outputURL = capturedOutputURL {
          print("[StreamingRecorder] Recording complete: \(capturedFrameCount) frames, \(String(format: "%.1f", capturedDuration))s")

          // Merge audio if available
          if let audioURL = capturedAudioURL, FileManager.default.fileExists(atPath: audioURL.path) {
            self.mergeAudioIntoVideo(videoURL: outputURL, audioURL: audioURL) { mergedURL in
              self.saveToPhotos(url: mergedURL) { result in
                // Clean up temp files
                try? FileManager.default.removeItem(at: outputURL)
                try? FileManager.default.removeItem(at: audioURL)
                if mergedURL != outputURL {
                  try? FileManager.default.removeItem(at: mergedURL)
                }
                switch result {
                case .success(let identifier):
                  completion(.success((filePath: identifier, frameCount: capturedFrameCount, duration: capturedDuration)))
                case .failure(let error):
                  completion(.failure(error))
                }
              }
            }
          } else {
            self.saveToPhotos(url: outputURL) { result in
              try? FileManager.default.removeItem(at: outputURL)
              switch result {
              case .success(let identifier):
                completion(.success((filePath: identifier, frameCount: capturedFrameCount, duration: capturedDuration)))
              case .failure(let error):
                completion(.failure(error))
              }
            }
          }
        } else {
          let error = writer.error ?? NSError(domain: "StreamingRecorder", code: 5, userInfo: [NSLocalizedDescriptionKey: "Unknown writing error"])
          completion(.failure(error))
        }
      }

      self.assetWriter = nil
      self.videoInput = nil
      self.pixelBufferAdaptor = nil
      self.audioInput = nil
    }
  }

  // MARK: - Audio Capture

  private func startAudioCapture() throws {
    let audioSession = AVAudioSession.sharedInstance()
    try audioSession.setCategory(.playAndRecord, mode: .videoRecording, options: [.defaultToSpeaker, .allowBluetooth])
    try audioSession.setActive(true, options: [])

    let tempDir = FileManager.default.temporaryDirectory
    let audioFileName = "spectask_audio_\(Int(Date().timeIntervalSince1970)).m4a"
    let audioURL = tempDir.appendingPathComponent(audioFileName)
    try? FileManager.default.removeItem(at: audioURL)
    self.audioFileURL = audioURL

    let settings: [String: Any] = [
      AVFormatIDKey: Int(kAudioFormatMPEG4AAC),
      AVSampleRateKey: 44100.0,
      AVNumberOfChannelsKey: 1,
      AVEncoderAudioQualityKey: AVAudioQuality.high.rawValue
    ]

    let recorder = try AVAudioRecorder(url: audioURL, settings: settings)
    if recorder.prepareToRecord() && recorder.record() {
      self.audioRecorder = recorder
      print("[StreamingRecorder] Audio capture started")
    } else {
      print("[StreamingRecorder] Warning: Failed to start audio capture")
    }
  }

  // MARK: - Audio Merge

  private func mergeAudioIntoVideo(videoURL: URL, audioURL: URL, completion: @escaping (URL) -> Void) {
    let composition = AVMutableComposition()

    let videoAsset = AVAsset(url: videoURL)
    let audioAsset = AVAsset(url: audioURL)

    Task {
      do {
        guard let videoTrack = try await videoAsset.loadTracks(withMediaType: .video).first else {
          completion(videoURL) // Fallback to video without audio
          return
        }

        let videoDuration = try await videoAsset.load(.duration)

        let compositionVideoTrack = composition.addMutableTrack(withMediaType: .video, preferredTrackID: kCMPersistentTrackID_Invalid)
        try compositionVideoTrack?.insertTimeRange(CMTimeRange(start: .zero, duration: videoDuration), of: videoTrack, at: .zero)

        if let audioTrack = try await audioAsset.loadTracks(withMediaType: .audio).first {
          let compositionAudioTrack = composition.addMutableTrack(withMediaType: .audio, preferredTrackID: kCMPersistentTrackID_Invalid)
          let audioDuration = try await audioAsset.load(.duration)
          let mergedDuration = min(videoDuration, audioDuration)
          try compositionAudioTrack?.insertTimeRange(CMTimeRange(start: .zero, duration: mergedDuration), of: audioTrack, at: .zero)
        }

        let tempDir = FileManager.default.temporaryDirectory
        let mergedURL = tempDir.appendingPathComponent("spectask_merged_\(Int(Date().timeIntervalSince1970)).mov")
        try? FileManager.default.removeItem(at: mergedURL)

        guard let exporter = AVAssetExportSession(asset: composition, presetName: AVAssetExportPresetHighestQuality) else {
          completion(videoURL)
          return
        }
        exporter.outputURL = mergedURL
        exporter.outputFileType = .mov

        await exporter.export()

        if exporter.status == .completed {
          completion(mergedURL)
        } else {
          print("[StreamingRecorder] Audio merge failed: \(exporter.error?.localizedDescription ?? "unknown")")
          completion(videoURL)
        }
      } catch {
        print("[StreamingRecorder] Audio merge error: \(error.localizedDescription)")
        completion(videoURL)
      }
    }
  }

  // MARK: - Save to Photos

  private func saveToPhotos(url: URL, completion: @escaping (Result<String, Error>) -> Void) {
    let status = PHPhotoLibrary.authorizationStatus(for: .addOnly)

    if status == .notDetermined {
      PHPhotoLibrary.requestAuthorization(for: .addOnly) { newStatus in
        if newStatus == .authorized {
          self.performSaveToPhotos(url: url, completion: completion)
        } else {
          completion(.failure(NSError(domain: "StreamingRecorder", code: 6, userInfo: [NSLocalizedDescriptionKey: "Photos permission denied"])))
        }
      }
    } else if status == .authorized {
      performSaveToPhotos(url: url, completion: completion)
    } else {
      completion(.failure(NSError(domain: "StreamingRecorder", code: 6, userInfo: [NSLocalizedDescriptionKey: "Photos permission denied"])))
    }
  }

  private func performSaveToPhotos(url: URL, completion: @escaping (Result<String, Error>) -> Void) {
    var localIdentifier: String?

    PHPhotoLibrary.shared().performChanges({
      let request = PHAssetCreationRequest.forAsset()
      request.addResource(with: .video, fileURL: url, options: nil)
      localIdentifier = request.placeholderForCreatedAsset?.localIdentifier
    }, completionHandler: { success, error in
      if success {
        completion(.success(localIdentifier ?? "Photos Library"))
      } else {
        completion(.failure(error ?? NSError(domain: "StreamingRecorder", code: 7, userInfo: [NSLocalizedDescriptionKey: "Failed to save to Photos"])))
      }
    })
  }

  // MARK: - Pixel Buffer Creation

  private func createPixelBuffer(from cgImage: CGImage) -> CVPixelBuffer? {
    let width = self.videoWidth
    let height = self.videoHeight

    // Try to get from pool first
    if let pool = pixelBufferAdaptor?.pixelBufferPool {
      var pixelBuffer: CVPixelBuffer?
      let status = CVPixelBufferPoolCreatePixelBuffer(kCFAllocatorDefault, pool, &pixelBuffer)
      if status == kCVReturnSuccess, let buffer = pixelBuffer {
        fillPixelBuffer(buffer, with: cgImage, width: width, height: height)
        return buffer
      }
    }

    // Fallback: create standalone buffer
    let attrs: [String: Any] = [
      kCVPixelBufferCGImageCompatibilityKey as String: true,
      kCVPixelBufferCGBitmapContextCompatibilityKey as String: true
    ]

    var pixelBuffer: CVPixelBuffer?
    let status = CVPixelBufferCreate(kCFAllocatorDefault, width, height, kCVPixelFormatType_32BGRA, attrs as CFDictionary, &pixelBuffer)
    guard status == kCVReturnSuccess, let buffer = pixelBuffer else { return nil }

    fillPixelBuffer(buffer, with: cgImage, width: width, height: height)
    return buffer
  }

  private func fillPixelBuffer(_ buffer: CVPixelBuffer, with cgImage: CGImage, width: Int, height: Int) {
    CVPixelBufferLockBaseAddress(buffer, [])
    defer { CVPixelBufferUnlockBaseAddress(buffer, []) }

    guard let baseAddress = CVPixelBufferGetBaseAddress(buffer) else { return }
    let bytesPerRow = CVPixelBufferGetBytesPerRow(buffer)
    let colorSpace = CGColorSpaceCreateDeviceRGB()

    guard let context = CGContext(
      data: baseAddress,
      width: width,
      height: height,
      bitsPerComponent: 8,
      bytesPerRow: bytesPerRow,
      space: colorSpace,
      bitmapInfo: CGImageAlphaInfo.premultipliedFirst.rawValue | CGBitmapInfo.byteOrder32Little.rawValue
    ) else { return }

    context.draw(cgImage, in: CGRect(x: 0, y: 0, width: width, height: height))
  }
}
