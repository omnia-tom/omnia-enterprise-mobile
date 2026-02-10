import Foundation
import React
import MWDATCore
import MWDATCamera
import Vision
import AVFoundation
import Photos
import Speech

@objc(MetaWearablesModule)
class MetaWearablesModule: RCTEventEmitter, AVAudioRecorderDelegate, AVSpeechSynthesizerDelegate, AVAudioPlayerDelegate {

  // Based on CameraAccess sample - Wearables.shared is the main SDK interface
  private var wearables: WearablesInterface?
  private var currentDevice: Device?
  private var deviceStreamTask: Task<Void, Never>?
  private var registrationTask: Task<Void, Never>?
  private var discoveredDevices: [DeviceIdentifier] = []
  private static var isSDKConfigured = false

  // Video streaming components
  private var streamSession: StreamSession?
  private var deviceSelector: AutoDeviceSelector?
  private var stateListenerToken: AnyListenerToken?
  private var videoFrameListenerToken: AnyListenerToken?
  private var errorListenerToken: AnyListenerToken?
  private var photoDataListenerToken: AnyListenerToken?

  // Barcode detection debouncing
  private var lastDetectedBarcode: String?
  private var lastDetectionTime: TimeInterval = 0

  // Frame skipping for better processing (process every 2nd frame)
  private var frameCounter: Int = 0

  // Track announced UPC codes to prevent re-announcing the same code
  private var announcedUPCs: Set<String> = []

  // Text-to-speech for barcode announcements
  private let speechSynthesizer = AVSpeechSynthesizer()

  // Speech completion tracking
  private var speechResolve: RCTPromiseResolveBlock?
  private var speechReject: RCTPromiseRejectBlock?

  // Audio playback (ElevenLabs TTS)
  private var audioPlayer: AVAudioPlayer?
  private var audioResolve: RCTPromiseResolveBlock?
  private var audioReject: RCTPromiseRejectBlock?

  // Voice recognition
  private var speechRecognizer: SFSpeechRecognizer?
  private var recognitionRequest: SFSpeechAudioBufferRecognitionRequest?
  private var recognitionTask: SFSpeechRecognitionTask?
  private var audioEngine: AVAudioEngine?
  private var isVoiceRecognitionActive: Bool = false

  // Video recording state
  private var isRecording: Bool = false
  private var recordedFrames: [(image: UIImage, timestamp: TimeInterval)] = []
  private var recordingStartTime: TimeInterval = 0

  // Audio recording
  private var audioRecorder: AVAudioRecorder?
  private var audioFileURL: URL?

  // Hand pose detection
  private let handPoseQueue = DispatchQueue(label: "com.omnia.handPoseDetection", qos: .userInitiated)
  private var isHandPoseEnabled: Bool = true

  override static func requiresMainQueueSetup() -> Bool {
    return true
  }

  override func supportedEvents() -> [String]! {
    return [
      "onDeviceFound",
      "onDeviceConnected",
      "onDeviceDisconnected",
      "onPairingComplete",
      "onError",
      "onVideoFrame",
      "onPhotoCaptured",
      "onBarcodeDetected",
      "onHandPoseDetected",
      "onVoiceCommand"
    ]
  }

  // MARK: - Initialization

  override init() {
    super.init()
    speechSynthesizer.delegate = self
    speechRecognizer = SFSpeechRecognizer(locale: Locale(identifier: "en-US"))
  }

  // Initialize the Meta Wearables SDK
  // Based on CameraAccess sample: use Wearables.configure() then Wearables.shared
  @objc
  func initializeSDK(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    print("[MetaWearables] initializeSDK called")
    Task { @MainActor [weak self] in
      guard let self = self else {
        reject("ERROR", "Module deallocated", nil)
        return
      }

      do {
        // Configure the SDK only once (it can only be configured once per app launch)
        if !MetaWearablesModule.isSDKConfigured {
          print("[MetaWearables] Configuring SDK for the first time...")
          try Wearables.configure()
          MetaWearablesModule.isSDKConfigured = true
        } else {
          print("[MetaWearables] SDK already configured, skipping configuration")
        }

        // Get the shared singleton instance
        let sharedWearables = Wearables.shared
        self.wearables = sharedWearables
        print("[MetaWearables] Got Wearables.shared instance")

        // Set up device selector for streaming (only if not already set)
        if self.deviceSelector == nil {
          self.deviceSelector = AutoDeviceSelector(wearables: sharedWearables)
          print("[MetaWearables] Created AutoDeviceSelector")
        }

        // Set up registration monitoring (only if not already set up)
        if self.registrationTask == nil {
          print("[MetaWearables] Setting up registration monitoring...")
          self.setupRegistrationMonitoring()
        } else {
          print("[MetaWearables] Registration monitoring already set up")
        }

        print("[MetaWearables] SDK initialized successfully")
        resolve(["success": true, "message": "SDK initialized successfully"])
      } catch {
        print("[MetaWearables] SDK initialization failed: \(error.localizedDescription)")
        reject("INIT_ERROR", "Failed to configure SDK: \(error.localizedDescription)", error)
      }
    }
  }

  private func setupRegistrationMonitoring() {
    // Monitor registration state changes based on CameraAccess sample pattern
    registrationTask = Task { [weak self] in
      guard let self = self, let wearables = self.wearables else { return }

      var previousState: RegistrationState = await wearables.registrationState
      print("[MetaWearables] Initial registration state: \(previousState)")

      // If already registered, setup device stream immediately
      if previousState == .registered {
        print("[MetaWearables] Already registered, setting up device stream")
        await self.setupDeviceStream()
      }

      for await registrationState in await wearables.registrationStateStream() {
        print("[MetaWearables] Registration state changed: \(previousState) -> \(registrationState)")
        print("[MetaWearables] Current devices count: \(await wearables.devices.count)")
        print("[MetaWearables] Checking if state is .registered: \(registrationState == .registered)")
        print("[MetaWearables] Checking if state is .registering: \(registrationState == .registering)")

        // Set up device stream when registered
        if registrationState == .registered {
          // Get the first available device ID if any
          let devices = await wearables.devices
          let deviceId = devices.first ?? ""
          print("[MetaWearables] Now in .registered state")
          print("[MetaWearables] Devices available: \(devices)")
          print("[MetaWearables] First device ID: '\(deviceId)'")

          // Only emit pairing complete if coming from registering state
          if previousState == .registering {
            print("[MetaWearables] Emitting onPairingComplete event")
            self.sendEvent(withName: "onPairingComplete", body: [
              "success": true,
              "deviceId": deviceId
            ])
          }

          // Always setup device stream when registered
          print("[MetaWearables] About to setup device stream...")
          await self.setupDeviceStream()
        } else if registrationState == .unavailable {
          print("[MetaWearables] State is .unavailable - device disconnected")
          self.currentDevice = nil
          self.sendEvent(withName: "onDeviceDisconnected", body: [:])
        } else if registrationState == .none {
          print("[MetaWearables] State is .unregistered - device disconnected")
          self.currentDevice = nil
          self.sendEvent(withName: "onDeviceDisconnected", body: [:])
        } else {
          print("[MetaWearables] State is something else: \(registrationState)")
        }

        previousState = registrationState
      }
    }
  }

