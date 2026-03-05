import Foundation
import React
import MWDATCore
import MWDATCamera
import Vision
import AVFoundation
import Photos
import Speech
import VideoToolbox

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

  // Frame counter (for logging)
  private var frameCounter: Int = 0

  // Background queue for frame extraction (frees main thread)
  private let frameExtractionQueue = DispatchQueue(label: "com.spectask.frameExtraction", qos: .userInteractive)

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

  // Video recording — now uses StreamingRecorder (O(1) memory)
  private var isRecording: Bool = false
  private var streamingRecorder: StreamingRecorder?
  private var recordingStartTime: TimeInterval = 0

  // ML Processing Pipeline — runs on background queues
  private var mlPipeline: MLProcessingPipeline?

  // Hand pose detection toggle
  private var isHandPoseEnabled: Bool = true

  // Step validation (FastVLM)
  private var stepValidator: Any?  // StepValidator (iOS 18.2+)

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
      "onVoiceCommand",
      "onStreamingStats",
      "onStepValidation"
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
        let devices = await wearables.devices
        print("[MetaWearables] Current devices count: \(devices.count)")

        // Set up device stream when registered
        if registrationState == .registered {
          let deviceId = devices.first ?? ""
          print("[MetaWearables] Now in .registered state, devices: \(devices)")

          if previousState == .registering {
            print("[MetaWearables] Emitting onPairingComplete event")
            self.sendEvent(withName: "onPairingComplete", body: [
              "success": true,
              "deviceId": deviceId
            ])
          }

          print("[MetaWearables] About to setup device stream...")
          await self.setupDeviceStream()
        } else if registrationState == .unavailable {
          print("[MetaWearables] State is .unavailable - device disconnected")
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
    guard self.wearables != nil else {
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

      var previousDevices: Set<DeviceIdentifier> = []

      for await devices in wearables.devicesStream() {
        print("[MetaWearables] Received devices update: \(devices.count) devices")
        let currentDevices = Set(devices)
        self.discoveredDevices = devices

        let removedDevices = previousDevices.subtracting(currentDevices)
        for removedDeviceId in removedDevices {
          print("[MetaWearables] Device removed from stream: \(removedDeviceId)")
          if let currentDeviceId = self.currentDevice?.identifier, currentDeviceId == removedDeviceId {
            self.currentDevice = nil
          }
          self.sendEvent(withName: "onDeviceDisconnected", body: [
            "deviceId": removedDeviceId
          ])
        }

        for deviceId in devices {
          print("[MetaWearables] Processing device: \(deviceId)")
          if let device = wearables.deviceForIdentifier(deviceId) {
            print("[MetaWearables] Emitting deviceFound for: \(device.nameOrId())")
            self.sendEvent(withName: "onDeviceFound", body: [
              "id": deviceId,
              "name": device.nameOrId(),
              "isConnected": true
            ])
          }
        }

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
        let currentState = wearables.registrationState
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

  // MARK: - Hand Pose Toggle

  @objc
  func setHandPoseEnabled(_ enabled: Bool, resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    self.isHandPoseEnabled = enabled
    self.mlPipeline?.isHandPoseEnabled = enabled
    print("[MetaWearables] Hand pose detection \(enabled ? "enabled" : "disabled")")
    resolve(["success": true, "enabled": enabled])
  }

  // MARK: - Video Streaming

  private func setupStreamSession() async {
    await MainActor.run {
      guard self.wearables != nil,
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

      // Initialize ML pipeline
      let pipeline = MLProcessingPipeline()
      pipeline.eventEmitter = self
      pipeline.isHandPoseEnabled = self.isHandPoseEnabled
      self.mlPipeline = pipeline
      FrameDistributor.shared.setMLPipeline(pipeline)

      // Wire up FrameDistributor for event emission + stats
      FrameDistributor.shared.eventEmitter = self
      FrameDistributor.shared.startStatsEmission()

      print("[MetaWearables] Subscribing to video frame publisher...")
      videoFrameListenerToken = streamSession?.videoFramePublisher.listen { [weak self] videoFrame in
        guard let self = self else { return }

        self.frameExtractionQueue.async { [weak self] in
          guard let self = self else { return }

          self.frameCounter += 1
          let frameNum = self.frameCounter

          if frameNum == 1 || frameNum % 100 == 0 {
            print("[MetaWearables] Video frame #\(frameNum) received")
          }

          let timestamp = Date().timeIntervalSince1970

          // Fast path: extract CVPixelBuffer (zero-copy) + CGImage from sample buffer
          if let pixelBuffer = CMSampleBufferGetImageBuffer(videoFrame.sampleBuffer) {
            var cgImage: CGImage?
            let vtStatus = VTCreateCGImageFromCVPixelBuffer(pixelBuffer, options: nil, imageOut: &cgImage)

            if vtStatus == noErr, let cgImage = cgImage {
              let width = CVPixelBufferGetWidth(pixelBuffer)
              let height = CVPixelBufferGetHeight(pixelBuffer)

              FrameDistributor.shared.distributeFrame(cgImage, pixelBuffer: pixelBuffer, timestamp: timestamp, width: width, height: height)
              return
            }
          }

          // Fallback: use makeUIImage() if CMSampleBufferGetImageBuffer returns nil
          if let image = videoFrame.makeUIImage(), let cgImage = image.cgImage {
            let width = Int(image.size.width)
            let height = Int(image.size.height)

            FrameDistributor.shared.distributeFrame(cgImage, pixelBuffer: nil, timestamp: timestamp, width: width, height: height)
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

      // Clean up pipeline and distributor
      FrameDistributor.shared.stopStatsEmission()
      FrameDistributor.shared.setMLPipeline(nil)
      FrameDistributor.shared.setRecorder(nil)
      FrameDistributor.shared.reset()
      self.mlPipeline = nil

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

      let registrationState = wearables.registrationState
      let devices = wearables.devices
      let isConnected = (registrationState == .registered && !devices.isEmpty)

      let stateString: String
      switch registrationState {
      case .registered:
        stateString = "registered"
      case .registering:
        stateString = "registering"
      case .unavailable:
        stateString = "unavailable"
      case .available:
        stateString = "available"
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

  // MARK: - Video Recording (StreamingRecorder — O(1) memory)

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

      print("[MetaWearables] Starting video recording with StreamingRecorder...")

      // Default to 640x480 — will be updated on first frame if different
      let recorder = StreamingRecorder()
      do {
        try recorder.startRecording(width: 640, height: 480)
      } catch {
        reject("RECORDING_ERROR", "Failed to start recording: \(error.localizedDescription)", error)
        return
      }

      self.streamingRecorder = recorder
      self.isRecording = true
      self.recordingStartTime = Date().timeIntervalSince1970

      // Register with FrameDistributor so it receives frames
      FrameDistributor.shared.setRecorder(recorder)

      resolve(["success": true, "message": "Recording started"])
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

      // Unregister from FrameDistributor
      FrameDistributor.shared.setRecorder(nil)

      guard let recorder = self.streamingRecorder else {
        reject("NO_RECORDER", "No streaming recorder available", nil)
        return
      }

      recorder.stopRecording { [weak self] result in
        DispatchQueue.main.async {
          switch result {
          case .success(let info):
            print("[MetaWearables] Recording saved: \(info.filePath)")
            self?.streamingRecorder = nil
            resolve([
              "success": true,
              "filePath": info.filePath,
              "frameCount": info.frameCount,
              "duration": info.duration
            ])
          case .failure(let error):
            print("[MetaWearables] Recording failed: \(error.localizedDescription)")
            self?.streamingRecorder = nil
            reject("VIDEO_CREATION_ERROR", error.localizedDescription, error)
          }
        }
      }
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
        try audioSession.setCategory(.playAndRecord, mode: .spokenAudio, options: [.defaultToSpeaker, .allowBluetoothHFP])
        try audioSession.setActive(true)
      } catch {
        print("[MetaWearables] Failed to configure audio session: \(error.localizedDescription)")
      }

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

      self.audioPlayer?.stop()

      do {
        if self.isRecording {
          let audioSession = AVAudioSession.sharedInstance()
          try audioSession.setCategory(.playAndRecord, mode: .videoRecording, options: [.defaultToSpeaker, .allowBluetoothHFP])
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
    recognitionTask?.cancel()
    recognitionTask = nil

    let audioSession = AVAudioSession.sharedInstance()
    try audioSession.setCategory(.playAndRecord, mode: .measurement, options: [.defaultToSpeaker, .allowBluetoothHFP])
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
          } else if word == "yes" || word == "yeah" || word == "yep" {
            command = "yes"
          } else if word == "no" || word == "nope" {
            command = "no"
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
    audioEngine?.stop()
    audioEngine?.inputNode.removeTap(onBus: 0)
    recognitionRequest?.endAudio()
    recognitionRequest = nil
    recognitionTask = nil
    audioEngine = nil

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

  // MARK: - Step Validation (FastVLM)

  @objc
  func preloadVLM(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    if #available(iOS 18.2, *) {
      Task {
        do {
          print("[MetaWearables] FastVLM model loading...")
          try await FastVLMService.shared.loadModel()
          print("[MetaWearables] FastVLM model loaded")
          resolve(["success": true])
        } catch {
          print("[MetaWearables] FastVLM load failed: \(error.localizedDescription)")
          reject("VLM_LOAD_ERROR", error.localizedDescription, error)
        }
      }
    } else {
      resolve(["success": false, "reason": "iOS 18.2+ required"])
    }
  }

  @objc
  func startStepValidation(_ stepIndex: NSNumber, description: NSString, resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    if #available(iOS 18.2, *) {
      let stepIdx = stepIndex.intValue
      let desc = description as String

      // Load model on-demand if preload didn't finish
      Task {
        if !FastVLMService.shared.isModelLoaded {
          print("[MetaWearables] VLM not loaded yet — loading on-demand...")
          do {
            try await FastVLMService.shared.loadModel()
            print("[MetaWearables] VLM on-demand load complete")
          } catch {
            print("[MetaWearables] VLM on-demand load failed: \(error.localizedDescription)")
            reject("VLM_LOAD_ERROR", "Failed to load FastVLM: \(error.localizedDescription)", error)
            return
          }
        }

        await MainActor.run {
          let validator: StepValidator
          if let existing = self.stepValidator as? StepValidator {
            validator = existing
            print("[MetaWearables] Reusing existing StepValidator")
          } else {
            validator = StepValidator()
            validator.eventEmitter = self
            self.stepValidator = validator

            if let pipeline = self.mlPipeline {
              pipeline.registerConsumer(validator)
              print("[MetaWearables] StepValidator registered with ML pipeline")
            } else {
              print("[MetaWearables] WARNING: mlPipeline is nil — StepValidator will NOT receive frames!")
              // Try getting it from FrameDistributor as fallback
              let fallbackPipeline = MLProcessingPipeline()
              fallbackPipeline.eventEmitter = self
              fallbackPipeline.isHandPoseEnabled = self.isHandPoseEnabled
              self.mlPipeline = fallbackPipeline
              FrameDistributor.shared.setMLPipeline(fallbackPipeline)
              fallbackPipeline.registerConsumer(validator)
              print("[MetaWearables] Created fallback ML pipeline and registered StepValidator")
            }
          }

          validator.configure(stepIndex: stepIdx, description: desc)
          validator.isEnabled = true

          // Disable barcode to free resources for VLM
          self.mlPipeline?.isBarcodeEnabled = false

          // Strip down to bare-bones: stop stats emission, throttle JS metadata
          FrameDistributor.shared.stopStatsEmission()
          FrameDistributor.shared.setJSMetadataRate(everyNFrames: 150)  // ~1 event per 10s
          print("[MetaWearables] Stripped processes for VLM: barcode off, stats off, metadata throttled")

          print("[MetaWearables] Step validation started for step \(stepIdx): \(desc)")
          resolve(["success": true])
        }
      }
    } else {
      resolve(["success": false, "reason": "iOS 18.2+ required"])
    }
  }

  @objc
  func stopStepValidation(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    if #available(iOS 18.2, *) {
      if let validator = self.stepValidator as? StepValidator {
        validator.isEnabled = false
        validator.reset()
        self.mlPipeline?.removeConsumer(named: validator.modelName)
        self.stepValidator = nil
      }
      // Restore processes
      self.mlPipeline?.isBarcodeEnabled = true
      FrameDistributor.shared.startStatsEmission()
      FrameDistributor.shared.setJSMetadataRate(everyNFrames: 1)
      print("[MetaWearables] Restored barcode, stats, and metadata rate")

      FastVLMService.shared.unloadModel()
      print("[MetaWearables] Step validation stopped")
    }
    resolve(["success": true])
  }

  @objc
  func getAvailableVLMModels(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    if #available(iOS 18.2, *) {
      let models = FastVLMService.availableModelsList()
      let current = FastVLMService.shared.currentModelKey
      resolve(["models": models, "current": current])
    } else {
      resolve(["models": [], "current": ""])
    }
  }

  @objc
  func setVLMModel(_ modelKey: NSString, resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    if #available(iOS 18.2, *) {
      let key = modelKey as String
      FastVLMService.shared.setModel(key: key)
      print("[MetaWearables] VLM model set to: \(key)")

      // Reload the model with the new selection
      Task {
        do {
          try await FastVLMService.shared.loadModel()
          resolve(["success": true, "model": key])
        } catch {
          reject("VLM_LOAD_ERROR", "Failed to load model \(key): \(error.localizedDescription)", error)
        }
      }
    } else {
      resolve(["success": false, "reason": "iOS 18.2+ required"])
    }
  }

  @objc
  func checkStep(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    // In continuous mode, checkStep is a no-op — VLM runs automatically at ~1fps.
    // Kept for API compatibility.
    resolve(["success": true, "mode": "continuous"])
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
    }
  }

  // Clean up resources
  deinit {
    registrationTask?.cancel()
    deviceStreamTask?.cancel()

    // Stop voice recognition
    isVoiceRecognitionActive = false
    audioEngine?.stop()
    audioEngine?.inputNode.removeTap(onBus: 0)
    recognitionRequest?.endAudio()
    recognitionTask?.cancel()

    // Clean up frame pipeline
    FrameDistributor.shared.stopStatsEmission()
    FrameDistributor.shared.setMLPipeline(nil)
    FrameDistributor.shared.setRecorder(nil)

    stateListenerToken = nil
    videoFrameListenerToken = nil
    errorListenerToken = nil
    photoDataListenerToken = nil
    streamSession = nil
  }
}

