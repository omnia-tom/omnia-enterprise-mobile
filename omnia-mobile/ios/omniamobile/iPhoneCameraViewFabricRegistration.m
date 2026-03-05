#import <Foundation/Foundation.h>

@interface iPhoneCameraViewFabricRegistration : NSObject
@end

@implementation iPhoneCameraViewFabricRegistration

+ (void)load {
  // Register via runtime to avoid importing React-Fabric headers (pulls in C++/atomic
  // which breaks bridging header and can cause build issues). The class lives in
  // React Native's linked frameworks.
  Class cls = NSClassFromString(@"RCTLegacyViewManagerInteropComponentView");
  if (cls) {
    #pragma clang diagnostic push
    #pragma clang diagnostic ignored "-Warc-performSelector-leaks"
    [cls performSelector:@selector(supportLegacyViewManagerWithName:) withObject:@"iPhoneCameraView"];
    #pragma clang diagnostic pop
  }
}

@end
