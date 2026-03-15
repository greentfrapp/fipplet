import type { Page } from 'playwright-core'
import type { ZoomState } from './types'

export function createZoomState(): ZoomState {
  return { scale: 1, tx: 0, ty: 0 }
}

export async function suspendZoom(page: Page, state: ZoomState): Promise<void> {
  if (state.scale === 1) return
  await page.evaluate(() => {
    const html = document.documentElement
    html.style.transition = 'none'
    html.style.transform = 'scale(1) translate(0px, 0px)'
  })
  await page.waitForTimeout(50)
}

export async function restoreZoom(page: Page, state: ZoomState): Promise<void> {
  if (state.scale === 1) return
  const { scale, tx, ty } = state
  await page.evaluate(
    ({ scale, tx, ty }) => {
      const html = document.documentElement
      html.style.transition = 'none'
      html.style.transform = `scale(${scale}) translate(${tx}px, ${ty}px)`
    },
    { scale, tx, ty },
  )
  await page.waitForTimeout(50)
}
