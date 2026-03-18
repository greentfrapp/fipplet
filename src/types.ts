export interface Viewport {
  width: number
  height: number
}

export interface Cookie {
  name: string
  value: string
  domain: string
  path: string
  expires?: number
  httpOnly?: boolean
  secure?: boolean
  sameSite?: 'Strict' | 'Lax' | 'None'
}

// --- Step types (discriminated union on `action`) ---

interface BaseStep {
  pauseAfter?: number
}

export interface WaitStep extends BaseStep {
  action: 'wait'
  ms?: number
}

export interface ClickStep extends BaseStep {
  action: 'click'
  selector: string
}

export interface TypeStep extends BaseStep {
  action: 'type'
  selector: string
  text: string
  delay?: number
  clear?: boolean
}

export interface ClearStep extends BaseStep {
  action: 'clear'
  selector: string
}

export interface FillStep extends BaseStep {
  action: 'fill'
  selector: string
  text: string
}

export interface SelectStep extends BaseStep {
  action: 'select'
  selector: string
  value: string
}

export interface ScrollStep extends BaseStep {
  action: 'scroll'
  x?: number
  y?: number
}

export interface HoverStep extends BaseStep {
  action: 'hover'
  selector: string
}

export interface KeyboardStep extends BaseStep {
  action: 'keyboard'
  key: string
}

export interface NavigateStep extends BaseStep {
  action: 'navigate'
  url: string
}

export interface ScreenshotStep extends BaseStep {
  action: 'screenshot'
  name?: string
  fullPage?: boolean
}

export interface ZoomStep extends BaseStep {
  action: 'zoom'
  selector?: string
  scale?: number
  x?: number
  y?: number
  duration?: number
}

export type Step =
  | WaitStep
  | ClickStep
  | TypeStep
  | ClearStep
  | FillStep
  | SelectStep
  | ScrollStep
  | HoverStep
  | KeyboardStep
  | NavigateStep
  | ScreenshotStep
  | ZoomStep

export type ActionName = Step['action']

export interface SetupBlock {
  url?: string
  steps: Step[]
}

export type CursorStyle = 'default' | 'pointer' | 'crosshair'

export interface CursorOptions {
  enabled?: boolean
  /** Cursor image style. Default: 'default'. */
  style?: CursorStyle
  size?: number
  color?: string
  rippleColor?: string
  rippleSize?: number
  transitionMs?: number
}

export interface RecordingDefinition {
  url: string
  viewport?: Viewport
  colorScheme?: 'light' | 'dark'
  waitForSelector?: string
  storageState?: string
  cookies?: Cookie[]
  localStorage?: Record<string, string>
  headers?: Record<string, string>
  auth?: AuthProvider
  cursor?: boolean | CursorOptions
  setup?: SetupBlock
  steps: Step[]
}

export interface RecordOptions {
  outputDir?: string
  headless?: boolean
  setup?: SetupBlock
}

export interface RecordingResult {
  video?: string
  screenshots: string[]
  cursorEvents?: string
}

// --- Auth providers (discriminated union on `provider`) ---

export interface SupabaseAuthProvider {
  provider: 'supabase'
  url: string
  serviceRoleKey: string
  email: string
}

export type AuthProvider = SupabaseAuthProvider

export interface AuthResult {
  localStorage?: Record<string, string>
  cookies?: Cookie[]
  headers?: Record<string, string>
}

export interface ZoomState {
  scale: number
  tx: number
  ty: number
}

export interface CursorEvent {
  time: number          // seconds from recording start
  type: 'move' | 'ripple' | 'hide' | 'show'
  x: number
  y: number
  transitionMs?: number // for 'move' events
  rippleSize?: number   // for 'ripple' events
  rippleColor?: string  // for 'ripple' events
}

export interface ActionContext {
  outputDir: string
  zoomState: ZoomState
  cursorEnabled: boolean
  cursorOptions?: CursorOptions
}
