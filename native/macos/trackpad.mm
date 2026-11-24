// A temporary AppKit view receives absolute, indirect touches over the Electron window.
#import <AppKit/AppKit.h>
#import <Carbon/Carbon.h>
#include <node_api.h>

struct Sample {
  const char *phase;
  double x, y, aspect;
  const char *code = nullptr;
};

static void deliver(napi_env env, napi_value callback, void *, void *data) {
  Sample *s = static_cast<Sample *>(data);
  if (env && callback) {
    napi_value args[4], receiver;
    napi_create_string_utf8(env, s->phase, NAPI_AUTO_LENGTH, &args[0]);
    if (s->code) napi_create_string_utf8(env, s->code, NAPI_AUTO_LENGTH, &args[1]);
    else napi_create_double(env, s->x, &args[1]);
    napi_create_double(env, s->y, &args[2]);
    napi_create_double(env, s->aspect, &args[3]);
    napi_get_undefined(env, &receiver);
    napi_call_function(env, receiver, callback, s->code ? 2 : 4, args, nullptr);
  }
  delete s;
}

@interface PenrillTrackpadView : NSView
@property(nonatomic) napi_threadsafe_function sink;
@property(nonatomic, strong) id finger;
@property(nonatomic) BOOL waitingForLift;
@property(nonatomic, weak) NSResponder *previousResponder;
@end

@implementation PenrillTrackpadView
- (void)emit:(const char *)phase touch:(NSTouch *)touch {
  if (!self.sink) return;
  NSPoint p = touch.normalizedPosition;
  NSSize size = touch.deviceSize;
  Sample *s = new Sample{phase, p.x, 1 - p.y, size.height > 0 ? size.width / size.height : 1.6};
  if (napi_call_threadsafe_function(self.sink, s, napi_tsfn_nonblocking) != napi_ok) delete s;
}
- (void)touchesBeganWithEvent:(NSEvent *)event {
  NSSet<NSTouch *> *down = [event touchesMatchingPhase:NSTouchPhaseTouching inView:self];
  if (down.count != 1 || self.waitingForLift) {
    if (self.finger) [self emit:"cancel" touch:nil];
    self.finger = nil;
    self.waitingForLift = YES;
    return;
  }
  NSTouch *touch = down.anyObject;
  self.finger = touch.identity;
  [self emit:"begin" touch:touch];
}
- (void)handle:(NSEvent *)event phase:(NSTouchPhase)phase name:(const char *)name {
  for (NSTouch *touch in [event touchesMatchingPhase:phase inView:self]) {
    if ([touch.identity isEqual:self.finger]) {
      [self emit:name touch:touch];
      if (phase != NSTouchPhaseMoved) self.finger = nil;
    }
  }
  if (![event touchesMatchingPhase:NSTouchPhaseTouching inView:self].count) self.waitingForLift = NO;
}
- (void)touchesMovedWithEvent:(NSEvent *)e { [self handle:e phase:NSTouchPhaseMoved name:"move"]; }
- (void)touchesEndedWithEvent:(NSEvent *)e { [self handle:e phase:NSTouchPhaseEnded name:"end"]; }
- (void)touchesCancelledWithEvent:(NSEvent *)e { [self handle:e phase:NSTouchPhaseCancelled name:"cancel"]; }
- (BOOL)acceptsFirstResponder { return YES; }
- (void)keyDown:(NSEvent *)event {
  // AppKit owns keyboard focus during capture. Translate hardware positions to DOM codes.
  const char *code = nullptr;
  if (!(event.modifierFlags & (NSEventModifierFlagCommand | NSEventModifierFlagControl |
                              NSEventModifierFlagOption | NSEventModifierFlagShift))) {
    switch (event.keyCode) {
      case kVK_ANSI_W: code = "KeyW"; break;
      case kVK_ANSI_A: code = "KeyA"; break;
      case kVK_ANSI_S: code = "KeyS"; break;
      case kVK_ANSI_D: code = "KeyD"; break;
      case kVK_UpArrow: code = "ArrowUp"; break;
      case kVK_LeftArrow: code = "ArrowLeft"; break;
      case kVK_DownArrow: code = "ArrowDown"; break;
      case kVK_RightArrow: code = "ArrowRight"; break;
    }
  }
  if (code && self.sink) {
    Sample *s = new Sample{"key", 0, 0, 0, code};
    if (napi_call_threadsafe_function(self.sink, s, napi_tsfn_nonblocking) != napi_ok) delete s;
    return;
  }
  [self interpretKeyEvents:@[event]];
}
- (void)insertNewline:(id)sender { [self emit:"finish" touch:nil]; }
- (void)cancelOperation:(id)sender { [self emit:"finish" touch:nil]; }
// A short touch can also generate a click when tap-to-click is enabled.
- (void)mouseDown:(NSEvent *)e {}
- (void)mouseUp:(NSEvent *)e {}
- (void)scrollWheel:(NSEvent *)e {}
@end

