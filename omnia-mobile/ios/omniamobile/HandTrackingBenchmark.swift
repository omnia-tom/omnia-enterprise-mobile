import Vision
import CoreVideo
import CoreGraphics
import CoreML
import UIKit

// MARK: - Enums

enum BenchmarkComputeUnit: String {
  case cpuOnly = "CPU"
  case auto = "Auto"
  case aneExplicit = "ANE"
  case gpuExplicit = "GPU"
}

enum BenchmarkInputFormat: String {
  case cvPixelBuffer = "CVPixelBuffer"
  case cgImage = "CGImage"
}

// MARK: - Data Structures

struct BenchmarkScenario {
  let id: Int
  let label: String
  let computeUnit: BenchmarkComputeUnit
  let inputFormat: BenchmarkInputFormat
  let maxHands: Int
}

struct RichFrameResult {
  let frameIndex: Int
  let wallTimestamp: TimeInterval     // seconds since test start
  // Timing
  let tHandlerMs: Double
  let tInferenceMs: Double
  let tExtractMs: Double
  let tE2eMs: Double
  // Detection
  let handsDetected: Int
  let jointsDetected: Int
  let avgConfidence: Double
  // Per-joint min/max/mean confidence
  let minJointConf: Double
  let maxJointConf: Double
  // Jitter: avg Euclidean distance of joint positions from previous frame
  let avgJointDeltaPx: Double
  // System
  let thermalState: String
  let batteryLevel: Float
  let memoryMB: Double
  // Frame delivery
  let frameIntervalMs: Double
}

// MARK: - Benchmark Engine

final class HandTrackingBenchmark: MLModelConsumer {

  // MLModelConsumer conformance
  let modelName = "handTrackingBenchmark"
  let processEveryNFrames = 1
  var isEnabled = false

  // Event emission
  weak var eventEmitter: MetaWearablesModule?

  // 7 scenarios (all inline — removed serial/concurrent queue and BEST/WORST duplicates)
  let scenarios: [BenchmarkScenario] = [
    BenchmarkScenario(id: 1, label: "CPU | PB | 2H",   computeUnit: .cpuOnly,     inputFormat: .cvPixelBuffer, maxHands: 2),
    BenchmarkScenario(id: 2, label: "Auto | PB | 2H",  computeUnit: .auto,        inputFormat: .cvPixelBuffer, maxHands: 2),
    BenchmarkScenario(id: 3, label: "ANE | PB | 2H",   computeUnit: .aneExplicit, inputFormat: .cvPixelBuffer, maxHands: 2),
    BenchmarkScenario(id: 4, label: "GPU | PB | 2H",   computeUnit: .gpuExplicit, inputFormat: .cvPixelBuffer, maxHands: 2),
    BenchmarkScenario(id: 5, label: "Auto | CGI | 2H",  computeUnit: .auto,        inputFormat: .cgImage,       maxHands: 2),
    BenchmarkScenario(id: 6, label: "Auto | PB | 1H",  computeUnit: .auto,        inputFormat: .cvPixelBuffer, maxHands: 1),
    BenchmarkScenario(id: 7, label: "CPU | CGI | 1H",   computeUnit: .cpuOnly,     inputFormat: .cgImage,       maxHands: 1),
  ]

  // Individual test state
  private var isTestRunning = false
  private var currentScenario: BenchmarkScenario?
  private var testDuration: TimeInterval = 60
  private var testStartTime: CFAbsoluteTime = 0
  private var frameResults: [RichFrameResult] = []
  private var frameIndex = 0
  private var lastFrameArrival: CFAbsoluteTime = 0

  // Jitter tracking — previous joint positions per hand (keyed by chirality index)
  private var previousJointPositions: [[VNHumanHandPoseObservation.JointName: CGPoint]] = []

  // System state at start (for summary delta)
  private var thermalAtStart: String = "unknown"
  private var batteryAtStart: Float = 0

  // Tick timer (1/sec)
  private var tickTimer: DispatchSourceTimer?

  // MARK: - MLModelConsumer

