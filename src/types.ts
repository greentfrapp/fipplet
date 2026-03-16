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

export interface RecordingDefinition {
  url: string
  viewport?: Viewport
  colorScheme?: 'light' | 'dark'
  waitForSelector?: string
  storageState?: string
  cookies?: Cookie[]
  localStorage?: Record<string, string>
  headers?: Record<string, string>
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
}

export interface ZoomState {
  scale: number
  tx: number
  ty: number
}

export interface ActionContext {
  outputDir: string
  zoomState: ZoomState
}