  private func setupDeviceStream() async {
    guard let wearables = self.wearables else {
      print("[MetaWearables] Cannot setup device stream - wearables is nil")
      return
    }

    print("[MetaWearables] Setting up device stream...")

    // Cancel existing stream task
    deviceStreamTask?.cancel()

    deviceStreamTask = Task { @MainActor [weak self] in
      guard let self = self, let wearables = self.wearables else {
        print("[MetaWearables] Device stream task guard failed")
        return
      }

      print("[MetaWearables] Starting to listen for devices...")

      // Track previous devices to detect removals
      var previousDevices: Set<DeviceIdentifier> = []

      for await devices in await wearables.devicesStream() {
        print("[MetaWearables] Received devices update: \(devices.count) devices")
        let currentDevices = Set(devices)
        self.discoveredDevices = devices

        // Detect removed devices (devices that were in previous list but not in current)
        let removedDevices = previousDevices.subtracting(currentDevices)
        for removedDeviceId in removedDevices {
          print("[MetaWearables] Device removed from stream: \(removedDeviceId)")
          // Clear current device if it was the one that disconnected
          if let currentDeviceId = self.currentDevice?.identifier, currentDeviceId == removedDeviceId {
            self.currentDevice = nil
          }
          // Emit disconnect event
          self.sendEvent(withName: "onDeviceDisconnected", body: [
            "deviceId": removedDeviceId
          ])
        }

        // Emit events for newly discovered devices
        for deviceId in devices {
          print("[MetaWearables] Processing device: \(deviceId)")
          if let device = await wearables.deviceForIdentifier(deviceId) {
            print("[MetaWearables] Emitting deviceFound for: \(device.nameOrId())")
            self.sendEvent(withName: "onDeviceFound", body: [
              "id": deviceId, // DeviceIdentifier is already a String
              "name": device.nameOrId(),
              "isConnected": true
            ])
          } else {
            print("[MetaWearables] Could not get device for identifier: \(deviceId)")
          }
        }

        // Update previous devices for next iteration
        previousDevices = currentDevices
      }
    }
  }

  // MARK: - Device Discovery

  @objc
  func startDiscovery(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    Task { @MainActor [weak self] in
      guard let self = self else {
        reject("ERROR", "Module deallocated", nil)
        return
      }

      guard let wearables = self.wearables else {
        reject("NOT_INITIALIZED", "Wearables interface not initialized. Please ensure SDK is properly set up.", nil)
        return
      }

      // Check if already registered
      if wearables.registrationState == .registered {
        await self.setupDeviceStream()
        resolve(nil)
      } else {
        reject("NOT_REGISTERED", "Device registration required. Call startPairing first.", nil)
      }
    }
  }

  @objc
  func stopDiscovery(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    Task { @MainActor [weak self] in
      guard let self = self else {
        reject("ERROR", "Module deallocated", nil)
        return
      }

      // Stop device stream monitoring
      self.deviceStreamTask?.cancel()
      self.deviceStreamTask = nil
      resolve(nil)
    }
  }

  // MARK: - Device Connection

  @objc
  func connectToDevice(_ deviceId: String, resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    Task { @MainActor [weak self] in
      guard let self = self else {
        reject("ERROR", "Module deallocated", nil)
        return
      }

      guard let wearables = self.wearables else {
        reject("NOT_INITIALIZED", "Wearables interface not initialized", nil)
        return
      }

      guard let device = wearables.deviceForIdentifier(deviceId) else {
        reject("DEVICE_NOT_FOUND", "Device with ID \(deviceId) not found", nil)
        return
      }

      self.currentDevice = device

      self.sendEvent(withName: "onDeviceConnected", body: [
        "id": deviceId,
        "name": device.nameOrId(),
        "isConnected": true
      ])

      resolve([
        "id": deviceId,
        "name": device.nameOrId(),
        "isConnected": true
      ])
    }
  }

  @objc
  func disconnectDevice(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    Task { @MainActor [weak self] in
      guard let self = self else {
        reject("ERROR", "Module deallocated", nil)
        return
      }

      guard let wearables = self.wearables else {
        reject("NOT_INITIALIZED", "Wearables interface not initialized", nil)
        return
      }

      do {
        try wearables.startUnregistration()
        self.currentDevice = nil
        self.sendEvent(withName: "onDeviceDisconnected", body: [:])
        resolve(nil)
      } catch {
        self.sendEvent(withName: "onError", body: [
          "code": "DISCONNECT_ERROR",
          "message": error.localizedDescription
        ])
        reject("DISCONNECT_ERROR", error.localizedDescription, error)
      }
    }
  }

  // MARK: - URL Handling

  @objc
  func handleUrl(_ urlString: String, resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    Task { @MainActor [weak self] in
      guard let self = self else {
        reject("ERROR", "Module deallocated", nil)
        return
      }

      guard let wearables = self.wearables else {
        reject("NOT_INITIALIZED", "Wearables not initialized", nil)
        return
      }

      print("[MetaWearables] handleUrl called with: \(urlString)")

      guard let url = URL(string: urlString) else {
        reject("INVALID_URL", "Invalid URL string", nil)
        return
      }

      if let components = URLComponents(url: url, resolvingAgainstBaseURL: false) {
        let hasMetaAction = components.queryItems?.contains(where: { $0.name == "metaWearablesAction" }) == true
        print("[MetaWearables] URL has metaWearablesAction: \(hasMetaAction)")

        if !hasMetaAction {
          print("[MetaWearables] Not a Meta Wearables callback, ignoring")
          reject("INVALID_URL", "Not a Meta Wearables callback URL", nil)
          return
        }
      }

      do {
        print("[MetaWearables] Calling Wearables.shared.handleUrl()...")
        _ = try await wearables.handleUrl(url)
        print("[MetaWearables] Successfully handled Meta Wearables URL")
        print("[MetaWearables] Current registration state: \(await wearables.registrationState)")
        resolve(["success": true])
      } catch {
        print("[MetaWearables] Failed to handle Meta Wearables URL: \(error)")
        reject("HANDLE_URL_ERROR", error.localizedDescription, error)
      }
    }
  }

