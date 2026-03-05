import UIKit
import AVFoundation
import Vision
import React

/// Native camera view for iPhone test recording. Captures from back camera,
/// runs real-time hand pose detection (VNDetectHumanHandPoseRequest), and
/// records video. Replaces the static DEMO_HAND_POSE with actual tracking.
class iPhoneCameraView: UIView, AVCaptureVideoDataOutputSampleBufferDelegate {

  static weak var currentInstance: iPhoneCameraView?

  private var captureSession: AVCaptureSession?
  private var previewLayer: AVCaptureVideoPreviewLayer?
  private var videoOutput: AVCaptureVideoDataOutput?
  private let handPoseQueue = DispatchQueue(label: "com.spectask.iphone.handpose", qos: .userInitiated)
  private var isHandPoseProcessing = false
  private var assetWriter: AVAssetWriter?
  private var assetWriterInput: AVAssetWriterInput?
  private var pixelBufferAdaptor: AVAssetWriterInputPixelBufferAdaptor?
  private var recordingSessionStartTime: CMTime?
  private var lastAppendedTime: CMTime?
  private var frameWidth: Int = 1920
  private var frameHeight: Int = 1080

  @objc var isActive: Bool = true {
    didSet {
      if isActive { startSession(); Self.currentInstance = self }
      else { stopSession(); if Self.currentInstance === self { Self.currentInstance = nil } }
    }
  }

  override init(frame: CGRect) {
    super.init(frame: frame)
    backgroundColor = .black
  }

  required init?(coder: NSCoder) {
    super.init(coder: coder)
    backgroundColor = .black
  }

  override func didMoveToWindow() {
    super.didMoveToWindow()
    if window != nil && isActive {
      startSession()
      Self.currentInstance = self
    } else if window == nil {
      stopSession()
      if Self.currentInstance === self { Self.currentInstance = nil }
    }
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    previewLayer?.frame = bounds
  }

  func startSession() {
    guard captureSession == nil else { return }

    let session = AVCaptureSession()
    session.sessionPreset = .high

    guard let camera = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .back),
          let input = try? AVCaptureDeviceInput(device: camera) else {
      print("[iPhoneCamera] No back camera")
      return
    }

    if session.canAddInput(input) { session.addInput(input) }

    let preview = AVCaptureVideoPreviewLayer(session: session)
    preview.videoGravity = .resizeAspectFill
    preview.frame = bounds
    layer.insertSublayer(preview, at: 0)
    previewLayer = preview

    // Align capture and preview with device orientation so hand pose coords match display
    if let conn = preview.connection, conn.isVideoOrientationSupported {
      conn.videoOrientation = .portrait
    }

    let output = AVCaptureVideoDataOutput()
    output.videoSettings = [
      kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA
    ]
    output.setSampleBufferDelegate(self, queue: handPoseQueue)
    output.alwaysDiscardsLateVideoFrames = true
    if session.canAddOutput(output) { session.addOutput(output) }
    videoOutput = output

    if let conn = output.connection(with: .video), conn.isVideoOrientationSupported {
      conn.videoOrientation = .portrait
    }