static PenrillTrackpadView *pad;
static BOOL cursorDetached;

static void detach() {
  if (!pad) return;
  if (pad.window.firstResponder == pad) [pad.window makeFirstResponder:pad.previousResponder];
  [pad removeFromSuperview];
  napi_release_threadsafe_function(pad.sink, napi_tsfn_release);
  pad.sink = nullptr;
  pad = nil;
  if (cursorDetached) CGAssociateMouseAndMouseCursorPosition(true);
  cursorDetached = NO;
}

static napi_value stop(napi_env env, napi_callback_info info) {
  detach();
  return nullptr;
}

static napi_value start(napi_env env, napi_callback_info info) {
  size_t argc = 2, length = 0;
  napi_value args[2], name;
  napi_get_cb_info(env, info, &argc, args, nullptr, nullptr);
  void *buffer = nullptr;
  if (argc != 2 || napi_get_buffer_info(env, args[0], &buffer, &length) != napi_ok || length != sizeof(void *)) {
    napi_throw_type_error(env, nullptr, "Expected an Electron window handle");
    return nullptr;
  }
  NSView *host = ((__bridge NSView *)(*(void **)buffer)).window.contentView;
  if (!host || !host.window.isKeyWindow) {
    napi_throw_error(env, nullptr, "The board window must have focus");
    return nullptr;
  }
  detach();
  PenrillTrackpadView *view = [[PenrillTrackpadView alloc] initWithFrame:host.bounds];
  napi_threadsafe_function sink;
  napi_create_string_utf8(env, "Penrill trackpad", NAPI_AUTO_LENGTH, &name);
  if (napi_create_threadsafe_function(env, args[1], nullptr, name, 0, 1, nullptr, nullptr, nullptr, deliver, &sink) != napi_ok) {
    napi_throw_error(env, nullptr, "Could not start trackpad capture");
    return nullptr;
  }
  view.sink = sink;
  view.allowedTouchTypes = NSTouchTypeMaskIndirect;
  view.wantsRestingTouches = YES;
  view.autoresizingMask = NSViewWidthSizable | NSViewHeightSizable;
  [host addSubview:view positioned:NSWindowAbove relativeTo:nil];
  view.previousResponder = host.window.firstResponder;
  pad = view;
  if (![host.window makeFirstResponder:view]) {
    detach();
    napi_throw_error(env, nullptr, "Could not focus the trackpad view");
    return nullptr;
  }
  cursorDetached = CGAssociateMouseAndMouseCursorPosition(false) == kCGErrorSuccess;
  return nullptr;
}

NAPI_MODULE_INIT() {
  napi_property_descriptor methods[] = {
    {"start", nullptr, start, nullptr, nullptr, nullptr, napi_default, nullptr},
    {"stop", nullptr, stop, nullptr, nullptr, nullptr, napi_default, nullptr}
  };
  napi_define_properties(env, exports, 2, methods);
  return exports;
}