  // MARK: - Pairing

  @objc
  func startPairing(_ deviceId: String, resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    Task { @MainActor [weak self] in
      guard let self = self else {
        reject("ERROR", "Module deallocated", nil)
        return
      }

      guard let wearables = self.wearables else {
        reject("NOT_INITIALIZED", "Wearables interface not initialized", nil)
        return
      }

      do {
        let currentState = await wearables.registrationState
        print("[MetaWearables] startPairing called, current state: \(currentState)")

        if currentState == .registered {
          print("[MetaWearables] Already registered, setting up device stream")
          await self.setupDeviceStream()
          resolve(["success": true, "message": "Already registered, discovering devices..."])
          return
        }

        print("[MetaWearables] Starting registration...")
        try wearables.startRegistration()

        resolve(["success": true, "message": "Registration started. Please complete in Meta AI app."])
      } catch {
        print("[MetaWearables] Pairing error: \(error.localizedDescription)")
        self.sendEvent(withName: "onError", body: [
          "code": "PAIRING_ERROR",
          "message": error.localizedDescription
        ])
        reject("PAIRING_ERROR", error.localizedDescription, error)
      }
    }
  }

  // MARK: - Barcode Detection

  private func detectBarcodes(in image: UIImage) {
    guard let cgImage = image.cgImage else {
      return
    }

    let startTime = Date()

    guard let enhancedImage = self.preprocessImageForBarcode(cgImage) else {
      print("[MetaWearables] Failed to preprocess image")
      return
    }

    let request = VNDetectBarcodesRequest { [weak self] request, error in
      guard let self = self else { return }

      let processingTime = Date().timeIntervalSince(startTime) * 1000

      if let error = error {
        print("[MetaWearables] Barcode detection error: \(error.localizedDescription)")
        return
      }

      guard let observations = request.results as? [VNBarcodeObservation] else {
        return
      }

      for observation in observations {
        guard let payload = observation.payloadStringValue else {
          continue
        }

        let currentTime = Date().timeIntervalSince1970
        var barcodeType = self.getBarcodeTypeName(observation.symbology)
        var finalPayload = payload

        if barcodeType == "EAN-13" && payload.count == 13 {
          barcodeType = "EAN-13"
          finalPayload = String(payload.prefix(12))
        }

        let shouldEmit = (finalPayload != self.lastDetectedBarcode) ||
                        (currentTime - self.lastDetectionTime > 1.0)

        if !shouldEmit {
          continue
        }

        self.lastDetectedBarcode = finalPayload
        self.lastDetectionTime = currentTime

        print("[MetaWearables] Barcode detected: \(barcodeType) = \(finalPayload) (confidence: \(String(format: "%.1f%%", observation.confidence * 100)))")

        self.sendEvent(withName: "onBarcodeDetected", body: [
          "type": barcodeType,
          "data": finalPayload,
          "confidence": observation.confidence,
          "timestamp": currentTime * 1000
        ])

        if barcodeType.contains("UPC") && !self.announcedUPCs.contains(finalPayload) {
          self.announcedUPCs.insert(finalPayload)
          self.announceBarcode(barcodeType: barcodeType)
        }
      }
    }

    if #available(iOS 15.0, *) {
      request.revision = VNDetectBarcodesRequestRevision2
    }

    request.regionOfInterest = CGRect(x: 0.1, y: 0.1, width: 0.8, height: 0.8)

    request.symbologies = [
      .upce,
      .ean8,
      .ean13
    ]