  func process(cgImage: CGImage, timestamp: TimeInterval, width: Int, height: Int) {
    // Fallback: no pixelBuffer available
    process(cgImage: cgImage, pixelBuffer: nil, timestamp: timestamp, width: width, height: height)
  }

  func process(cgImage: CGImage, pixelBuffer: CVPixelBuffer?, timestamp: TimeInterval, width: Int, height: Int) {
    guard isTestRunning, let scenario = currentScenario else { return }

    let elapsed = CFAbsoluteTimeGetCurrent() - testStartTime
    if elapsed >= testDuration {
      finishTest()
      return
    }

    let result = processIndividualFrame(cgImage: cgImage, pixelBuffer: pixelBuffer, width: width, height: height, scenario: scenario)
    frameResults.append(result)
    frameIndex += 1
  }

  // MARK: - Public API

  func startIndividualTest(scenarioId: Int, durationSeconds: Int) {
    guard !isTestRunning else {
      print("[Benchmark] Test already running")
      return
    }

    guard let scenario = scenarios.first(where: { $0.id == scenarioId }) else {
      print("[Benchmark] Invalid scenarioId: \(scenarioId)")
      return
    }

    // Enable battery monitoring
    UIDevice.current.isBatteryMonitoringEnabled = true

    currentScenario = scenario
    testDuration = TimeInterval(durationSeconds)
    testStartTime = CFAbsoluteTimeGetCurrent()
    frameResults = []
    frameIndex = 0
    lastFrameArrival = 0
    previousJointPositions = []
    thermalAtStart = currentThermalStateString()
    batteryAtStart = UIDevice.current.batteryLevel
    isTestRunning = true
    isEnabled = true

    startTickTimer()

    print("[Benchmark] Individual test started: \(scenario.label) for \(durationSeconds)s")
  }

  func stop() {
    if isTestRunning && !frameResults.isEmpty {
      finishTest()
    } else {
      isTestRunning = false
      isEnabled = false
      stopTickTimer()
      UIDevice.current.isBatteryMonitoringEnabled = false
      print("[Benchmark] Stopped (no results)")
    }
  }

  // MARK: - Frame Processing

