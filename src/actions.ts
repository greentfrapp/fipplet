import path from 'path'
import type { Page } from 'playwright-core'
import {
  moveCursorTo as defaultMoveCursorTo,
  triggerRipple as defaultTriggerRipple,
} from './cursor'
import { logError } from './logger'
import type {
  ActionContext,
  ActionName,
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
  WaitForNetworkStep,
  WaitStep,
  ZoomStep,
} from './types'
import { sanitizeFilename, timestamp } from './utils'
// zoom suspend/restore no longer needed — all actions use screen coordinates

function getMoveCursorTo(ctx: ActionContext) {
  return ctx.cursorTracker
    ? ctx.cursorTracker.moveCursorTo.bind(ctx.cursorTracker)
    : defaultMoveCursorTo
}

function getTriggerRipple(ctx: ActionContext) {
  return ctx.cursorTracker
    ? ctx.cursorTracker.triggerRipple.bind(ctx.cursorTracker)
    : defaultTriggerRipple
}

type ActionHandler = (
  page: Page,
  step: Step,
  ctx: ActionContext,
) => Promise<void | string>

function action<S extends Step>(
  handler: (page: Page, step: S, ctx: ActionContext) => Promise<void | string>,
): ActionHandler {
  return handler as ActionHandler
}

const DEFAULT_SELECTOR_TIMEOUT = 5000

/** Wait for a selector to become visible, retrying until timeout. */
async function awaitSelector(
  page: Page,
  selector: string,
  timeout: number,
): Promise<void> {
  await page.locator(selector).waitFor({ state: 'visible', timeout })
}

/** Get the screen-space center of an element (includes CSS transform effects). */
async function getScreenCenter(
  page: Page,
  selector: string,
): Promise<{ x: number; y: number } | null> {
  return page.evaluate((sel: string) => {
    const el = document.querySelector(sel)
    if (!el) return null
    const rect = el.getBoundingClientRect()
    return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }
  }, selector)
}

/** Focus an element without changing zoom. Works at any zoom level. */
async function focusElement(page: Page, selector: string): Promise<void> {
  await page.evaluate((sel: string) => {
    const el = document.querySelector(sel) as HTMLElement | null
    el?.focus()
  }, selector)
}

async function handleWait(page: Page, step: WaitStep): Promise<void> {
  await page.waitForTimeout(step.ms ?? 1000)
}

async function handleClick(
  page: Page,
  step: ClickStep,
  ctx: ActionContext,
): Promise<void> {
  await awaitSelector(
    page,
    step.selector,
    step.timeout ?? DEFAULT_SELECTOR_TIMEOUT,
  )
  if (ctx.cursorEnabled) {
    await getMoveCursorTo(ctx)(
      page,
      step.selector,
      ctx.zoomState,
      ctx.cursorOptions,
    )
    await getTriggerRipple(ctx)(page, ctx.cursorOptions)
  }
  const center = await getScreenCenter(page, step.selector)
  if (center) {
    await page.mouse.click(center.x, center.y)
  }
}

async function handleType(
  page: Page,
  step: TypeStep,
  ctx: ActionContext,
): Promise<void> {
  await awaitSelector(
    page,
    step.selector,
    step.timeout ?? DEFAULT_SELECTOR_TIMEOUT,
  )
  if (ctx.cursorEnabled) {
    await getMoveCursorTo(ctx)(
      page,
      step.selector,
      ctx.zoomState,
      ctx.cursorOptions,
    )
    if (step.clear) await getTriggerRipple(ctx)(page, ctx.cursorOptions)
  }
  // Click to focus (using screen coordinates preserves zoom)
  const center = await getScreenCenter(page, step.selector)
  if (center) {
    if (step.clear) {
      await page.mouse.click(center.x, center.y, { clickCount: 3 })
    } else {
      await page.mouse.click(center.x, center.y)
    }
  }
  await page.keyboard.type(step.text, { delay: step.delay ?? 80 })
}