    let handler = VNImageRequestHandler(cgImage: enhancedImage, options: [:])
    DispatchQueue.global(qos: .userInitiated).async {
      do {
        try handler.perform([request])
      } catch {
        print("[MetaWearables] Failed to perform barcode detection: \(error)")
      }
    }
  }

  // MARK: - Hand Pose Detection

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

  private func detectHandPose(in image: UIImage, timestamp: TimeInterval, width: Int, height: Int) {
    guard let cgImage = image.cgImage else { return }

    handPoseQueue.async { [weak self] in
      guard let self = self else { return }

      let request = VNDetectHumanHandPoseRequest()
      request.maximumHandCount = 2

      let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
      do {
        try handler.perform([request])
      } catch {
        print("[MetaWearables] Hand pose detection error: \(error.localizedDescription)")
        return
      }

      guard let observations = request.results, !observations.isEmpty else {
        return
      }

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

          let name = self.readableJointName(jointName)
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

      DispatchQueue.main.async {
        self.sendEvent(withName: "onHandPoseDetected", body: eventBody)
      }
    }
  }

  @objc
  func setHandPoseEnabled(_ enabled: Bool, resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    self.isHandPoseEnabled = enabled
    print("[MetaWearables] Hand pose detection \(enabled ? "enabled" : "disabled")")
    resolve(["success": true, "enabled": enabled])
  }

  private func preprocessImageForBarcode(_ cgImage: CGImage) -> CGImage? {
    return cgImage
  }

  private func upscaleImage(_ image: UIImage, targetScale: CGFloat) -> UIImage {
    let originalSize = image.size
    let newSize = CGSize(width: originalSize.width * targetScale, height: originalSize.height * targetScale)

    UIGraphicsBeginImageContextWithOptions(newSize, false, 1.0)
    image.draw(in: CGRect(origin: .zero, size: newSize))
    let upscaledImage = UIGraphicsGetImageFromCurrentImageContext()
    UIGraphicsEndImageContext()

    return upscaledImage ?? image
  }

  private func isImageSharp(_ image: UIImage) -> Bool {
    guard let cgImage = image.cgImage else { return false }

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
      let gray = Int(pixelData[offset])
      sum += gray
    }

    let mean = Double(sum) / Double(width * height)
    var variance: Double = 0

    for i in 0..<(width * height) {
      let offset = i * bytesPerPixel
      let gray = Double(pixelData[offset])
      variance += (gray - mean) * (gray - mean)
    }

    variance /= Double(width * height)

    let isSharp = variance > 50.0

    if !isSharp {
      print("[MetaWearables] Frame too blurry (variance: \(String(format: "%.1f", variance))) - skipping")
    }

    return isSharp
  }

  private func getBarcodeTypeName(_ symbology: VNBarcodeSymbology) -> String {
    switch symbology {
    case .upce:
      return "UPC-E"
    case .ean8:
      return "EAN-8"
    case .ean13:
      return "EAN-13"
    case .qr:
      return "QR"
    case .code128:
      return "Code 128"
    case .code39:
      return "Code 39"
    case .code93:
      return "Code 93"
    case .itf14:
      return "ITF-14"
    case .i2of5:
      return "I2of5"
    case .pdf417:
      return "PDF417"
    default:
      if #available(iOS 15.0, *) {
        if symbology == .codabar {
          return "Codabar"
        }
      }
      return "Unknown"
    }
  }

  // MARK: - Video Streaming

  private func setupStreamSession() async {
    await MainActor.run {
      guard let wearables = self.wearables,
            let deviceSelector = self.deviceSelector else {
        print("[MetaWearables] Cannot setup stream - wearables or deviceSelector is nil")
        return
      }

      print("[MetaWearables] Setting up stream session...")

      let config = StreamSessionConfig(
        videoCodec: VideoCodec.raw,
        resolution: StreamingResolution.high,
        frameRate: 15
      )

      print("[MetaWearables] Config: codec=raw, resolution=high, fps=15")

      streamSession = StreamSession(streamSessionConfig: config, deviceSelector: deviceSelector)
      print("[MetaWearables] StreamSession created")

      print("[MetaWearables] Subscribing to video frame publisher...")
      videoFrameListenerToken = streamSession?.videoFramePublisher.listen { [weak self] videoFrame in
        Task { @MainActor [weak self] in
          guard let self = self else { return }

          self.frameCounter += 1

          if self.frameCounter == 1 || self.frameCounter % 100 == 0 {
            print("[MetaWearables] Video frame #\(self.frameCounter) received")
          }

          if let image = videoFrame.makeUIImage() {
            // If recording is active, store the frame
            if self.isRecording {
              let currentTime = Date().timeIntervalSince1970
              self.recordedFrames.append((image: image, timestamp: currentTime))
              let frameCount = self.recordedFrames.count

              if frameCount % 100 == 0 {
                let duration = currentTime - self.recordingStartTime
                print("[MetaWearables] Recording: \(frameCount) frames (\(String(format: "%.1f", duration))s)")
              }

              if frameCount == 9000 {
                print("[MetaWearables] Long recording detected (\(frameCount) frames). Consider stopping to avoid memory issues.")
              }
            }

            // Always send frames to JS for the live preview
            if let imageData = self.convertImageToBase64(image) {
              self.sendEvent(withName: "onVideoFrame", body: [
                "data": imageData,
                "timestamp": Date().timeIntervalSince1970 * 1000,
                "width": Int(image.size.width),
                "height": Int(image.size.height)
              ])
            }

            // Only run barcode/hand detection on sharp frames
            if self.isImageSharp(image) {
              let upscaledImage = self.upscaleImage(image, targetScale: 2.0)
              self.detectBarcodes(in: upscaledImage)

              if self.isHandPoseEnabled {
                self.detectHandPose(
                  in: image,
                  timestamp: Date().timeIntervalSince1970 * 1000,
                  width: Int(image.size.width),
                  height: Int(image.size.height)
                )
              }
            }
          }
        }
      }
      print("[MetaWearables] Video frame listener registered")

      print("[MetaWearables] Subscribing to error publisher...")
      errorListenerToken = streamSession?.errorPublisher.listen { [weak self] error in
        Task { @MainActor [weak self] in
          guard let self = self else { return }

          print("[MetaWearables] Stream error received: \(error)")
          let errorMessage = self.formatStreamingError(error)

          self.sendEvent(withName: "onError", body: [
            "code": "STREAMING_ERROR",
            "message": errorMessage
          ])
        }
      }
      print("[MetaWearables] Error listener registered")

      photoDataListenerToken = streamSession?.photoDataPublisher.listen { [weak self] photoData in
        Task { @MainActor [weak self] in
          guard let self = self else { return }

          if let image = UIImage(data: photoData.data),
             let imageData = self.convertImageToBase64(image) {
            self.sendEvent(withName: "onPhotoCaptured", body: [
              "data": imageData,
              "timestamp": Date().timeIntervalSince1970 * 1000,
              "width": Int(image.size.width),
              "height": Int(image.size.height)
            ])
          }
        }
      }
    }
  }

  @objc
  func startVideoStream(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    Task { @MainActor [weak self] in
      guard let self = self else {
        reject("ERROR", "Module deallocated", nil)
        return
      }

      guard let wearables = self.wearables else {
        reject("NOT_INITIALIZED", "SDK not initialized", nil)
        return
      }

      print("[MetaWearables] startVideoStream called")

      do {
        let permission = Permission.camera
        print("[MetaWearables] Checking camera permission...")
        let status = try await wearables.checkPermissionStatus(permission)

        if status != .granted {
          print("[MetaWearables] Requesting camera permission from Meta AI...")
          let requestStatus = try await wearables.requestPermission(permission)

          if requestStatus != .granted {
            print("[MetaWearables] Camera permission denied")
            reject("PERMISSION_DENIED", "Camera permission denied", nil)
            return
          }
        }

        print("[MetaWearables] Camera permission granted")

        if self.streamSession == nil {
          print("[MetaWearables] Setting up stream session...")
          await self.setupStreamSession()

          if self.streamSession == nil {
            print("[MetaWearables] Failed to create stream session")
            reject("SETUP_FAILED", "Failed to create stream session", nil)
            return
          }
        } else {
          print("[MetaWearables] Using existing stream session")
        }

        print("[MetaWearables] Starting stream session...")
        await self.streamSession?.start()
        print("[MetaWearables] Stream session start() called - waiting for frames...")

        if let deviceSelector = self.deviceSelector {
          print("[MetaWearables] Device selector is configured")
        } else {
          print("[MetaWearables] WARNING: Device selector is nil!")
        }

        resolve(nil)

      } catch {
        print("[MetaWearables] Error starting video stream: \(error)")
        reject("VIDEO_STREAM_ERROR", error.localizedDescription, error)
      }
    }
  }

  @objc
  func stopVideoStream(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    Task { @MainActor [weak self] in
      guard let self = self else {
        reject("ERROR", "Module deallocated", nil)
        return
      }

      await self.streamSession?.stop()
      resolve(nil)
    }
  }

  private func formatStreamingError(_ error: StreamSessionError) -> String {
    return "Streaming error: \(error.localizedDescription)"
  }

  // MARK: - Photo Capture

  @objc
  func capturePhoto(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    Task { @MainActor [weak self] in
      guard let self = self else {
        reject("ERROR", "Module deallocated", nil)
        return
      }

      guard let streamSession = self.streamSession else {
        reject("NO_SESSION", "No streaming session active. Start video stream first.", nil)
        return
      }

      streamSession.capturePhoto(format: .jpeg)
      resolve(["success": true, "message": "Photo capture initiated"])
    }
  }

  // MARK: - Device Info

  @objc
  func getDeviceInfo(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    Task { @MainActor [weak self] in
      guard let self = self else {
        reject("ERROR", "Module deallocated", nil)
        return
      }

      guard let device = self.currentDevice else {
        reject("NO_DEVICE", "No device connected", nil)
        return
      }

      let deviceInfo: [String: Any] = [
        "id": device.identifier,
        "name": device.nameOrId(),
        "isConnected": true
      ]
      resolve(deviceInfo)
    }
  }

  @objc
  func getConnectionStatus(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    Task { @MainActor [weak self] in
      guard let self = self else {
        reject("ERROR", "Module deallocated", nil)
        return
      }

      guard let wearables = self.wearables else {
        resolve([
          "isConnected": false,
          "registrationState": "not_initialized",
          "deviceCount": 0
        ])
        return
      }

      let registrationState = await wearables.registrationState
      let devices = await wearables.devices
      let isConnected = (registrationState == .registered && !devices.isEmpty)

      let stateString: String
      switch registrationState {
      case .registered:
        stateString = "registered"
      case .registering:
        stateString = "registering"
      case .unavailable:
        stateString = "unavailable"
      @unknown default:
        stateString = "unknown"
      }

      var response: [String: Any] = [
        "isConnected": isConnected,
        "registrationState": stateString,
        "deviceCount": devices.count
      ]

      if isConnected, let device = self.currentDevice {
        response["deviceId"] = device.identifier
        response["deviceName"] = device.nameOrId()
      }

      resolve(response)
    }
  }

  // MARK: - Video Recording

  @objc
  func startRecording(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    Task { @MainActor [weak self] in
      guard let self = self else {
        reject("ERROR", "Module deallocated", nil)
        return
      }

      print("[MetaWearables] startRecording called")

      guard self.streamSession != nil else {
        reject("NO_SESSION", "No active streaming session. Start video stream first.", nil)
        return
      }

      if self.isRecording {
        reject("ALREADY_RECORDING", "Recording already in progress", nil)
        return
      }

      print("[MetaWearables] Starting video recording with audio...")
      self.isRecording = true
      self.recordedFrames = []
      self.recordingStartTime = Date().timeIntervalSince1970

      // Start audio recording
      do {
        try self.startAudioRecording()
        print("[MetaWearables] Audio recording started successfully")
      } catch {
        print("[MetaWearables] Failed to start audio recording: \(error.localizedDescription)")
      }

      resolve(["success": true, "message": "Recording started"])
    }
  }

  private func startAudioRecording() throws {
    let audioSession = AVAudioSession.sharedInstance()
    do {
      try audioSession.setCategory(.playAndRecord, mode: .videoRecording, options: [.defaultToSpeaker, .allowBluetooth])
      try audioSession.setActive(true, options: [])
    } catch {
      print("[MetaWearables] Audio session configuration failed: \(error.localizedDescription)")
      throw error
    }

    let tempDir = FileManager.default.temporaryDirectory
    let audioFileName = "meta_audio_\(Int(Date().timeIntervalSince1970)).m4a"
    let audioURL = tempDir.appendingPathComponent(audioFileName)

    try? FileManager.default.removeItem(at: audioURL)

    self.audioFileURL = audioURL

    let settings: [String: Any] = [
      AVFormatIDKey: Int(kAudioFormatMPEG4AAC),
      AVSampleRateKey: 44100.0,
      AVNumberOfChannelsKey: 1,
      AVEncoderAudioQualityKey: AVAudioQuality.high.rawValue
    ]

    do {
      let recorder = try AVAudioRecorder(url: audioURL, settings: settings)
      recorder.delegate = self

      if recorder.prepareToRecord() {
        if recorder.record() {
          self.audioRecorder = recorder
          print("[MetaWearables] Audio recording started to: \(audioURL.path)")
        } else {
          throw NSError(domain: "MetaWearables", code: 7, userInfo: [NSLocalizedDescriptionKey: "Failed to start audio recording"])
        }
      } else {
        throw NSError(domain: "MetaWearables", code: 8, userInfo: [NSLocalizedDescriptionKey: "Failed to prepare audio recorder"])
      }
    } catch {
      print("[MetaWearables] Audio recorder creation failed: \(error.localizedDescription)")
      throw error
    }
  }

  @objc
  func stopRecording(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    Task { @MainActor [weak self] in
      guard let self = self else {
        reject("ERROR", "Module deallocated", nil)
        return
      }

      if !self.isRecording {
        reject("NOT_RECORDING", "No recording in progress", nil)
        return
      }

      print("[MetaWearables] Stopping video recording...")
      self.isRecording = false

      self.audioRecorder?.stop()
      let audioURL = self.audioFileURL
      self.audioRecorder = nil

      let frameCount = self.recordedFrames.count
      let duration = Date().timeIntervalSince1970 - self.recordingStartTime

      guard frameCount > 0 else {
        if let audioURL = audioURL {
          try? FileManager.default.removeItem(at: audioURL)
        }
        reject("NO_FRAMES", "No frames were recorded", nil)
        return
      }

      print("[MetaWearables] Recorded \(frameCount) frames over \(String(format: "%.1f", duration))s")

      do {
        let videoPath = try await self.createVideoFromFrames(self.recordedFrames, audioURL: audioURL)
        print("[MetaWearables] Video saved to: \(videoPath)")

        self.recordedFrames = []

        if let audioURL = audioURL {
          try? FileManager.default.removeItem(at: audioURL)
        }
        self.audioFileURL = nil

        resolve([
          "success": true,
          "filePath": videoPath,
          "frameCount": frameCount,
          "duration": duration
        ])
      } catch {
        print("[MetaWearables] Failed to create video: \(error.localizedDescription)")
        if let audioURL = audioURL {
          try? FileManager.default.removeItem(at: audioURL)
        }
        self.audioFileURL = nil
        reject("VIDEO_CREATION_ERROR", error.localizedDescription, error)
      }
    }
  }

  private func createVideoFromFrames(_ frames: [(image: UIImage, timestamp: TimeInterval)], audioURL: URL?) async throws -> String {
    guard !frames.isEmpty else {
      throw NSError(domain: "MetaWearables", code: 1, userInfo: [NSLocalizedDescriptionKey: "No frames to process"])
    }

    let tempDir = FileManager.default.temporaryDirectory
    let fileName = "meta_recording_\(Int(Date().timeIntervalSince1970)).mov"
    let outputURL = tempDir.appendingPathComponent(fileName)

    try? FileManager.default.removeItem(at: outputURL)

    let firstFrame = frames[0].image
    let videoWidth = Int(firstFrame.size.width)
    let videoHeight = Int(firstFrame.size.height)

    let assetWriter = try AVAssetWriter(outputURL: outputURL, fileType: .mov)

    let videoSettings: [String: Any] = [
      AVVideoCodecKey: AVVideoCodecType.h264,
      AVVideoWidthKey: videoWidth,
      AVVideoHeightKey: videoHeight,
      AVVideoCompressionPropertiesKey: [
        AVVideoAverageBitRateKey: 6000000,
        AVVideoMaxKeyFrameIntervalKey: 30
      ]
    ]

    let assetWriterInput = AVAssetWriterInput(mediaType: .video, outputSettings: videoSettings)
    assetWriterInput.expectsMediaDataInRealTime = false

    let sourcePixelBufferAttributes: [String: Any] = [
      kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32ARGB,
      kCVPixelBufferWidthKey as String: videoWidth,
      kCVPixelBufferHeightKey as String: videoHeight
    ]

    let pixelBufferAdaptor = AVAssetWriterInputPixelBufferAdaptor(
      assetWriterInput: assetWriterInput,
      sourcePixelBufferAttributes: sourcePixelBufferAttributes
    )

    guard assetWriter.canAdd(assetWriterInput) else {
      throw NSError(domain: "MetaWearables", code: 2, userInfo: [NSLocalizedDescriptionKey: "Cannot add input to asset writer"])
    }

    assetWriter.add(assetWriterInput)

    var audioWriterInput: AVAssetWriterInput?
    var audioReader: AVAssetReader?
    var audioReaderOutput: AVAssetReaderTrackOutput?

    if let audioURL = audioURL, FileManager.default.fileExists(atPath: audioURL.path) {
      do {
        let audioAsset = AVAsset(url: audioURL)
        guard let audioTrack = try await audioAsset.loadTracks(withMediaType: .audio).first else {
          throw NSError(domain: "MetaWearables", code: 6, userInfo: [NSLocalizedDescriptionKey: "No audio track found"])
        }

        let reader = try AVAssetReader(asset: audioAsset)
        let readerOutput = AVAssetReaderTrackOutput(track: audioTrack, outputSettings: nil)
        reader.add(readerOutput)
        audioReader = reader
        audioReaderOutput = readerOutput

        let audioSettings: [String: Any] = [
          AVFormatIDKey: kAudioFormatMPEG4AAC,
          AVSampleRateKey: 44100,
          AVNumberOfChannelsKey: 1,
          AVEncoderBitRateKey: 128000
        ]

        let audioInput = AVAssetWriterInput(mediaType: .audio, outputSettings: audioSettings)
        audioInput.expectsMediaDataInRealTime = false

        if assetWriter.canAdd(audioInput) {
          assetWriter.add(audioInput)
          audioWriterInput = audioInput
        }
      } catch {
        print("[MetaWearables] Failed to add audio track: \(error.localizedDescription)")
      }
    }

    guard assetWriter.startWriting() else {
      throw NSError(domain: "MetaWearables", code: 3, userInfo: [NSLocalizedDescriptionKey: "Failed to start writing: \(assetWriter.error?.localizedDescription ?? "unknown error")"])
    }

    assetWriter.startSession(atSourceTime: .zero)

    let fps: Int32 = 15
    let frameDuration = CMTimeMake(value: 1, timescale: fps)

    var frameIndex = 0
    for (image, _) in frames {
      while !assetWriterInput.isReadyForMoreMediaData {
        try await Task.sleep(nanoseconds: 10_000_000)
      }

      guard let pixelBuffer = self.pixelBuffer(from: image, size: CGSize(width: videoWidth, height: videoHeight)) else {
        continue
      }

      let presentationTime = CMTimeMultiply(frameDuration, multiplier: Int32(frameIndex))

      if !pixelBufferAdaptor.append(pixelBuffer, withPresentationTime: presentationTime) {
        print("[MetaWearables] Failed to append frame \(frameIndex)")
      }

      frameIndex += 1

      if frameIndex % 30 == 0 {
        print("[MetaWearables] Progress: \(frameIndex)/\(frames.count) frames written")
      }
    }

    assetWriterInput.markAsFinished()

    if let audioInput = audioWriterInput,
       let reader = audioReader,
       let readerOutput = audioReaderOutput {

      reader.startReading()

      while audioInput.isReadyForMoreMediaData {
        guard let sampleBuffer = readerOutput.copyNextSampleBuffer() else {
          break
        }
        audioInput.append(sampleBuffer)
      }

      audioInput.markAsFinished()
    }

    let videoPath = try await withCheckedThrowingContinuation { continuation in
      assetWriter.finishWriting {
        if assetWriter.status == .completed {
          continuation.resume(returning: outputURL.path)
        } else if let error = assetWriter.error {
          continuation.resume(throwing: error)
        } else {
          let error = NSError(domain: "MetaWearables", code: 4, userInfo: [NSLocalizedDescriptionKey: "Unknown error during video writing"])
          continuation.resume(throwing: error)
        }
      }
    }

    let savedPath = try await self.saveVideoToPhotosLibrary(videoURL: outputURL)
    return savedPath
  }

  private func saveVideoToPhotosLibrary(videoURL: URL) async throws -> String {
    let status = PHPhotoLibrary.authorizationStatus(for: .addOnly)

    if status == .notDetermined {
      let newStatus = await PHPhotoLibrary.requestAuthorization(for: .addOnly)
      if newStatus != .authorized {
        throw NSError(domain: "MetaWearables", code: 5, userInfo: [NSLocalizedDescriptionKey: "Photos library permission denied"])
      }
    } else if status != .authorized {
      throw NSError(domain: "MetaWearables", code: 5, userInfo: [NSLocalizedDescriptionKey: "Photos library permission denied"])
    }

    var localIdentifier: String?

    try await PHPhotoLibrary.shared().performChanges {
      let request = PHAssetCreationRequest.forAsset()
      request.addResource(with: .video, fileURL: videoURL, options: nil)
      localIdentifier = request.placeholderForCreatedAsset?.localIdentifier
    }

    try? FileManager.default.removeItem(at: videoURL)

    return localIdentifier ?? "Photos Library"
  }

  private func pixelBuffer(from image: UIImage, size: CGSize) -> CVPixelBuffer? {
    let attrs = [
      kCVPixelBufferCGImageCompatibilityKey: kCFBooleanTrue!,
      kCVPixelBufferCGBitmapContextCompatibilityKey: kCFBooleanTrue!
    ] as CFDictionary

    var pixelBuffer: CVPixelBuffer?
    let status = CVPixelBufferCreate(
      kCFAllocatorDefault,
      Int(size.width),
      Int(size.height),
      kCVPixelFormatType_32ARGB,
      attrs,
      &pixelBuffer
    )

    guard status == kCVReturnSuccess, let buffer = pixelBuffer else {
      return nil
    }

    CVPixelBufferLockBaseAddress(buffer, [])
    defer { CVPixelBufferUnlockBaseAddress(buffer, []) }

    let pixelData = CVPixelBufferGetBaseAddress(buffer)

    let rgbColorSpace = CGColorSpaceCreateDeviceRGB()
    guard let context = CGContext(
      data: pixelData,
      width: Int(size.width),
      height: Int(size.height),
      bitsPerComponent: 8,
      bytesPerRow: CVPixelBufferGetBytesPerRow(buffer),
      space: rgbColorSpace,
      bitmapInfo: CGImageAlphaInfo.premultipliedFirst.rawValue
    ) else {
      return nil
    }

    let rect = CGRect(x: 0, y: 0, width: size.width, height: size.height)
    if let cgImage = image.cgImage {
      context.draw(cgImage, in: rect)
    } else {
      UIGraphicsPushContext(context)
      image.draw(in: rect)
      UIGraphicsPopContext()
    }

    return buffer
  }

  // MARK: - Helper Methods

  private func announceBarcode(barcodeType: String) {
    DispatchQueue.main.async { [weak self] in
      guard let self = self else { return }

      let audioSession = AVAudioSession.sharedInstance()
      do {
        try audioSession.setCategory(.playback, mode: .spokenAudio, options: [.duckOthers])
        try audioSession.setActive(true)
      } catch {
        print("[MetaWearables] Failed to configure audio session: \(error.localizedDescription)")
      }

      let utterance = AVSpeechUtterance(string: "UPC found")
      utterance.voice = AVSpeechSynthesisVoice(language: "en-US")
      utterance.rate = 0.5
      utterance.volume = 1.0
      utterance.pitchMultiplier = 1.0

      self.speechSynthesizer.speak(utterance)
      print("[MetaWearables] Announced: 'UPC found'")
    }
  }

  // MARK: - Text-to-Speech (with completion delegate)

  @objc
  func speakInstruction(_ text: String, resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    DispatchQueue.main.async { [weak self] in
      guard let self = self else {
        reject("ERROR", "Module deallocated", nil)
        return
      }

      let audioSession = AVAudioSession.sharedInstance()
      do {
        try audioSession.setCategory(.playAndRecord, mode: .spokenAudio, options: [.defaultToSpeaker, .allowBluetooth])
        try audioSession.setActive(true)
      } catch {
        print("[MetaWearables] Failed to configure audio session: \(error.localizedDescription)")
      }

      // Store resolve/reject for delegate callback
      self.speechResolve = resolve
      self.speechReject = reject

      let utterance = AVSpeechUtterance(string: text)
      utterance.voice = AVSpeechSynthesisVoice(language: "en-US")
      utterance.rate = 0.42
      utterance.volume = 1.0
      utterance.pitchMultiplier = 1.0
      utterance.preUtteranceDelay = 0.1
      utterance.postUtteranceDelay = 0.3

      self.speechSynthesizer.speak(utterance)
      print("[MetaWearables] Speaking instruction: '\(text)'")
    }
  }

  // MARK: - AVSpeechSynthesizerDelegate

  func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didFinish utterance: AVSpeechUtterance) {
    DispatchQueue.main.async { [weak self] in
      guard let self = self else { return }
      let resolve = self.speechResolve
      self.speechResolve = nil
      self.speechReject = nil
      resolve?(nil)
    }
  }

  func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didCancel utterance: AVSpeechUtterance) {
    DispatchQueue.main.async { [weak self] in
      guard let self = self else { return }
      let resolve = self.speechResolve
      self.speechResolve = nil
      self.speechReject = nil
      resolve?(nil)
    }
  }

  // MARK: - Audio Data Playback (ElevenLabs TTS)

  @objc
  func playAudioData(_ base64String: String, resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    DispatchQueue.main.async { [weak self] in
      guard let self = self else {
        reject("ERROR", "Module deallocated", nil)
        return
      }

      guard let audioData = Data(base64Encoded: base64String) else {
        reject("INVALID_DATA", "Failed to decode base64 audio data", nil)
        return
      }

      // Stop any current audio playback
      self.audioPlayer?.stop()

      do {
        // During recording, match the audio session startAudioRecording() already set.
        // Re-setting the same values won't trigger Bluetooth renegotiation.
        // Before recording, don't touch the session — play through Meta SDK's session.
        if self.isRecording || self.audioRecorder != nil {
          let audioSession = AVAudioSession.sharedInstance()
          try audioSession.setCategory(.playAndRecord, mode: .videoRecording, options: [.defaultToSpeaker, .allowBluetooth])
          try audioSession.setActive(true)
        }

        self.audioResolve = resolve
        self.audioReject = reject

        self.audioPlayer = try AVAudioPlayer(data: audioData)
        self.audioPlayer?.delegate = self
        self.audioPlayer?.play()
        print("[MetaWearables] Playing ElevenLabs audio (\(audioData.count) bytes)")
      } catch {
        self.audioResolve = nil
        self.audioReject = nil
        reject("PLAYBACK_ERROR", "Failed to play audio: \(error.localizedDescription)", error)
      }
    }
  }

  // MARK: - AVAudioPlayerDelegate

  func audioPlayerDidFinishPlaying(_ player: AVAudioPlayer, successfully flag: Bool) {
    DispatchQueue.main.async { [weak self] in
      guard let self = self else { return }
      let resolve = self.audioResolve
      self.audioResolve = nil
      self.audioReject = nil
      self.audioPlayer = nil
      resolve?(nil)
    }
  }

  func audioPlayerDecodeErrorDidOccur(_ player: AVAudioPlayer, error: Error?) {
    DispatchQueue.main.async { [weak self] in
      guard let self = self else { return }
      let reject = self.audioReject
      self.audioResolve = nil
      self.audioReject = nil
      self.audioPlayer = nil
      reject?("DECODE_ERROR", "Audio decode error: \(error?.localizedDescription ?? "unknown")", error)
    }
  }

  // MARK: - Voice Recognition

  @objc
  func startVoiceRecognition(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    DispatchQueue.main.async { [weak self] in
      guard let self = self else {
        reject("ERROR", "Module deallocated", nil)
        return
      }

      guard let speechRecognizer = self.speechRecognizer, speechRecognizer.isAvailable else {
        reject("UNAVAILABLE", "Speech recognition is not available", nil)
        return
      }

      // Request authorization
      SFSpeechRecognizer.requestAuthorization { [weak self] authStatus in
        DispatchQueue.main.async {
          guard let self = self else { return }

          switch authStatus {
          case .authorized:
            do {
              try self.startRecognitionEngine()
              self.isVoiceRecognitionActive = true
              resolve(["success": true])
            } catch {
              reject("ENGINE_ERROR", "Failed to start recognition: \(error.localizedDescription)", error)
            }
          case .denied:
            reject("DENIED", "Speech recognition permission denied", nil)
          case .restricted:
            reject("RESTRICTED", "Speech recognition restricted on this device", nil)
          case .notDetermined:
            reject("NOT_DETERMINED", "Speech recognition authorization not determined", nil)
          @unknown default:
            reject("UNKNOWN", "Unknown authorization status", nil)
          }
        }
      }
    }
  }

  private func startRecognitionEngine() throws {
    // Cancel previous task if any
    recognitionTask?.cancel()
    recognitionTask = nil

    let audioSession = AVAudioSession.sharedInstance()
    try audioSession.setCategory(.playAndRecord, mode: .measurement, options: [.defaultToSpeaker, .allowBluetooth])
    try audioSession.setActive(true, options: .notifyOthersOnDeactivation)

    recognitionRequest = SFSpeechAudioBufferRecognitionRequest()
    guard let recognitionRequest = recognitionRequest else {
      throw NSError(domain: "MetaWearables", code: 10, userInfo: [NSLocalizedDescriptionKey: "Unable to create recognition request"])
    }
    recognitionRequest.shouldReportPartialResults = true

    let engine = AVAudioEngine()
    self.audioEngine = engine

    let inputNode = engine.inputNode
    let recordingFormat = inputNode.outputFormat(forBus: 0)

    inputNode.installTap(onBus: 0, bufferSize: 1024, format: recordingFormat) { [weak self] buffer, _ in
      self?.recognitionRequest?.append(buffer)
    }

    engine.prepare()
    try engine.start()

    recognitionTask = speechRecognizer?.recognitionTask(with: recognitionRequest) { [weak self] result, error in
      guard let self = self else { return }

      if let result = result {
        let transcript = result.bestTranscription.formattedString.lowercased()
        // Check last few words for commands
        let words = transcript.split(separator: " ")
        let lastWords = words.suffix(3).map { String($0) }

        for word in lastWords {
          var command: String? = nil
          if word == "next" {
            command = "next"
          } else if word == "repeat" {
            command = "repeat"
          } else if word == "done" || word == "complete" || word == "finished" || word == "stop" {
            command = "done"
          } else if word == "start" || word == "begin" {
            command = "start"
          }

          if let cmd = command {
            DispatchQueue.main.async {
              self.sendEvent(withName: "onVoiceCommand", body: [
                "command": cmd,
                "transcript": transcript
              ])
            }
          }
        }

        // Auto-restart when recognition finalizes (SFSpeechRecognizer has ~1min limit)
        if result.isFinal && self.isVoiceRecognitionActive {
          self.restartRecognitionEngine()
        }
      }

      if let error = error, self.isVoiceRecognitionActive {
        print("[MetaWearables] Voice recognition error: \(error.localizedDescription)")
        self.restartRecognitionEngine()
      }
    }
  }

  private func restartRecognitionEngine() {
    // Clean up current engine
    audioEngine?.stop()
    audioEngine?.inputNode.removeTap(onBus: 0)
    recognitionRequest?.endAudio()
    recognitionRequest = nil
    recognitionTask = nil
    audioEngine = nil

    // Restart after brief delay
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) { [weak self] in
      guard let self = self, self.isVoiceRecognitionActive else { return }
      do {
        try self.startRecognitionEngine()
      } catch {
        print("[MetaWearables] Failed to restart voice recognition: \(error.localizedDescription)")
      }
    }
  }

  @objc
  func stopVoiceRecognition(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    DispatchQueue.main.async { [weak self] in
      guard let self = self else {
        reject("ERROR", "Module deallocated", nil)
        return
      }

      self.isVoiceRecognitionActive = false
      self.audioEngine?.stop()
      self.audioEngine?.inputNode.removeTap(onBus: 0)
      self.recognitionRequest?.endAudio()
      self.recognitionTask?.cancel()

      self.recognitionRequest = nil
      self.recognitionTask = nil
      self.audioEngine = nil

      print("[MetaWearables] Voice recognition stopped")
      resolve(["success": true])
    }
  }

  // MARK: - Utility

  private func convertImageToBase64(_ image: UIImage) -> String? {
    if let imageData = image.jpegData(compressionQuality: 0.8) {
      return imageData.base64EncodedString()
    }
    return nil
  }

  // MARK: - AVAudioRecorderDelegate

  func audioRecorderDidFinishRecording(_ recorder: AVAudioRecorder, successfully flag: Bool) {
    if flag {
      print("[MetaWearables] Audio recording finished successfully")
    } else {
      print("[MetaWearables] Audio recording finished unsuccessfully")
    }
  }

  func audioRecorderEncodeErrorDidOccur(_ recorder: AVAudioRecorder, error: Error?) {
    if let error = error {
      print("[MetaWearables] Audio recording encode error: \(error.localizedDescription)")
      self.isRecording = false
      self.audioRecorder?.stop()
      self.audioRecorder = nil
    }
  }

  // Clean up resources
  deinit {
    registrationTask?.cancel()
    deviceStreamTask?.cancel()

    audioRecorder?.stop()
    audioRecorder = nil

    // Stop voice recognition
    isVoiceRecognitionActive = false
    audioEngine?.stop()
    audioEngine?.inputNode.removeTap(onBus: 0)
    recognitionRequest?.endAudio()
    recognitionTask?.cancel()

    stateListenerToken = nil
    videoFrameListenerToken = nil
    errorListenerToken = nil
    photoDataListenerToken = nil
    streamSession = nil
  }
}