  private func processIndividualFrame(cgImage: CGImage, pixelBuffer: CVPixelBuffer?, width: Int, height: Int, scenario: BenchmarkScenario) -> RichFrameResult {
    let now = CFAbsoluteTimeGetCurrent()
    let wallTimestamp = now - testStartTime
    let frameIntervalMs: Double
    if lastFrameArrival > 0 {
      frameIntervalMs = (now - lastFrameArrival) * 1000.0
    } else {
      frameIntervalMs = 0
    }
    lastFrameArrival = now

    let e2eStart = now

    // 1. Create handler — use original pixelBuffer for true zero-copy path
    let handlerStart = CFAbsoluteTimeGetCurrent()
    let handler: VNImageRequestHandler
    if scenario.inputFormat == .cvPixelBuffer {
      if let pb = pixelBuffer {
        // Zero-copy: use the original CMSampleBuffer-backed pixelBuffer directly
        handler = VNImageRequestHandler(cvPixelBuffer: pb, options: [:])
      } else if let pb = createPixelBuffer(from: cgImage, width: width, height: height) {
        // Fallback: re-create IOSurface-backed pixelBuffer from CGImage
        handler = VNImageRequestHandler(cvPixelBuffer: pb, options: [:])
      } else {
        handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
      }
    } else {
      handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
    }
    let tHandlerMs = (CFAbsoluteTimeGetCurrent() - handlerStart) * 1000.0

    // 2. Configure and perform
    let request = VNDetectHumanHandPoseRequest()
    request.maximumHandCount = scenario.maxHands
    configureRequest(request, computeUnit: scenario.computeUnit)

    let inferenceStart = CFAbsoluteTimeGetCurrent()
    do {
      try handler.perform([request])
    } catch {
      let tE2eMs = (CFAbsoluteTimeGetCurrent() - e2eStart) * 1000.0
      return RichFrameResult(
        frameIndex: frameIndex, wallTimestamp: wallTimestamp,
        tHandlerMs: tHandlerMs,
        tInferenceMs: (CFAbsoluteTimeGetCurrent() - inferenceStart) * 1000.0,
        tExtractMs: 0, tE2eMs: tE2eMs,
        handsDetected: 0, jointsDetected: 0, avgConfidence: 0,
        minJointConf: 0, maxJointConf: 0,
        avgJointDeltaPx: 0,
        thermalState: currentThermalStateString(),
        batteryLevel: UIDevice.current.batteryLevel,
        memoryMB: getResidentMemoryMB(),
        frameIntervalMs: frameIntervalMs
      )
    }
    let tInferenceMs = (CFAbsoluteTimeGetCurrent() - inferenceStart) * 1000.0

    // 3. Extract observations
    let extractStart = CFAbsoluteTimeGetCurrent()
    let observations = request.results ?? []
    var totalJoints = 0
    var totalConfidence: Double = 0
    var minConf: Double = 1.0
    var maxConf: Double = 0.0
    var jointCount = 0

    // Build current joint positions for jitter calculation
    var currentJointPositions: [[VNHumanHandPoseObservation.JointName: CGPoint]] = []
    var totalJitterPx: Double = 0
    var jitterJointCount = 0

    for (handIdx, observation) in observations.enumerated() {
      guard let allPoints = try? observation.recognizedPoints(.all) else { continue }

      var handPositions: [VNHumanHandPoseObservation.JointName: CGPoint] = [:]

      for (jointName, point) in allPoints {
        guard point.confidence > 0.1 else { continue }
        totalJoints += 1
        let conf = Double(point.confidence)
        totalConfidence += conf
        jointCount += 1
        if conf < minConf { minConf = conf }
        if conf > maxConf { maxConf = conf }

        // Convert normalized coords to pixel coords for jitter
        let px = CGPoint(x: CGFloat(point.location.x) * CGFloat(width),
                         y: CGFloat(point.location.y) * CGFloat(height))
        handPositions[jointName] = px

        // Calculate jitter against previous frame
        if handIdx < previousJointPositions.count,
           let prevPx = previousJointPositions[handIdx][jointName] {
          let dx = Double(px.x - prevPx.x)
          let dy = Double(px.y - prevPx.y)
          totalJitterPx += sqrt(dx * dx + dy * dy)
          jitterJointCount += 1
        }
      }

      currentJointPositions.append(handPositions)
    }

    previousJointPositions = currentJointPositions

    let tExtractMs = (CFAbsoluteTimeGetCurrent() - extractStart) * 1000.0
    let tE2eMs = (CFAbsoluteTimeGetCurrent() - e2eStart) * 1000.0
    let avgConf = jointCount > 0 ? totalConfidence / Double(jointCount) : 0
    let avgJitter = jitterJointCount > 0 ? totalJitterPx / Double(jitterJointCount) : 0
    if jointCount == 0 { minConf = 0 }

    return RichFrameResult(
      frameIndex: frameIndex, wallTimestamp: wallTimestamp,
      tHandlerMs: tHandlerMs, tInferenceMs: tInferenceMs,
      tExtractMs: tExtractMs, tE2eMs: tE2eMs,
      handsDetected: observations.count, jointsDetected: totalJoints,
      avgConfidence: avgConf, minJointConf: minConf, maxJointConf: maxConf,
      avgJointDeltaPx: avgJitter,
      thermalState: currentThermalStateString(),
      batteryLevel: UIDevice.current.batteryLevel,
      memoryMB: getResidentMemoryMB(),
      frameIntervalMs: frameIntervalMs
    )
  }

  // MARK: - Test Completion