async function handleClear(
  page: Page,
  step: ClearStep,
  ctx: ActionContext,
): Promise<void> {
  await awaitSelector(
    page,
    step.selector,
    step.timeout ?? DEFAULT_SELECTOR_TIMEOUT,
  )
  if (ctx.cursorEnabled) {
    await getMoveCursorTo(ctx)(
      page,
      step.selector,
      ctx.zoomState,
      ctx.cursorOptions,
    )
    await getTriggerRipple(ctx)(page, ctx.cursorOptions)
  }
  await focusElement(page, step.selector)
  await page.keyboard.press('Control+a')
  await page.keyboard.press('Delete')
}

async function handleFill(
  page: Page,
  step: FillStep,
  ctx: ActionContext,
): Promise<void> {
  await awaitSelector(
    page,
    step.selector,
    step.timeout ?? DEFAULT_SELECTOR_TIMEOUT,
  )
  if (ctx.cursorEnabled) {
    await getMoveCursorTo(ctx)(
      page,
      step.selector,
      ctx.zoomState,
      ctx.cursorOptions,
    )
  }
  // Focus and set value via evaluate to avoid zoom suspend
  await page.evaluate(
    ({ sel, text }: { sel: string; text: string }) => {
      const el = document.querySelector(sel) as HTMLInputElement | null
      if (!el) return
      el.focus()
      el.value = text
      el.dispatchEvent(new Event('input', { bubbles: true }))
      el.dispatchEvent(new Event('change', { bubbles: true }))
    },
    { sel: step.selector, text: step.text },
  )
}

async function handleSelect(
  page: Page,
  step: SelectStep,
  ctx: ActionContext,
): Promise<void> {
  await awaitSelector(
    page,
    step.selector,
    step.timeout ?? DEFAULT_SELECTOR_TIMEOUT,
  )
  if (ctx.cursorEnabled) {
    await getMoveCursorTo(ctx)(
      page,
      step.selector,
      ctx.zoomState,
      ctx.cursorOptions,
    )
  }
  // Set select value via evaluate to avoid zoom suspend
  await page.evaluate(
    ({ sel, value }: { sel: string; value: string }) => {
      const el = document.querySelector(sel) as HTMLSelectElement | null
      if (!el) return
      el.focus()
      el.value = value
      el.dispatchEvent(new Event('change', { bubbles: true }))
    },
    { sel: step.selector, value: step.value },
  )
}

async function handleScroll(
  page: Page,
  step: ScrollStep,
  _ctx: ActionContext,
): Promise<void> {
  const baseDuration = 600
  const speedMultiplier = step.scrollSpeed ?? 1
  const duration = baseDuration / speedMultiplier

  await page.evaluate(
    ({ x, y, duration }) => {
      return new Promise<void>((resolve) => {
        const startX = window.scrollX
        const startY = window.scrollY
        const dx = x ?? 0
        const dy = y ?? 0
        const start = performance.now()

        function ease(t: number): number {
          return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
        }

        function tick(now: number) {
          const elapsed = now - start
          const t = Math.min(elapsed / duration, 1)
          const p = ease(t)
          window.scrollTo(startX + dx * p, startY + dy * p)
          if (t < 1) {
            requestAnimationFrame(tick)
          } else {
            resolve()
          }
        }

        requestAnimationFrame(tick)
      })
    },
    { x: step.x, y: step.y, duration },
  )
}

async function handleHover(
  page: Page,
  step: HoverStep,
  ctx: ActionContext,
): Promise<void> {
  await awaitSelector(
    page,
    step.selector,
    step.timeout ?? DEFAULT_SELECTOR_TIMEOUT,
  )
  if (ctx.cursorEnabled) {
    await getMoveCursorTo(ctx)(
      page,
      step.selector,
      ctx.zoomState,
      ctx.cursorOptions,
    )
  }
  // Use screen coordinates to trigger :hover without disrupting zoom
  const center = await getScreenCenter(page, step.selector)
  if (center) {
    await page.mouse.move(center.x, center.y)
  }
}

async function handleKeyboard(
  page: Page,
  step: KeyboardStep,
  _ctx: ActionContext,
): Promise<void> {
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
    .catch((err) =>
      logError(
        `  warning: navigate to '${step.url}' did not reach networkidle: ${err.message}`,
      ),
    )
}

