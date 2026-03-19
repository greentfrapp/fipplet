export { record } from './recorder.js'
export { login } from './login.js'
export { loadDefinition, loadSetup } from './validation.js'
export { resolveAuth } from './providers/index.js'
export type {
  RecordingDefinition,
  RecordOptions,
  RecordingResult,
  SetupBlock,
  Step,
  ActionName,
  Viewport,
  Cookie,
  AuthProvider,
  SupabaseAuthProvider,
  AuthResult,
  WaitStep,
  ClickStep,
  TypeStep,
  ClearStep,
  FillStep,
  SelectStep,
  ScrollStep,
  HoverStep,
  KeyboardStep,
  NavigateStep,
  ScreenshotStep,
  ZoomStep,
  CursorOptions,
  CursorStyle,
  WindowChromeOptions,
  BackgroundOptions,
  OutputFormat,
  StepTiming,
} from './types.js'
export type { LoginOptions } from './login.js'
