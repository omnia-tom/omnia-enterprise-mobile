import Vision
import CoreImage
import AVKit

/// Protocol for pluggable ML model consumers. Implement this to add new models
/// (e.g., MediaPipe) without touching the frame distribution code.
protocol MLModelConsumer: AnyObject {
  var modelName: String { get }
  var processEveryNFrames: Int { get }
  var isEnabled: Bool { get set }
  func process(cgImage: CGImage, timestamp: TimeInterval, width: Int, height: Int)
}

/// Manages all CPU-intensive ML inference on background queues with frame skipping
/// and back-pressure. The main thread is never blocked by ML work.
class MLProcessingPipeline {

  // MARK: - Built-in Consumers

  private let barcodeQueue = DispatchQueue(label: "com.spectask.barcode", qos: .userInitiated)
  private let handPoseQueue = DispatchQueue(label: "com.spectask.handPose", qos: .userInitiated)

  // Back-pressure flags — skip frames if still processing
  private var isBarcodeProcessing = false
  private var isHandPoseProcessing = false

  // Throttle rates
  private let barcodeEveryN: Int = 3   // ~5fps at 15fps input
  private let handPoseEveryN: Int = 2  // ~7.5fps at 15fps input

  // State
  var isBarcodeEnabled: Bool = true
  var isHandPoseEnabled: Bool = true

  // Barcode debouncing
  private var lastDetectedBarcode: String?
  private var lastDetectionTime: TimeInterval = 0
  private var announcedUPCs: Set<String> = []

  // External consumers
  private var consumers: [MLModelConsumer] = []
  private var consumersLock = os_unfair_lock()

  // Event emission
  weak var eventEmitter: MetaWearablesModule?

  // Speech synthesizer for barcode announcements
  private let speechSynthesizer = AVSpeechSynthesizer()

  // MARK: - Frame Processing

  func processFrame(_ metadata: FrameDistributor.FrameMetadata) {
    let frameNumber = metadata.frameNumber

    // Barcode detection with sharpness check
    if isBarcodeEnabled && frameNumber % barcodeEveryN == 0 && !isBarcodeProcessing {
      isBarcodeProcessing = true
      let cgImage = metadata.cgImage
      let timestamp = metadata.timestamp
      barcodeQueue.async { [weak self] in
        guard let self = self else { return }
        defer { self.isBarcodeProcessing = false }

        // Sharpness check before barcode
        guard self.isImageSharp(cgImage) else { return }
        self.detectBarcodes(in: cgImage)
      }
    }

    // Hand pose detection
    if isHandPoseEnabled && frameNumber % handPoseEveryN == 0 && !isHandPoseProcessing {
      isHandPoseProcessing = true
      let cgImage = metadata.cgImage
      let timestamp = metadata.timestamp
      let width = metadata.width
      let height = metadata.height
      handPoseQueue.async { [weak self] in
        guard let self = self else { return }
        defer { self.isHandPoseProcessing = false }
        self.detectHandPose(in: cgImage, timestamp: timestamp, width: width, height: height)
      }
    }

    // External consumers
    os_unfair_lock_lock(&consumersLock)
    let externalConsumers = consumers
    os_unfair_lock_unlock(&consumersLock)

    for consumer in externalConsumers where consumer.isEnabled {
      if frameNumber % consumer.processEveryNFrames == 0 {
        consumer.process(
          cgImage: metadata.cgImage,
          timestamp: metadata.timestamp,
          width: metadata.width,
          height: metadata.height
        )
      }
    }
  }

  // MARK: - Consumer Registration

  func registerConsumer(_ consumer: MLModelConsumer) {
    os_unfair_lock_lock(&consumersLock)
    consumers.append(consumer)
    os_unfair_lock_unlock(&consumersLock)
    print("[MLPipeline] Registered consumer: \(consumer.modelName)")
  }

  func removeConsumer(named name: String) {
    os_unfair_lock_lock(&consumersLock)
    consumers.removeAll { $0.modelName == name }
    os_unfair_lock_unlock(&consumersLock)
    print("[MLPipeline] Removed consumer: \(name)")
  }

  // MARK: - Barcode Detection

  private func detectBarcodes(in cgImage: CGImage) {
    let request = VNDetectBarcodesRequest { [weak self] request, error in
      guard let self = self else { return }

      if let error = error {
        print("[MLPipeline] Barcode detection error: \(error.localizedDescription)")
        return
      }

      guard let observations = request.results as? [VNBarcodeObservation] else { return }

      for observation in observations {
        guard let payload = observation.payloadStringValue else { continue }

        let currentTime = Date().timeIntervalSince1970
        var barcodeType = self.getBarcodeTypeName(observation.symbology)
        var finalPayload = payload

        if barcodeType == "EAN-13" && payload.count == 13 {
          finalPayload = String(payload.prefix(12))
        }

        let shouldEmit = (finalPayload != self.lastDetectedBarcode) ||
                        (currentTime - self.lastDetectionTime > 1.0)

        guard shouldEmit else { continue }

        self.lastDetectedBarcode = finalPayload
        self.lastDetectionTime = currentTime

        print("[MLPipeline] Barcode detected: \(barcodeType) = \(finalPayload)")

        DispatchQueue.main.async {
          self.eventEmitter?.sendEvent(withName: "onBarcodeDetected", body: [
            "type": barcodeType,
            "data": finalPayload,
            "confidence": observation.confidence,
            "timestamp": currentTime * 1000
          ])
        }

        if barcodeType.contains("UPC") && !self.announcedUPCs.contains(finalPayload) {
          self.announcedUPCs.insert(finalPayload)
          self.announceBarcode()
        }
      }
    }

    if #available(iOS 15.0, *) {
      request.revision = VNDetectBarcodesRequestRevision2
    }

