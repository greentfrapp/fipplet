import path from 'path'
import type { Page } from 'playwright'
import type {
  ActionContext,
  ClearStep,
  ClickStep,
  FillStep,
  HoverStep,
  KeyboardStep,
  NavigateStep,
  ScreenshotStep,
  ScrollStep,
  SelectStep,
  Step,
  TypeStep,
  WaitStep,
  ZoomStep,
} from './types'
import { restoreZoom, suspendZoom } from './zoom'

type ActionHandler<S extends Step = Step> = (
  page: Page,
  step: S,
  ctx: ActionContext,
) => Promise<void>

async function handleWait(page: Page, step: WaitStep): Promise<void> {
  await page.waitForTimeout(step.ms ?? 1000)
}

async function handleClick(
  page: Page,
  step: ClickStep,
  ctx: ActionContext,
): Promise<void> {
  await suspendZoom(page, ctx.zoomState)
  await page.click(step.selector)
  await restoreZoom(page, ctx.zoomState)
}

async function handleType(
  page: Page,
  step: TypeStep,
  ctx: ActionContext,
): Promise<void> {
  await suspendZoom(page, ctx.zoomState)
  if (step.clear) {
    await page.click(step.selector, { clickCount: 3 })
  }
  await page.type(step.selector, step.text, { delay: step.delay ?? 80 })
  await restoreZoom(page, ctx.zoomState)
}

async function handleClear(
  page: Page,
  step: ClearStep,
  ctx: ActionContext,
): Promise<void> {
  await suspendZoom(page, ctx.zoomState)
  await page.click(step.selector, { clickCount: 3 })
  await page.keyboard.press('Backspace')
  await restoreZoom(page, ctx.zoomState)
}

async function handleFill(
  page: Page,
  step: FillStep,
  ctx: ActionContext,
): Promise<void> {
  await suspendZoom(page, ctx.zoomState)
  await page.fill(step.selector, step.text)
  await restoreZoom(page, ctx.zoomState)
}

async function handleSelect(
  page: Page,
  step: SelectStep,
  ctx: ActionContext,
): Promise<void> {
  await suspendZoom(page, ctx.zoomState)
  await page.selectOption(step.selector, step.value)
  await restoreZoom(page, ctx.zoomState)
}

async function handleScroll(page: Page, step: ScrollStep): Promise<void> {
  await page.evaluate(({ x, y }) => window.scrollBy(x ?? 0, y ?? 0), {
    x: step.x,
    y: step.y,
  })
}

async function handleHover(
  page: Page,
  step: HoverStep,
  ctx: ActionContext,
): Promise<void> {
  await suspendZoom(page, ctx.zoomState)
  await page.hover(step.selector)
  await restoreZoom(page, ctx.zoomState)
}

async function handleKeyboard(page: Page, step: KeyboardStep): Promise<void> {
  await page.keyboard.press(step.key)
}

async function handleNavigate(
  page: Page,
  step: NavigateStep,
  ctx: ActionContext,
): Promise<void> {
  ctx.zoomState.scale = 1
  ctx.zoomState.tx = 0
  ctx.zoomState.ty = 0
  await page
    .goto(step.url, { waitUntil: 'networkidle', timeout: 10000 })
    .catch(() => {})
}

async function handleScreenshot(
  page: Page,
  step: ScreenshotStep,
  ctx: ActionContext,
): Promise<void> {
  const name = step.name ?? `step-${Date.now()}`
  const filepath = path.join(ctx.outputDir, `${name}.png`)
  await page.screenshot({ path: filepath, fullPage: step.fullPage ?? false })
}

async function handleZoom(
  page: Page,
  step: ZoomStep,
  ctx: ActionContext,
): Promise<void> {
  const scale = step.scale ?? 2
  const duration = step.duration ?? 600

  if (scale === 1 && !step.selector) {
    ctx.zoomState.scale = 1
    ctx.zoomState.tx = 0
    ctx.zoomState.ty = 0
    await page.evaluate((ms: number) => {
      const html = document.documentElement
      html.style.transition = `transform ${ms}ms ease-in-out`
      html.style.transformOrigin = 'top left'
      html.style.transform = 'scale(1) translate(0px, 0px)'
    }, duration)
    await page.waitForTimeout(duration + 100)
    return
  }

  await suspendZoom(page, ctx.zoomState)

  let targetX: number
  let targetY: number

  if (step.selector) {
    const box = await page.locator(step.selector).boundingBox()
    if (!box) throw new Error(`zoom target '${step.selector}' not found`)
    targetX = box.x + box.width / 2
    targetY = box.y + box.height / 2
  } else {
    targetX = step.x ?? 640
    targetY = step.y ?? 360
  }

  const { width: vw, height: vh } = page.viewportSize()!

  const tx = vw / 2 / scale - targetX
  const ty = vh / 2 / scale - targetY

  const clampedTx = Math.min(0, Math.max(vw / scale - vw, tx))
  const clampedTy = Math.min(0, Math.max(vh / scale - vh, ty))

  ctx.zoomState.scale = scale
  ctx.zoomState.tx = clampedTx
  ctx.zoomState.ty = clampedTy

  await page.evaluate(
    ({
      scale,
      tx,
      ty,
      ms,
    }: {
      scale: number
      tx: number
      ty: number
      ms: number
    }) => {
      const html = document.documentElement
      html.style.transition = `transform ${ms}ms ease-in-out`
      html.style.transformOrigin = 'top left'
      html.style.transform = `scale(${scale}) translate(${tx}px, ${ty}px)`
    },
    { scale, tx: clampedTx, ty: clampedTy, ms: duration },
  )

  await page.waitForTimeout(duration + 100)
}

export const ACTIONS: Record<string, ActionHandler> = {
  wait: handleWait as ActionHandler,
  click: handleClick as ActionHandler,
  type: handleType as ActionHandler,
  clear: handleClear as ActionHandler,
  fill: handleFill as ActionHandler,
  select: handleSelect as ActionHandler,
  scroll: handleScroll as ActionHandler,
  hover: handleHover as ActionHandler,
  keyboard: handleKeyboard as ActionHandler,
  navigate: handleNavigate as ActionHandler,
  screenshot: handleScreenshot as ActionHandler,
  zoom: handleZoom as ActionHandler,
}