  private func finishTest() {
    guard isTestRunning, let scenario = currentScenario else { return }

    isTestRunning = false
    isEnabled = false
    stopTickTimer()

    let thermalEnd = currentThermalStateString()
    let batteryEnd = UIDevice.current.batteryLevel
    UIDevice.current.isBatteryMonitoringEnabled = false

    // Save CSV
    let filePath = saveCSV(results: frameResults, scenario: scenario, duration: testDuration)

    // Calculate summary stats
    let count = frameResults.count
    guard count > 0 else {
      print("[Benchmark] Test finished with 0 frames")
      return
    }

    let inferenceTimes = frameResults.map(\.tInferenceMs).sorted()
    let e2eTimes = frameResults.map(\.tE2eMs).sorted()
    let avgInference = inferenceTimes.reduce(0, +) / Double(count)
    let p50Inference = inferenceTimes[min(Int(Double(count) * 0.50), count - 1)]
    let p95Inference = inferenceTimes[min(Int(Double(count) * 0.95), count - 1)]
    let avgE2e = e2eTimes.reduce(0, +) / Double(count)
    let fps = avgE2e > 0 ? 1000.0 / avgE2e : 0

    let confValues = frameResults.filter { $0.avgConfidence > 0 }.map(\.avgConfidence)
    let avgConf = confValues.isEmpty ? 0 : confValues.reduce(0, +) / Double(confValues.count)

    let jitterValues = frameResults.filter { $0.avgJointDeltaPx > 0 }.map(\.avgJointDeltaPx)
    let avgJitter = jitterValues.isEmpty ? 0 : jitterValues.reduce(0, +) / Double(jitterValues.count)

    let actualDuration = frameResults.last?.wallTimestamp ?? testDuration

    let summary: [String: Any] = [
      "scenarioId": scenario.id,
      "label": scenario.label,
      "framesProcessed": count,
      "durationSeconds": round(actualDuration * 100) / 100,
      "avgInferenceMs": round(avgInference * 100) / 100,
      "p50InferenceMs": round(p50Inference * 100) / 100,
      "p95InferenceMs": round(p95Inference * 100) / 100,
      "avgE2eMs": round(avgE2e * 100) / 100,
      "throughputFps": round(fps * 100) / 100,
      "avgConfidence": round(avgConf * 1000) / 1000,
      "avgJitterPx": round(avgJitter * 100) / 100,
      "thermalStart": thermalAtStart,
      "thermalEnd": thermalEnd,
      "batteryStart": round(Double(batteryAtStart) * 1000) / 1000,
      "batteryEnd": round(Double(batteryEnd) * 1000) / 1000,
      "filePath": filePath,
    ]

    DispatchQueue.main.async { [weak self] in
      self?.eventEmitter?.sendEvent(withName: "onBenchmarkTestComplete", body: summary)
    }

    print("[Benchmark] Test complete: \(scenario.label) — \(count) frames, avg \(String(format: "%.1f", avgInference))ms, saved to \(filePath)")
  }

  // MARK: - Tick Timer

  private func startTickTimer() {
    let timer = DispatchSource.makeTimerSource(queue: .main)
    timer.schedule(deadline: .now() + 1.0, repeating: 1.0)
    timer.setEventHandler { [weak self] in
      guard let self = self, self.isTestRunning else { return }

      let elapsed = CFAbsoluteTimeGetCurrent() - self.testStartTime
      let count = self.frameResults.count

      let avgInference: Double
      let avgE2e: Double
      if count > 0 {
        avgInference = self.frameResults.map(\.tInferenceMs).reduce(0, +) / Double(count)
        avgE2e = self.frameResults.map(\.tE2eMs).reduce(0, +) / Double(count)
      } else {
        avgInference = 0
        avgE2e = 0
      }

      let tick: [String: Any] = [
        "elapsed": Int(elapsed),
        "total": Int(self.testDuration),
        "frameCount": count,
        "avgInferenceMs": round(avgInference * 100) / 100,
        "avgE2eMs": round(avgE2e * 100) / 100,
        "thermalState": self.currentThermalStateString(),
        "batteryLevel": round(Double(UIDevice.current.batteryLevel) * 1000) / 1000,
      ]

      self.eventEmitter?.sendEvent(withName: "onBenchmarkTestTick", body: tick)
    }
    timer.resume()
    tickTimer = timer
  }

  private func stopTickTimer() {
    tickTimer?.cancel()
    tickTimer = nil
  }

  // MARK: - CSV Save