async function handleScreenshot(
  page: Page,
  step: ScreenshotStep,
  ctx: ActionContext,
): Promise<string> {
  const name = sanitizeFilename(step.name ?? `step-${timestamp()}`)
  const filepath = path.join(ctx.outputDir, `${name}.png`)
  await page.screenshot({ path: filepath, fullPage: step.fullPage ?? false })
  return filepath
}

async function handleZoom(
  page: Page,
  step: ZoomStep,
  ctx: ActionContext,
): Promise<void> {
  const scale = step.scale ?? 2
  const duration = step.duration ?? 600

  if (ctx.cursorEnabled && step.selector) {
    await getMoveCursorTo(ctx)(
      page,
      step.selector,
      ctx.zoomState,
      ctx.cursorOptions,
    )
  }

  if (scale === 1 && !step.selector) {
    ctx.zoomState.scale = 1
    ctx.zoomState.tx = 0
    ctx.zoomState.ty = 0
    if (ctx.cursorTracker) ctx.cursorTracker.setZoom(1, duration)
    await page.evaluate((ms: number) => {
      const html = document.documentElement
      html.style.transition = `transform ${ms}ms ease-in-out`
      html.style.transformOrigin = 'top left'
      html.style.transform = 'scale(1) translate(0px, 0px)'
    }, duration)
    await page.waitForTimeout(duration + 100)
    return
  }

  // Compute target in layout coordinates without suspending zoom
  let targetX: number
  let targetY: number

  if (step.selector) {
    const { scale: curScale, tx: curTx, ty: curTy } = ctx.zoomState
    const center = await page.evaluate(
      ({ sel, s, tx, ty }: { sel: string; s: number; tx: number; ty: number }) => {
        const el = document.querySelector(sel)
        if (!el) return null
        const rect = el.getBoundingClientRect()
        const screenX = rect.x + rect.width / 2
        const screenY = rect.y + rect.height / 2
        // Reverse CSS transform to get layout coordinates
        return {
          x: s === 1 ? screenX : screenX / s - tx,
          y: s === 1 ? screenY : screenY / s - ty,
        }
      },
      { sel: step.selector, s: curScale, tx: curTx, ty: curTy },
    )
    if (!center) throw new Error(`zoom target '${step.selector}' not found`)
    targetX = center.x
    targetY = center.y
  } else {
    targetX = step.x ?? 640
    targetY = step.y ?? 360
  }

  const vp = page.viewportSize()
  if (!vp)
    throw new Error('viewport size not set — cannot compute zoom translation')
  const { width: vw, height: vh } = vp

  const tx = vw / 2 / scale - targetX
  const ty = vh / 2 / scale - targetY

  const clampedTx = Math.min(0, Math.max(vw / scale - vw, tx))
  const clampedTy = Math.min(0, Math.max(vh / scale - vh, ty))

  ctx.zoomState.scale = scale
  ctx.zoomState.tx = clampedTx
  ctx.zoomState.ty = clampedTy
  if (ctx.cursorTracker) ctx.cursorTracker.setZoom(scale, duration)

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

async function handleWaitForNetwork(
  page: Page,
  step: WaitForNetworkStep,
): Promise<void> {
  const timeout = step.timeout ?? DEFAULT_SELECTOR_TIMEOUT
  await page.waitForResponse(
    (response) => response.url().includes(step.urlPattern),
    { timeout },
  )
}

export const ACTIONS: Record<ActionName, ActionHandler> = {
  wait: action<WaitStep>(handleWait),
  click: action<ClickStep>(handleClick),
  type: action<TypeStep>(handleType),
  clear: action<ClearStep>(handleClear),
  fill: action<FillStep>(handleFill),
  select: action<SelectStep>(handleSelect),
  scroll: action<ScrollStep>(handleScroll),
  hover: action<HoverStep>(handleHover),
  keyboard: action<KeyboardStep>(handleKeyboard),
  navigate: action<NavigateStep>(handleNavigate),
  screenshot: action<ScreenshotStep>(handleScreenshot),
  zoom: action<ZoomStep>(handleZoom),
  waitForNetwork: action<WaitForNetworkStep>(handleWaitForNetwork),
}
