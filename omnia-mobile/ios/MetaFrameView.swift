import UIKit

/// Native UIView that renders video frames directly via CALayer.contents.
/// Frames never cross the JS bridge — they arrive from FrameDistributor on the main thread.
class MetaFrameView: UIView {

  /// When false, the view stops updating (but stays registered for quick resume)
  @objc var isActive: Bool = true

  /// "cover" or "contain" — maps to CALayer contentsGravity
  @objc var contentMode_: NSString = "cover" {
    didSet {
      updateGravity()
    }
  }

  override init(frame: CGRect) {
    super.init(frame: frame)
    setup()
  }

  required init?(coder: NSCoder) {
    super.init(coder: coder)
    setup()
  }

  private func setup() {
    backgroundColor = .black
    layer.contentsGravity = .resizeAspectFill
    layer.masksToBounds = true
    FrameDistributor.shared.registerView(self)
  }

  deinit {
    FrameDistributor.shared.unregisterView(self)
  }

  /// Called by FrameDistributor on the main thread. Extremely fast — just a pointer swap.
  func displayFrame(_ cgImage: CGImage) {
    guard isActive else { return }
    CATransaction.begin()
    CATransaction.setDisableActions(true)
    layer.contents = cgImage
    CATransaction.commit()
  }

  private func updateGravity() {
    let mode = contentMode_ as String
    switch mode {
    case "contain":
      layer.contentsGravity = .resizeAspect
    default:
      layer.contentsGravity = .resizeAspectFill
    }
  }
}