  private func saveCSV(results: [RichFrameResult], scenario: BenchmarkScenario, duration: TimeInterval) -> String {
    // Create benchmarks directory
    let documentsDir = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first!
    let benchmarkDir = documentsDir.appendingPathComponent("benchmarks")

    do {
      try FileManager.default.createDirectory(at: benchmarkDir, withIntermediateDirectories: true)
    } catch {
      print("[Benchmark] Failed to create benchmarks directory: \(error)")
    }

    let timestamp = Int(Date().timeIntervalSince1970)
    let filename = "benchmark_\(scenario.id)_\(scenario.computeUnit.rawValue)_\(scenario.inputFormat.rawValue)_\(scenario.maxHands)H_\(timestamp).csv"
    let filePath = benchmarkDir.appendingPathComponent(filename)

    var csv = "frame,wall_time_s,handler_ms,inference_ms,extract_ms,e2e_ms,hands,joints,avg_conf,min_joint_conf,max_joint_conf,avg_jitter_px,thermal,battery,memory_mb,frame_interval_ms\n"

    for r in results {
      csv += "\(r.frameIndex),"
      csv += String(format: "%.3f,", r.wallTimestamp)
      csv += String(format: "%.2f,", r.tHandlerMs)
      csv += String(format: "%.2f,", r.tInferenceMs)
      csv += String(format: "%.2f,", r.tExtractMs)
      csv += String(format: "%.2f,", r.tE2eMs)
      csv += "\(r.handsDetected),"
      csv += "\(r.jointsDetected),"
      csv += String(format: "%.4f,", r.avgConfidence)
      csv += String(format: "%.4f,", r.minJointConf)
      csv += String(format: "%.4f,", r.maxJointConf)
      csv += String(format: "%.2f,", r.avgJointDeltaPx)
      csv += "\(r.thermalState),"
      csv += String(format: "%.3f,", r.batteryLevel)
      csv += String(format: "%.1f,", r.memoryMB)
      csv += String(format: "%.2f\n", r.frameIntervalMs)
    }

    do {
      try csv.write(to: filePath, atomically: true, encoding: .utf8)
      print("[Benchmark] CSV saved: \(filePath.path)")
    } catch {
      print("[Benchmark] Failed to save CSV: \(error)")
    }

    return filePath.path
  }

  // MARK: - File Management

  func listBenchmarkFiles() -> [[String: Any]] {
    let documentsDir = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first!
    let benchmarkDir = documentsDir.appendingPathComponent("benchmarks")

    guard let files = try? FileManager.default.contentsOfDirectory(
      at: benchmarkDir, includingPropertiesForKeys: [.fileSizeKey, .creationDateKey],
      options: [.skipsHiddenFiles]
    ) else {
      return []
    }

    return files
      .filter { $0.pathExtension == "csv" }
      .compactMap { url -> [String: Any]? in
        guard let attrs = try? FileManager.default.attributesOfItem(atPath: url.path) else { return nil }
        let size = (attrs[.size] as? Int) ?? 0
        let date = (attrs[.creationDate] as? Date) ?? Date()

        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd HH:mm:ss"

        return [
          "name": url.lastPathComponent,
          "path": url.path,
          "sizeKB": round(Double(size) / 1024.0 * 10) / 10,
          "date": formatter.string(from: date),
        ]
      }
      .sorted { ($0["date"] as? String ?? "") > ($1["date"] as? String ?? "") }
  }

  func deleteBenchmarkFile(path: String) -> Bool {
    do {
      try FileManager.default.removeItem(atPath: path)
      print("[Benchmark] Deleted: \(path)")
      return true
    } catch {
      print("[Benchmark] Delete failed: \(error)")
      return false
    }
  }

  // MARK: - System State

  static func getSystemState() -> [String: Any] {
    let thermalState: String
    switch ProcessInfo.processInfo.thermalState {
    case .nominal: thermalState = "nominal"
    case .fair: thermalState = "fair"
    case .serious: thermalState = "serious"
    case .critical: thermalState = "critical"
    @unknown default: thermalState = "unknown"
    }

    // Enable briefly for reading if needed
    let wasEnabled = UIDevice.current.isBatteryMonitoringEnabled
    if !wasEnabled { UIDevice.current.isBatteryMonitoringEnabled = true }
    let battery = UIDevice.current.batteryLevel
    if !wasEnabled { UIDevice.current.isBatteryMonitoringEnabled = false }

    return [
      "thermalState": thermalState,
      "batteryLevel": round(Double(battery) * 1000) / 1000,
      "memoryMB": round(getResidentMemoryMBStatic() * 10) / 10,
    ]
  }

