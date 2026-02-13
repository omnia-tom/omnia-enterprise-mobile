import React

@objc(MetaFrameViewManager)
class MetaFrameViewManager: RCTViewManager {

  override func view() -> UIView! {
    return MetaFrameView()
  }

  override static func requiresMainQueueSetup() -> Bool {
    return true
  }
}
