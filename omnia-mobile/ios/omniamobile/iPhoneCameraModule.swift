import Foundation
import React
import AVFoundation
import Vision

/// Emits hand pose events from the iPhone camera. iPhoneCameraView posts notifications
/// when it detects hands; this module forwards them to JS.
@objc(iPhoneCameraModule)
class iPhoneCameraModule: RCTEventEmitter {

  static let handPoseNotification = Notification.Name("iPhoneCameraHandPoseDetected")

  override init() {
    super.init()
    NotificationCenter.default.addObserver(
      self,
      selector: #selector(handleHandPoseDetected(_:)),
      name: iPhoneCameraModule.handPoseNotification,
      object: nil
    )
  }

  deinit {
    NotificationCenter.default.removeObserver(self)
  }

  @objc private func handleHandPoseDetected(_ notification: Notification) {
    guard let body = notification.userInfo?["body"] as? [String: Any] else { return }
    sendEvent(withName: "onHandPoseDetected", body: body)
  }

  override static func requiresMainQueueSetup() -> Bool {
    return true
  }

  override func supportedEvents() -> [String]! {
    return ["onHandPoseDetected"]
  }

  @objc func startRecording(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    guard let view = iPhoneCameraView.currentInstance else {
      reject("NO_VIEW", "iPhone camera view not mounted", nil)
      return
    }
    view.startRecording(resolve, rejecter: reject)
  }

  @objc func stopRecording(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    guard let view = iPhoneCameraView.currentInstance else {
      reject("NO_VIEW", "iPhone camera view not mounted", nil)
      return
    }
    view.stopRecording(resolve, rejecter: reject)
  }
}
