import Expo
import React
import ReactAppDependencyProvider
import MWDATCore

@UIApplicationMain
public class AppDelegate: ExpoAppDelegate {
  var window: UIWindow?

  var reactNativeDelegate: ExpoReactNativeFactoryDelegate?
  var reactNativeFactory: RCTReactNativeFactory?

  public override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    print("[AppDelegate] didFinishLaunchingWithOptions called")

    let delegate = ReactNativeDelegate()
    let factory = ExpoReactNativeFactory(delegate: delegate)
    delegate.dependencyProvider = RCTAppDependencyProvider()

    reactNativeDelegate = delegate
    reactNativeFactory = factory
    bindReactNativeFactory(factory)

#if os(iOS) || os(tvOS)
    window = UIWindow(frame: UIScreen.main.bounds)
    factory.startReactNative(
      withModuleName: "main",
      in: window,
      launchOptions: launchOptions)
#endif

    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }

  // Linking API
  public override func application(
    _ app: UIApplication,
    open url: URL,
    options: [UIApplication.OpenURLOptionsKey: Any] = [:]
  ) -> Bool {
    print("[AppDelegate] Received URL: \(url.absoluteString)")
    print("[AppDelegate] URL scheme: \(url.scheme ?? "none")")
    print("[AppDelegate] URL host: \(url.host ?? "none")")

    // Handle Meta Wearables callback URLs
    // Check if it's our app scheme and contains Meta Wearables action
    if url.scheme == "com.omnia.mobileenterprise" || url.absoluteString.contains("metaWearablesAction") {
      print("[AppDelegate] Detected Meta Wearables callback URL")
      Task {
        do {
          _ = try await Wearables.shared.handleUrl(url)
          print("[AppDelegate] ✅ Successfully handled Meta Wearables URL")
        } catch {
          print("[AppDelegate] ❌ Failed to handle Meta Wearables URL: \(error)")
        }
      }
      return true
    }

    return super.application(app, open: url, options: options) || RCTLinkingManager.application(app, open: url, options: options)
  }

  // Universal Links
  public override func application(
    _ application: UIApplication,
    continue userActivity: NSUserActivity,
    restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void
  ) -> Bool {
    print("[AppDelegate] continue userActivity called")
    print("[AppDelegate] Activity type: \(userActivity.activityType)")
    if let url = userActivity.webpageURL {
      print("[AppDelegate] Universal Link URL: \(url.absoluteString)")
    }

    let result = RCTLinkingManager.application(application, continue: userActivity, restorationHandler: restorationHandler)
    return super.application(application, continue: userActivity, restorationHandler: restorationHandler) || result
  }
}

class ReactNativeDelegate: ExpoReactNativeFactoryDelegate {
  // Extension point for config-plugins

  override func sourceURL(for bridge: RCTBridge) -> URL? {
    // needed to return the correct URL for expo-dev-client.
    bridge.bundleURL ?? bundleURL()
  }

  override func bundleURL() -> URL? {
#if DEBUG
    return RCTBundleURLProvider.sharedSettings().jsBundleURL(forBundleRoot: ".expo/.virtual-metro-entry")
#else
    return Bundle.main.url(forResource: "main", withExtension: "jsbundle")
#endif
  }
}
