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

export type OutputFormat = 'webm' | 'mp4' | 'gif'

export interface StepTiming {
  stepIndex: number
  startTime: number  // seconds from recording start
  endTime: number    // seconds from recording start
  speed: number
}

// --- Step types (discriminated union on `action`) ---

interface BaseStep {
  pauseAfter?: number
  speed?: number
  /** Timeout in ms for selector resolution. Default: 5000. */
  timeout?: number
  /** Selector or 'networkidle' condition to wait for before the action executes. */
  waitFor?: string
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
  /** Scroll animation speed multiplier (separate from BaseStep.speed which controls video playback speed). */
  scrollSpeed?: number
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

export interface WaitForNetworkStep extends BaseStep {
  action: 'waitForNetwork'
  /** URL substring to match against completed responses. */
  urlPattern: string
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
  | WaitForNetworkStep

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

export interface WindowChromeOptions {
  enabled?: boolean
  /** Title bar height in pixels. Default: 38. */
  titleBarHeight?: number
  /** Title bar color as hex string. Default: '#e8e8e8'. */
  titleBarColor?: string
  /** Show traffic light buttons. Default: true. */
  trafficLights?: boolean
  /** Display a URL in the title bar. Set to true to use the recording URL, or pass a custom string. */
  url?: boolean | string
}

export interface BackgroundOptions {
  enabled?: boolean
  /** Solid background color as hex string. Default: '#6366f1'. */
  color?: string
  /** Two-color diagonal gradient (overrides color). */
  gradient?: { from: string; to: string }
  /** Padding around the window in pixels. Default: 60. */
  padding?: number
  /** Corner radius in pixels. Default: 12. */
  borderRadius?: number
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
  /** macOS-style window chrome (title bar with traffic light buttons). */
  chrome?: boolean | WindowChromeOptions
  /** Background, padding, and rounded corners around the recording. */
  background?: boolean | BackgroundOptions
  speed?: number
  outputFormat?: OutputFormat
  setup?: SetupBlock
  steps: Step[]
}

export interface RecordOptions {
  outputDir?: string
  headless?: boolean
  setup?: SetupBlock
  speed?: number
  outputFormat?: OutputFormat
  /** Keep intermediate files (cursor JSON, etc.) instead of cleaning up. */
  keepIntermediates?: boolean
}

export interface RecordingResult {
  video?: string
  screenshots: string[]
  cursorEvents?: string
  /** Path to the output.json manifest file. */
  manifest?: string
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

export interface CursorTracker {
  moveCursorTo(page: import('playwright-core').Page, selector: string, zoomState: ZoomState, options?: CursorOptions): Promise<void>
  moveCursorToPoint(page: import('playwright-core').Page, x: number, y: number, options?: CursorOptions): Promise<void>
  triggerRipple(page: import('playwright-core').Page, options?: CursorOptions): Promise<void>
  hideCursor(page: import('playwright-core').Page): Promise<void>
  showCursor(page: import('playwright-core').Page): Promise<void>
  getEvents(): CursorEvent[]
}

export interface ActionContext {
  outputDir: string
  zoomState: ZoomState
  cursorEnabled: boolean
  cursorOptions?: CursorOptions
  cursorTracker?: CursorTracker
}