  // MARK: - Compute Unit Configuration

  private func configureRequest(_ request: VNDetectHumanHandPoseRequest, computeUnit: BenchmarkComputeUnit) {
    switch computeUnit {
    case .cpuOnly:
      if #available(iOS 17.0, *) {
        if let stageDevices = try? request.supportedComputeStageDevices,
           let mainDevices = stageDevices[.main] {
          for device in mainDevices {
            if device is MLCPUComputeDevice {
              request.setComputeDevice(device, for: .main)
              return
            }
          }
        }
        request.usesCPUOnly = true
      } else {
        request.usesCPUOnly = true
      }

    case .auto:
      if #available(iOS 17.0, *) {
        request.setComputeDevice(nil, for: .main)
      } else {
        request.usesCPUOnly = false
      }

    case .aneExplicit:
      if #available(iOS 17.0, *) {
        if let stageDevices = try? request.supportedComputeStageDevices,
           let mainDevices = stageDevices[.main] {
          for device in mainDevices {
            if device is MLNeuralEngineComputeDevice {
              request.setComputeDevice(device, for: .main)
              return
            }
          }
        }
      }

    case .gpuExplicit:
      if #available(iOS 17.0, *) {
        if let stageDevices = try? request.supportedComputeStageDevices,
           let mainDevices = stageDevices[.main] {
          for device in mainDevices {
            if device is MLGPUComputeDevice {
              request.setComputeDevice(device, for: .main)
              return
            }
          }
        }
      }
    }
  }

  // MARK: - Helpers

  private func createPixelBuffer(from cgImage: CGImage, width: Int, height: Int) -> CVPixelBuffer? {
    let attrs: [String: Any] = [
      kCVPixelBufferIOSurfacePropertiesKey as String: [:] as [String: Any],
    ]
    var pb: CVPixelBuffer?
    let status = CVPixelBufferCreate(kCFAllocatorDefault, width, height, kCVPixelFormatType_32BGRA, attrs as CFDictionary, &pb)
    guard status == kCVReturnSuccess, let pixelBuffer = pb else { return nil }

    CVPixelBufferLockBaseAddress(pixelBuffer, [])
    if let baseAddress = CVPixelBufferGetBaseAddress(pixelBuffer) {
      let bytesPerRow = CVPixelBufferGetBytesPerRow(pixelBuffer)
      let colorSpace = CGColorSpaceCreateDeviceRGB()
      if let context = CGContext(
        data: baseAddress, width: width, height: height, bitsPerComponent: 8,
        bytesPerRow: bytesPerRow, space: colorSpace,
        bitmapInfo: CGImageAlphaInfo.premultipliedFirst.rawValue | CGBitmapInfo.byteOrder32Little.rawValue
      ) {
        context.draw(cgImage, in: CGRect(x: 0, y: 0, width: width, height: height))
      }
    }
    CVPixelBufferUnlockBaseAddress(pixelBuffer, [])
    return pixelBuffer
  }

  func currentThermalStateString() -> String {
    switch ProcessInfo.processInfo.thermalState {
    case .nominal: return "nominal"
    case .fair: return "fair"
    case .serious: return "serious"
    case .critical: return "critical"
    @unknown default: return "unknown"
    }
  }

  private func getResidentMemoryMB() -> Double {
    return HandTrackingBenchmark.getResidentMemoryMBStatic()
  }

  private static func getResidentMemoryMBStatic() -> Double {
    var info = mach_task_basic_info()
    var count = mach_msg_type_number_t(MemoryLayout<mach_task_basic_info>.size) / 4
    let result = withUnsafeMutablePointer(to: &info) {
      $0.withMemoryRebound(to: integer_t.self, capacity: Int(count)) {
        task_info(mach_task_self_, task_flavor_t(MACH_TASK_BASIC_INFO), $0, &count)
      }
    }
    guard result == KERN_SUCCESS else { return 0 }
    return Double(info.resident_size) / (1024.0 * 1024.0)
  }
}
