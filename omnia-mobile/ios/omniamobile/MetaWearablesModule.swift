import Foundation
import React
import MWDATCore
import MWDATCamera
import Vision
import AVFoundation

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

  // Barcode detection debouncing
  private var lastDetectedBarcode: String?
  private var lastDetectionTime: TimeInterval = 0

  // Frame skipping for better processing (process every 2nd frame)
  private var frameCounter: Int = 0

  // Debug: Save first N processed frames to photo library for inspection
  // DISABLED: User requested to stop saving photos
  // private var savedFrameCount: Int = 0
  // private let maxFramesToSave: Int = 3

  // Track announced UPC codes to prevent re-announcing the same code
  private var announcedUPCs: Set<String> = []
  
  // Text-to-speech for barcode announcements
  private let speechSynthesizer = AVSpeechSynthesizer()

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
  // Optimized for small barcodes at close range (6-12 inches)
  private func detectBarcodes(in image: UIImage) {
    guard let cgImage = image.cgImage else {
      return
    }

    let startTime = Date()

    // Debug: Save first N upscaled images to photo library for inspection
    // DISABLED: User requested to stop saving photos
    /*
    if self.savedFrameCount < self.maxFramesToSave {
      self.savedFrameCount += 1
      print("[MetaWearables] 📸 Saving debug frame #\(self.savedFrameCount)")

      // Save the upscaled image
      DispatchQueue.main.async {
        self.saveImageToPhotoLibrary(image, label: "upscaled_\(self.savedFrameCount)")
      }
    }
    */

    // Preprocess image for better small barcode detection
    guard let enhancedImage = self.preprocessImageForBarcode(cgImage) else {
      print("[MetaWearables] Failed to preprocess image")
      return
    }

    // Debug: Save preprocessed image too
    // DISABLED: User requested to stop saving photos
    /*
    if self.savedFrameCount <= self.maxFramesToSave {
      let preprocessedUIImage = UIImage(cgImage: enhancedImage)
      DispatchQueue.main.async {
        self.saveImageToPhotoLibrary(preprocessedUIImage, label: "preprocessed_\(self.savedFrameCount)")
      }
    }
    */

    // Create barcode detection request
    let request = VNDetectBarcodesRequest { [weak self] request, error in
      guard let self = self else { return }

      let processingTime = Date().timeIntervalSince(startTime) * 1000 // ms
      print("[MetaWearables] 🔍 Barcode detection completed in \(String(format: "%.1f", processingTime))ms")

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

        // Debounce: Only emit if different code OR >1 second has passed
        let currentTime = Date().timeIntervalSince1970
        // Determine barcode type and convert payload if needed
        var barcodeType = self.getBarcodeTypeName(observation.symbology)
        var finalPayload = payload

        // Handle EAN-13 to UPC-A conversion
        // NOTE: Many databases store the first 12 digits of EAN-13 (without check digit)
        // rather than converting to UPC-A format
        if barcodeType == "EAN-13" && payload.count == 13 {
          print("[MetaWearables] 📊 EAN-13 conversion details:")
          print("[MetaWearables]    Original: \"\(payload)\" (length: \(payload.count))")
          print("[MetaWearables]    First char: \"\(payload.prefix(1))\"")
          print("[MetaWearables]    Starts with 0: \(payload.hasPrefix("0"))")

          // Always use first 12 digits (removing check digit)
          // This works for databases that store EAN-13 without check digit
          barcodeType = "EAN-13"  // Keep type as EAN-13 since we're not converting to UPC-A
          finalPayload = String(payload.prefix(12)) // Remove last digit (check digit)
          print("[MetaWearables] 🔄 Converted EAN-13 to 12-digit format (removed check digit):")
          print("[MetaWearables]    From: \"\(payload)\" (13 digits with check digit)")
          print("[MetaWearables]    To:   \"\(finalPayload)\" (12 digits without check digit)")
        }

        // Debouncing: use finalPayload to prevent duplicates after conversion
        let shouldEmit = (finalPayload != self.lastDetectedBarcode) ||
                        (currentTime - self.lastDetectionTime > 1.0)

        if !shouldEmit {
          continue // Skip duplicate detection
        }

        // Update debounce tracking with final payload
        self.lastDetectedBarcode = finalPayload
        self.lastDetectionTime = currentTime

        print("[MetaWearables] 🏷️ Barcode detected: \(barcodeType) = \(finalPayload) (confidence: \(String(format: "%.1f%%", observation.confidence * 100)))")

        // Emit barcode detection event
        self.sendEvent(withName: "onBarcodeDetected", body: [
          "type": barcodeType,
          "data": finalPayload,
          "confidence": observation.confidence,
          "timestamp": currentTime * 1000
        ])
        
        // Announce UPC codes via text-to-speech through Meta glasses
        // Only announce if this is a new UPC code that hasn't been announced before
        if barcodeType.contains("UPC") && !self.announcedUPCs.contains(finalPayload) {
          self.announcedUPCs.insert(finalPayload)
          self.announceBarcode(barcodeType: barcodeType)
        }
      }
    }

    // Use highest accuracy mode for small barcode detection
    if #available(iOS 15.0, *) {
      request.revision = VNDetectBarcodesRequestRevision2
    }

    // Region of Interest: Expanded to center 80% of frame for more tolerance
    // Allows off-center barcodes while still excluding edge distortion
    // x: 0.1 (10% margin), y: 0.1 (10% margin), width: 0.8 (80%), height: 0.8 (80%)
    request.regionOfInterest = CGRect(x: 0.1, y: 0.1, width: 0.8, height: 0.8)

    // Focus only on UPC/EAN symbologies for faster warehouse barcode detection
    // Removed: QR, Code128, Code39, Code93, ITF14, I2of5, PDF417, Codabar
    // This makes detection ~70% faster by checking only 3 barcode types
    request.symbologies = [
      .upce,          // UPC-E (8-digit)
      .ean8,          // EAN-8
      .ean13          // EAN-13 (most common for products)
    ]

    // Perform detection on background queue
    let handler = VNImageRequestHandler(cgImage: enhancedImage, options: [:])
    DispatchQueue.global(qos: .userInitiated).async {
      do {
        try handler.perform([request])
      } catch {
        print("[MetaWearables] Failed to perform barcode detection: \(error)")
      }
    }
  }

  // Minimal preprocessing - just use the image as-is from the glasses
  // Vision framework works best with unmodified images
  private func preprocessImageForBarcode(_ cgImage: CGImage) -> CGImage? {
    // No preprocessing - return original image
    // Vision framework's barcode detector is already optimized
    return cgImage
  }

  // Upscale image for better small barcode detection
  // Uses high-quality Lanczos interpolation
  private func upscaleImage(_ image: UIImage, targetScale: CGFloat) -> UIImage {
    let originalSize = image.size
    let newSize = CGSize(width: originalSize.width * targetScale, height: originalSize.height * targetScale)

    UIGraphicsBeginImageContextWithOptions(newSize, false, 1.0)
    image.draw(in: CGRect(origin: .zero, size: newSize))
    let upscaledImage = UIGraphicsGetImageFromCurrentImageContext()
    UIGraphicsEndImageContext()

    return upscaledImage ?? image
  }

  // Save image to photo library for debugging
  // DISABLED: User requested to stop saving photos
  /*
  private func saveImageToPhotoLibrary(_ image: UIImage, label: String) {
    UIImageWriteToSavedPhotosAlbum(image, self, #selector(imageSaved(_:didFinishSavingWithError:contextInfo:)), UnsafeMutableRawPointer(mutating: (label as NSString).utf8String))
  }

  @objc private func imageSaved(_ image: UIImage, didFinishSavingWithError error: Error?, contextInfo: UnsafeRawPointer?) {
    if let error = error {
      print("[MetaWearables] ❌ Failed to save debug image: \(error.localizedDescription)")
    } else {
      if let labelPtr = contextInfo {
        let label = String(cString: labelPtr.assumingMemoryBound(to: CChar.self))
        print("[MetaWearables] ✅ Saved debug image: \(label)")
      }
    }
  }
  */

  // Detect motion blur using Laplacian variance
  // Returns true if image is sharp enough for barcode detection
  // Threshold: 100.0 (lower = more blurry, higher = sharper)
  private func isImageSharp(_ image: UIImage) -> Bool {
    guard let cgImage = image.cgImage else { return false }

    let ciImage = CIImage(cgImage: cgImage)

    // Convert to grayscale for better edge detection
    guard let grayFilter = CIFilter(name: "CIColorControls") else { return true }
    grayFilter.setValue(ciImage, forKey: kCIInputImageKey)
    grayFilter.setValue(0.0, forKey: kCIInputSaturationKey) // Remove color

    guard let grayOutput = grayFilter.outputImage else { return true }

    // Apply edge detection (approximates Laplacian)
    guard let edgeFilter = CIFilter(name: "CIEdges") else { return true }
    edgeFilter.setValue(grayOutput, forKey: kCIInputImageKey)
    edgeFilter.setValue(1.0, forKey: kCIInputIntensityKey)

    guard let edgeOutput = edgeFilter.outputImage else { return true }

    // Sample the center region to check edge strength
    let context = CIContext(options: nil)
    let centerRect = CGRect(
      x: ciImage.extent.width * 0.4,
      y: ciImage.extent.height * 0.4,
      width: ciImage.extent.width * 0.2,
      height: ciImage.extent.height * 0.2
    )

    guard let edgeCGImage = context.createCGImage(edgeOutput, from: centerRect) else { return true }

    // Calculate average edge intensity (simple blur metric)
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

    // Calculate variance of pixel intensities
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

    // Threshold: Lowered from 100.0 to 50.0 - we were being too strict
    // This allows more frames through for processing
    let isSharp = variance > 50.0

    if !isSharp {
      print("[MetaWearables] ⚠️ Frame too blurry (variance: \(String(format: "%.1f", variance))) - skipping")
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
        print("[MetaWearables] ❌ Cannot setup stream - wearables or deviceSelector is nil")
        return
      }

      print("[MetaWearables] 📹 Setting up stream session...")

      // Create StreamSession with configuration - must be on MainActor
      // Using high resolution and moderate frame rate for better detection chances
      // 15fps gives more opportunities to catch barcodes
      let config = StreamSessionConfig(
        videoCodec: VideoCodec.raw,
        resolution: StreamingResolution.high,
        frameRate: 15
      )

      print("[MetaWearables] Config: codec=raw, resolution=high, fps=15 (optimized for small barcode detection)")

      streamSession = StreamSession(streamSessionConfig: config, deviceSelector: deviceSelector)
      print("[MetaWearables] ✅ StreamSession created")

      // Subscribe to video frames
      print("[MetaWearables] 📡 Subscribing to video frame publisher...")
      videoFrameListenerToken = streamSession?.videoFramePublisher.listen { [weak self] videoFrame in
        Task { @MainActor [weak self] in
          guard let self = self else { return }

          // Process every frame - we need all opportunities to detect small barcodes
          self.frameCounter += 1
          print("[MetaWearables] 🎥 Processing frame #\(self.frameCounter)")

          // Convert VideoFrame to UIImage then to base64
          if let image = videoFrame.makeUIImage() {
            print("[MetaWearables] ✅ Converted to UIImage: \(image.size.width)x\(image.size.height)")

            // Check if frame is sharp enough for barcode detection (skip blurry frames)
            if !self.isImageSharp(image) {
              // Frame is too blurry - skip processing
              return
            }

            // Use moderate upscaling - 4x made images too noisy and dark
            // 2x upscaling: 720x1280 → 1440x2560 (better quality with less noise)
            let upscaledImage = self.upscaleImage(image, targetScale: 2.0)
            print("[MetaWearables] 🔍 Upscaled to: \(upscaledImage.size.width)x\(upscaledImage.size.height)")

            // Detect barcodes in the upscaled frame (runs async on background queue)
            self.detectBarcodes(in: upscaledImage)

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
  
  // Announce barcode detection via text-to-speech through Meta glasses
  private func announceBarcode(barcodeType: String) {
    DispatchQueue.main.async { [weak self] in
      guard let self = self else { return }
      
      // Configure audio session to route through Meta glasses
      let audioSession = AVAudioSession.sharedInstance()
      do {
        // Use playback category to route audio through connected audio devices (Meta glasses)
        try audioSession.setCategory(.playback, mode: .spokenAudio, options: [.duckOthers])
        try audioSession.setActive(true)
      } catch {
        print("[MetaWearables] Failed to configure audio session: \(error.localizedDescription)")
        // Continue anyway - audio might still work
      }
      
      // Create speech utterance
      let utterance = AVSpeechUtterance(string: "UPC found")
      utterance.voice = AVSpeechSynthesisVoice(language: "en-US")
      utterance.rate = 0.5 // Slightly slower for clarity
      utterance.volume = 1.0
      utterance.pitchMultiplier = 1.0
      
      // Speak the announcement
      self.speechSynthesizer.speak(utterance)
      print("[MetaWearables] 🔊 Announced: 'UPC found'")
    }
  }

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