    captureSession = session
    session.startRunning()
  }

  func stopSession() {
    captureSession?.stopRunning()
    captureSession = nil
    previewLayer?.removeFromSuperlayer()
    previewLayer = nil
    videoOutput = nil
    stopRecordingInternal()
  }

  func captureOutput(_ output: AVCaptureOutput, didOutput sampleBuffer: CMSampleBuffer, from connection: AVCaptureConnection) {
    guard !isHandPoseProcessing,
          let pixelBuffer = CMSampleBufferGetImageBuffer(sampleBuffer) else { return }

    let width = CVPixelBufferGetWidth(pixelBuffer)
    let height = CVPixelBufferGetHeight(pixelBuffer)
    frameWidth = width
    frameHeight = height
    let timestamp = CMSampleBufferGetPresentationTimeStamp(sampleBuffer).seconds

    if assetWriterInput != nil, assetWriterInput?.isReadyForMoreMediaData == true {
      let pt = CMSampleBufferGetPresentationTimeStamp(sampleBuffer)
      if recordingSessionStartTime == nil { recordingSessionStartTime = pt }
      pixelBufferAdaptor?.append(pixelBuffer, withPresentationTime: pt)
      lastAppendedTime = pt
    }

    isHandPoseProcessing = true
    handPoseQueue.async { [weak self] in
      defer { self?.isHandPoseProcessing = false }
      self?.detectHandPose(pixelBuffer: pixelBuffer, timestamp: timestamp, width: width, height: height)
    }
  }

  private func detectHandPose(pixelBuffer: CVPixelBuffer, timestamp: TimeInterval, width: Int, height: Int) {
    let request = VNDetectHumanHandPoseRequest()
    request.maximumHandCount = 2

    // Match Vision orientation to our portrait video (buffer may be 1080x1920 after connection.videoOrientation)
    let orientation: CGImagePropertyOrientation = height > width ? .up : .right
    let handler = VNImageRequestHandler(cvPixelBuffer: pixelBuffer, orientation: orientation, options: [:])
    do {
      try handler.perform([request])
    } catch {
      return
    }

    guard let observations = request.results, !observations.isEmpty else { return }

    // Collect raw Vision points for conversion on main (preview layer must be accessed on main)
    typealias RawJoint = (name: String, x: CGFloat, y: CGFloat, confidence: Float)
    var rawHands: [(chirality: String, joints: [RawJoint])] = []
    for observation in observations {
      let chirality: String
      switch observation.chirality {
      case .left: chirality = "left"
      case .right: chirality = "right"
      default: chirality = "unknown"
      }
      guard let allPoints = try? observation.recognizedPoints(.all) else { continue }
      var joints: [RawJoint] = []
      for (jointName, point) in allPoints {
        guard point.confidence > 0.05 else { continue }
        let name = readableJointName(jointName)
        guard name != "unknown" else { continue }
        joints.append((name, point.location.x, point.location.y, point.confidence))
      }
      if !joints.isEmpty {
        rawHands.append((chirality: chirality, joints: joints))
      }
    }
    guard !rawHands.isEmpty else { return }

    let timestampCopy = timestamp
    let bufW = CGFloat(width)
    let bufH = CGFloat(height)
    DispatchQueue.main.async { [weak self] in
      guard let self = self, let layer = self.previewLayer else { return }
      let bounds = layer.bounds
      guard bounds.width > 0, bounds.height > 0, bufW > 0, bufH > 0 else { return }

      // Manual conversion: Vision uses normalized 0-1, origin bottom-left.
      // Preview uses resizeAspectFill: scale to cover, center crop.
      let scale = max(bounds.width / bufW, bounds.height / bufH)
      let scaledW = bufW * scale
      let scaledH = bufH * scale
      let offX = (scaledW - bounds.width) / 2
      let offY = (scaledH - bounds.height) / 2

      var handsArray: [[String: Any]] = []
      for raw in rawHands {
        var jointsArray: [[String: Any]] = []
        for j in raw.joints {
          // Vision: (vx, vy) normalized, origin bottom-left. vx right, vy up.
          // Map to layer coords (top-left origin, y down):
          // - In scaled image: x = vx * scaledW, y from top = (1-vy) * scaledH
          // - Layer shows center crop: subtract offset
          let layerX = j.x * scaledW - offX
          let layerY = (1.0 - j.y) * scaledH - offY
          let normX = layerX / bounds.width
          let normY = layerY / bounds.height
          jointsArray.append([
            "name": j.name,
            "x": normX,
            "y": normY,
            "z": 0.0,
            "confidence": j.confidence
          ])
        }
        handsArray.append(["chirality": raw.chirality, "joints": jointsArray])
      }

      let eventBody: [String: Any] = [
        "hands": handsArray,
        "timestamp": timestampCopy,
        "frameWidth": Int(bounds.width),
        "frameHeight": Int(bounds.height)
      ]
      NotificationCenter.default.post(
        name: iPhoneCameraModule.handPoseNotification,
        object: nil,
        userInfo: ["body": eventBody]
      )
    }
  }

  private func readableJointName(_ joint: VNHumanHandPoseObservation.JointName) -> String {
    switch joint {
    case .wrist: return "wrist"
    case .thumbCMC: return "thumbCMC"
    case .thumbMP: return "thumbMP"
    case .thumbIP: return "thumbIP"
    case .thumbTip: return "thumbTip"
    case .indexMCP: return "indexMCP"
    case .indexPIP: return "indexPIP"
    case .indexDIP: return "indexDIP"
    case .indexTip: return "indexTip"
    case .middleMCP: return "middleMCP"
    case .middlePIP: return "middlePIP"
    case .middleDIP: return "middleDIP"
    case .middleTip: return "middleTip"
    case .ringMCP: return "ringMCP"
    case .ringPIP: return "ringPIP"
    case .ringDIP: return "ringDIP"
    case .ringTip: return "ringTip"
    case .littleMCP: return "littleMCP"
    case .littlePIP: return "littlePIP"
    case .littleDIP: return "littleDIP"
    case .littleTip: return "littleTip"
    default: return "unknown"
    }
  }

  // MARK: - Recording

  private func stopRecordingInternal() {
    guard assetWriter != nil else { return }
    assetWriterInput?.markAsFinished()
    assetWriter?.finishWriting { [weak self] in
      self?.assetWriter = nil
      self?.assetWriterInput = nil
      self?.pixelBufferAdaptor = nil
      self?.recordingSessionStartTime = nil
      self?.lastAppendedTime = nil
    }
  }

  @objc func startRecording(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    let outputURL = FileManager.default.temporaryDirectory
      .appendingPathComponent(UUID().uuidString)
      .appendingPathExtension("mp4")

    do {
      let writer = try AVAssetWriter(outputURL: outputURL, fileType: .mp4)
      let settings: [String: Any] = [
        AVVideoCodecKey: AVVideoCodecType.h264,
        AVVideoWidthKey: frameWidth > 0 ? frameWidth : 1920,
        AVVideoHeightKey: frameHeight > 0 ? frameHeight : 1080,
      ]
      let input = AVAssetWriterInput(mediaType: .video, outputSettings: settings)
      input.expectsMediaDataInRealTime = true

      let adaptor = AVAssetWriterInputPixelBufferAdaptor(
        assetWriterInput: input,
        sourcePixelBufferAttributes: [
          kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA
        ]
      )

      if writer.canAdd(input) { writer.add(input) }

      assetWriter = writer
      assetWriterInput = input
      pixelBufferAdaptor = adaptor
      recordingSessionStartTime = nil
      lastAppendedTime = nil

      writer.startWriting()
      writer.startSession(atSourceTime: .zero)

      resolve(["filePath": outputURL.path])
    } catch {
      reject("RECORD_ERROR", error.localizedDescription, error)
    }
  }

  @objc func stopRecording(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    guard let writer = assetWriter else {
      reject("RECORD_ERROR", "No recording in progress", nil)
      return
    }

    let url = writer.outputURL
    let start = recordingSessionStartTime ?? .zero
    let end = lastAppendedTime ?? start

    assetWriterInput?.markAsFinished()
    writer.finishWriting { [weak self] in
      self?.assetWriter = nil
      self?.assetWriterInput = nil
      self?.pixelBufferAdaptor = nil
      self?.recordingSessionStartTime = nil
      self?.lastAppendedTime = nil

      var duration: Double = 0
      if writer.status == .completed {
        duration = max(0, CMTimeGetSeconds(CMTimeSubtract(end, start)))
      }
      resolve([
        "filePath": url.path,
        "duration": duration
      ])
    }
  }
}
