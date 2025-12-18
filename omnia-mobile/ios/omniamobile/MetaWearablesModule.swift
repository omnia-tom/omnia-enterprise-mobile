import Foundation
import React
import MWDATCore
import MWDATCamera
import Vision

@objc(MetaWearablesModule)
class MetaWearablesModule: RCTEventEmitter {

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
      "onBarcodeDetected"
    ]
  }

  // MARK: - Initialization

  override init() {
    super.init()
    // SDK will be initialized when initializeSDK() is called from React Native
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
          print("[MetaWearables] ✅ Now in .registered state")
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
          print("[MetaWearables] State is .unavailable")
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

      for await devices in await wearables.devicesStream() {
        print("[MetaWearables] Received devices update: \(devices.count) devices")
        self.discoveredDevices = devices

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
      
      // Based on CameraAccess sample - devices are discovered via devicesStream()
      // The stream is already set up in setupDeviceStream()
      // We just need to ensure registration is complete
      
      guard let wearables = self.wearables else {
        reject("NOT_INITIALIZED", "Wearables interface not initialized. Please ensure SDK is properly set up.", nil)
        return
      }
      
      // Check if already registered
      if wearables.registrationState == .registered {
        // Devices will be discovered via the stream
        await self.setupDeviceStream()
        resolve(nil)
      } else {
        // Need to register first
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
      
      // Based on CameraAccess sample - devices are accessed via deviceForIdentifier
      // DeviceIdentifier is a String type alias
      guard let device = wearables.deviceForIdentifier(deviceId) else {
        reject("DEVICE_NOT_FOUND", "Device with ID \(deviceId) not found", nil)
        return
      }
      
      // Device is already connected if it's in the devices list
      // The connection is managed by the SDK's registration process
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
      
      // Based on CameraAccess sample - unregister to disconnect
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

  // Handle OAuth callback URL from Meta AI app
  // Based on CameraAccess sample: RegistrationView uses .onOpenURL to handle callbacks
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

      // Convert string to URL
      guard let url = URL(string: urlString) else {
        reject("INVALID_URL", "Invalid URL string", nil)
        return
      }

      // Check if URL contains metaWearablesAction query parameter
      // This is required for Meta Wearables callbacks
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
        print("[MetaWearables] ✅ Successfully handled Meta Wearables URL")
        print("[MetaWearables] Current registration state: \(await wearables.registrationState)")
        resolve(["success": true])
      } catch {
        print("[MetaWearables] ❌ Failed to handle Meta Wearables URL: \(error)")
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

      // Based on CameraAccess sample - pairing is done via startRegistration()
      // This redirects to Meta AI app for confirmation
      do {
        let currentState = await wearables.registrationState
        print("[MetaWearables] startPairing called, current state: \(currentState)")

        // If already registered, just setup device stream
        if currentState == .registered {
          print("[MetaWearables] Already registered, setting up device stream")
          await self.setupDeviceStream()
          resolve(["success": true, "message": "Already registered, discovering devices..."])
          return
        }

        print("[MetaWearables] Starting registration...")
        try wearables.startRegistration()

        // Monitor registration state - when it becomes .registered, emit pairing complete
        // The registration state is already being monitored in setupRegistrationMonitoring()
        // We'll emit the event when registration completes

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

  // Detect barcodes from a UIImage
  // Optimized for low quality 1280x720 video streams
  private func detectBarcodes(in image: UIImage) {
    guard let cgImage = image.cgImage else {
      return
    }

    // Create barcode detection request
    let request = VNDetectBarcodesRequest { [weak self] request, error in
      guard let self = self else { return }

      if let error = error {
        print("[MetaWearables] Barcode detection error: \(error.localizedDescription)")
        return
      }

      guard let observations = request.results as? [VNBarcodeObservation] else {
        return
      }

      // Process detected barcodes
      for observation in observations {
        guard let payload = observation.payloadStringValue else {
          continue
        }

        // Determine barcode type
        let barcodeType = self.getBarcodeTypeName(observation.symbology)

        print("[MetaWearables] 🏷️ Barcode detected: \(barcodeType) = \(payload)")

        // Emit barcode detection event
        self.sendEvent(withName: "onBarcodeDetected", body: [
          "type": barcodeType,
          "data": payload,
          "confidence": observation.confidence,
          "timestamp": Date().timeIntervalSince1970 * 1000
        ])
      }
    }

    // Optimize for low quality video
    // Use high accuracy mode to better handle 1280x720 low quality stream
    if #available(iOS 15.0, *) {
      request.revision = VNDetectBarcodesRequestRevision2
    }

    // Specify symbologies we want to detect
    request.symbologies = [
      .upce,          // UPC-E (8-digit)
      .ean8,          // EAN-8
      .ean13,         // EAN-13
      .qr,            // QR codes
      .code128,       // Code 128
      .code39,        // Code 39
      .code93,        // Code 93
      .itf14,         // ITF-14
      .i2of5,         // Interleaved 2 of 5
      .pdf417         // PDF417
    ]

    // Add UPC-A if available (iOS 15+)
    if #available(iOS 15.0, *) {
      request.symbologies.append(.codabar)
    }

    // Perform detection on background queue
    let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
    DispatchQueue.global(qos: .userInitiated).async {
      do {
        try handler.perform([request])
      } catch {
        print("[MetaWearables] Failed to perform barcode detection: \(error)")
      }
    }
  }

  // Convert VNBarcodeSymbology to readable string
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
        print("[MetaWearables] ❌ Cannot setup stream - wearables or deviceSelector is nil")
        return
      }

      print("[MetaWearables] 📹 Setting up stream session...")

      // Create StreamSession with configuration - must be on MainActor
      let config = StreamSessionConfig(
        videoCodec: VideoCodec.raw,
        resolution: StreamingResolution.low,
        frameRate: 24
      )

      print("[MetaWearables] Config: codec=raw, resolution=low, fps=24")

      streamSession = StreamSession(streamSessionConfig: config, deviceSelector: deviceSelector)
      print("[MetaWearables] ✅ StreamSession created")

      // Subscribe to video frames
      print("[MetaWearables] 📡 Subscribing to video frame publisher...")
      videoFrameListenerToken = streamSession?.videoFramePublisher.listen { [weak self] videoFrame in
        Task { @MainActor [weak self] in
          guard let self = self else { return }

          print("[MetaWearables] 🎥 Received video frame!")

          // Convert VideoFrame to UIImage then to base64
          if let image = videoFrame.makeUIImage() {
            print("[MetaWearables] ✅ Converted to UIImage: \(image.size.width)x\(image.size.height)")

            // Detect barcodes in the frame (runs async on background queue)
            self.detectBarcodes(in: image)

            if let imageData = self.convertImageToBase64(image) {
              print("[MetaWearables] ✅ Converted to base64: \(imageData.prefix(50))...")

              self.sendEvent(withName: "onVideoFrame", body: [
                "data": imageData,
                "timestamp": Date().timeIntervalSince1970 * 1000,
                "width": Int(image.size.width),
                "height": Int(image.size.height)
              ])
            } else {
              print("[MetaWearables] ❌ Failed to convert image to base64")
            }
          } else {
            print("[MetaWearables] ❌ Failed to convert VideoFrame to UIImage")
          }
        }
      }
      print("[MetaWearables] ✅ Video frame listener registered")

      // Subscribe to errors
      print("[MetaWearables] 📡 Subscribing to error publisher...")
      errorListenerToken = streamSession?.errorPublisher.listen { [weak self] error in
        Task { @MainActor [weak self] in
          guard let self = self else { return }

          print("[MetaWearables] ⚠️ Stream error received: \(error)")
          let errorMessage = self.formatStreamingError(error)
          print("[MetaWearables] Formatted error: \(errorMessage)")

          self.sendEvent(withName: "onError", body: [
            "code": "STREAMING_ERROR",
            "message": errorMessage
          ])
        }
      }
      print("[MetaWearables] ✅ Error listener registered")

      // Subscribe to photo capture results
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

      print("[MetaWearables] 🎬 startVideoStream called")

      // Check and request camera permission
      do {
        let permission = Permission.camera
        print("[MetaWearables] 🔐 Checking camera permission...")
        let status = try await wearables.checkPermissionStatus(permission)
        print("[MetaWearables] Permission status: \(status)")

        if status != .granted {
          print("[MetaWearables] 📱 Requesting camera permission from Meta AI...")
          let requestStatus = try await wearables.requestPermission(permission)
          print("[MetaWearables] Permission request result: \(requestStatus)")

          if requestStatus != .granted {
            print("[MetaWearables] ❌ Camera permission denied")
            reject("PERMISSION_DENIED", "Camera permission denied", nil)
            return
          }
        }

        print("[MetaWearables] ✅ Camera permission granted")

        // Set up stream session if not already done
        if self.streamSession == nil {
          print("[MetaWearables] 🔧 Setting up stream session...")
          await self.setupStreamSession()

          if self.streamSession == nil {
            print("[MetaWearables] ❌ Failed to create stream session")
            reject("SETUP_FAILED", "Failed to create stream session", nil)
            return
          }
        } else {
          print("[MetaWearables] ♻️ Using existing stream session")
        }

        // Start streaming
        print("[MetaWearables] ▶️ Starting stream session...")
        await self.streamSession?.start()
        print("[MetaWearables] ✅ Stream session start() called - waiting for frames...")

        // Log device selector state
        if let deviceSelector = self.deviceSelector {
          print("[MetaWearables] 📱 Device selector is configured")
        } else {
          print("[MetaWearables] ⚠️ WARNING: Device selector is nil!")
        }

        resolve(nil)

      } catch {
        print("[MetaWearables] ❌ Error starting video stream: \(error)")
        print("[MetaWearables] Error details: \(error.localizedDescription)")
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
    // StreamSessionError cases may vary by SDK version
    // Using string description for all errors
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

      // Capture photo - result will be delivered via photoDataPublisher listener
      streamSession.capturePhoto(format: .jpeg)

      // Resolve immediately - the actual photo will be sent via event
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

      // Get device information
      let deviceInfo: [String: Any] = [
        "id": device.identifier, // DeviceIdentifier is already a String
        "name": device.nameOrId(),
        "isConnected": true
        // Note: Additional properties like battery level, firmware, etc.
        // may be available depending on the SDK version and device capabilities
      ]
      resolve(deviceInfo)
    }
  }
  
  // MARK: - Helper Methods

  // Convert UIImage to base64 string
  private func convertImageToBase64(_ image: UIImage) -> String? {
    // Use JPEG with 0.8 quality for reasonable size/quality balance
    if let imageData = image.jpegData(compressionQuality: 0.8) {
      return imageData.base64EncodedString()
    }
    return nil
  }

  // Clean up resources
  deinit {
    // Cancel all tasks
    registrationTask?.cancel()
    deviceStreamTask?.cancel()

    // Clean up stream session
    stateListenerToken = nil
    videoFrameListenerToken = nil
    errorListenerToken = nil
    photoDataListenerToken = nil
    streamSession = nil
  }
}