    request.regionOfInterest = CGRect(x: 0.1, y: 0.1, width: 0.8, height: 0.8)
    request.symbologies = [.upce, .ean8, .ean13]

    let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
    do {
      try handler.perform([request])
    } catch {
      print("[MLPipeline] Failed to perform barcode detection: \(error)")
    }
  }

  // MARK: - Hand Pose Detection

  private func detectHandPose(in cgImage: CGImage, timestamp: TimeInterval, width: Int, height: Int) {
    let request = VNDetectHumanHandPoseRequest()
    request.maximumHandCount = 2

    let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
    do {
      try handler.perform([request])
    } catch {
      print("[MLPipeline] Hand pose detection error: \(error.localizedDescription)")
      return
    }

    guard let observations = request.results, !observations.isEmpty else { return }

    var handsArray: [[String: Any]] = []

    for observation in observations {
      let chirality: String
      switch observation.chirality {
      case .left: chirality = "left"
      case .right: chirality = "right"
      default: chirality = "unknown"
      }

      guard let allPoints = try? observation.recognizedPoints(.all) else { continue }

      var jointsArray: [[String: Any]] = []

      for (jointName, point) in allPoints {
        guard point.confidence > 0.1 else { continue }

        let name = readableJointName(jointName)
        guard name != "unknown" else { continue }

        let flippedY = 1.0 - point.location.y

        jointsArray.append([
          "name": name,
          "x": point.location.x,
          "y": flippedY,
          "confidence": point.confidence
        ])
      }

      guard !jointsArray.isEmpty else { continue }

      handsArray.append([
        "chirality": chirality,
        "joints": jointsArray
      ])
    }

    guard !handsArray.isEmpty else { return }

    let eventBody: [String: Any] = [
      "hands": handsArray,
      "timestamp": timestamp,
      "frameWidth": width,
      "frameHeight": height
    ]

    DispatchQueue.main.async { [weak self] in
      self?.eventEmitter?.sendEvent(withName: "onHandPoseDetected", body: eventBody)
    }
  }

  // MARK: - Sharpness Check

  private func isImageSharp(_ cgImage: CGImage) -> Bool {
    let ciImage = CIImage(cgImage: cgImage)

    guard let grayFilter = CIFilter(name: "CIColorControls") else { return true }
    grayFilter.setValue(ciImage, forKey: kCIInputImageKey)
    grayFilter.setValue(0.0, forKey: kCIInputSaturationKey)

    guard let grayOutput = grayFilter.outputImage else { return true }

    guard let edgeFilter = CIFilter(name: "CIEdges") else { return true }
    edgeFilter.setValue(grayOutput, forKey: kCIInputImageKey)
    edgeFilter.setValue(1.0, forKey: kCIInputIntensityKey)

    guard let edgeOutput = edgeFilter.outputImage else { return true }

    let context = CIContext(options: nil)
    let centerRect = CGRect(
      x: ciImage.extent.width * 0.4,
      y: ciImage.extent.height * 0.4,
      width: ciImage.extent.width * 0.2,
      height: ciImage.extent.height * 0.2
    )

    guard let edgeCGImage = context.createCGImage(edgeOutput, from: centerRect) else { return true }

    let width = edgeCGImage.width
    let height = edgeCGImage.height
    let bytesPerPixel = 4
    let bytesPerRow = bytesPerPixel * width
    let bitsPerComponent = 8

    var pixelData = [UInt8](repeating: 0, count: width * height * bytesPerPixel)

    guard let context2 = CGContext(
      data: &pixelData,
      width: width,
      height: height,
      bitsPerComponent: bitsPerComponent,
      bytesPerRow: bytesPerRow,
      space: CGColorSpaceCreateDeviceRGB(),
      bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
    ) else { return true }

    context2.draw(edgeCGImage, in: CGRect(x: 0, y: 0, width: width, height: height))

    var sum: Int = 0
    for i in 0..<(width * height) {
      let offset = i * bytesPerPixel
      sum += Int(pixelData[offset])
    }

    let mean = Double(sum) / Double(width * height)
    var variance: Double = 0

    for i in 0..<(width * height) {
      let offset = i * bytesPerPixel
      let gray = Double(pixelData[offset])
      variance += (gray - mean) * (gray - mean)
    }

    variance /= Double(width * height)
    return variance > 50.0
  }

  // MARK: - Helpers

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

  private func getBarcodeTypeName(_ symbology: VNBarcodeSymbology) -> String {
    switch symbology {
    case .upce: return "UPC-E"
    case .ean8: return "EAN-8"
    case .ean13: return "EAN-13"
    case .qr: return "QR"
    case .code128: return "Code 128"
    case .code39: return "Code 39"
    case .code93: return "Code 93"
    case .itf14: return "ITF-14"
    case .i2of5: return "I2of5"
    case .pdf417: return "PDF417"
    default:
      if #available(iOS 15.0, *) {
        if symbology == .codabar { return "Codabar" }
      }
      return "Unknown"
    }
  }

  private func announceBarcode() {
    DispatchQueue.main.async { [weak self] in
      guard let self = self else { return }

      let audioSession = AVAudioSession.sharedInstance()
      do {
        try audioSession.setCategory(.playback, mode: .spokenAudio, options: [.duckOthers])
        try audioSession.setActive(true)
      } catch {
        print("[MLPipeline] Failed to configure audio session: \(error.localizedDescription)")
      }

      let utterance = AVSpeechUtterance(string: "UPC found")
      utterance.voice = AVSpeechSynthesisVoice(language: "en-US")
      utterance.rate = 0.5
      utterance.volume = 1.0
      self.speechSynthesizer.speak(utterance)
    }
  }
}
