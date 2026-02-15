#import <React/RCTViewManager.h>

@interface RCT_EXTERN_MODULE(MetaFrameViewManager, RCTViewManager)

RCT_EXPORT_VIEW_PROPERTY(isActive, BOOL)
RCT_EXPORT_VIEW_PROPERTY(contentMode_, NSString)

@end
