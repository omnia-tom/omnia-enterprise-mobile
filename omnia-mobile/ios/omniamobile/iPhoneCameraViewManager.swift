import React

@objc(iPhoneCameraViewManager)
class iPhoneCameraViewManager: RCTViewManager {

  override func view() -> UIView! {
    return iPhoneCameraView()
  }

  override static func requiresMainQueueSetup() -> Bool {
    return true
  }
}
