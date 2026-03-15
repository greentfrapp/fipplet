import fs from 'fs'
import path from 'path'
import { chromium } from 'playwright'
import { ACTIONS } from './actions'
import type {
  ActionContext,
  RecordOptions,
  RecordingDefinition,
  RecordingResult,
} from './types'
import { loadDefinition } from './validation'
import { createZoomState } from './zoom'

export async function record(
  input: RecordingDefinition | string,
  options: RecordOptions = {},
): Promise<RecordingResult> {
  const def = typeof input === 'string' ? loadDefinition(input) : input
  const outputDir = options.outputDir ?? './fipplet-output'
  const headless = options.headless ?? true

  fs.mkdirSync(outputDir, { recursive: true })

  const viewport = def.viewport ?? { width: 1280, height: 720 }
  const zoomState = createZoomState()
  const screenshots: string[] = []

  // Resolve storage state if provided
  let storageState: object | undefined
  if (def.storageState) {
    const statePath = path.resolve(def.storageState)
    storageState = JSON.parse(fs.readFileSync(statePath, 'utf-8'))
  }

  const browser = await chromium.launch({ headless })

  const contextOptions: Record<string, unknown> = {
    viewport,
    colorScheme: def.colorScheme ?? 'light',
    recordVideo: {
      dir: outputDir,
      size: viewport,
    },
  }

  if (storageState) {
    contextOptions.storageState = storageState
  }

  if (def.headers) {
    contextOptions.extraHTTPHeaders = def.headers
  }

  const context = await browser.newContext(contextOptions)

  if (def.cookies && def.cookies.length > 0) {
    await context.addCookies(def.cookies)
  }

  const page = await context.newPage()

  // Handle localStorage auth (requires navigating first)
  if (def.localStorage && Object.keys(def.localStorage).length > 0) {
    await page
      .goto(def.url, { waitUntil: 'commit', timeout: 15000 })
      .catch(() => {})
    await page.evaluate((entries: Record<string, string>) => {
      for (const [key, value] of Object.entries(entries)) {
        localStorage.setItem(key, value)
      }
    }, def.localStorage)
    await page
      .reload({ waitUntil: 'networkidle', timeout: 15000 })
      .catch(() => {})
  } else {
    try {
      await page.goto(def.url, { waitUntil: 'networkidle', timeout: 15000 })
    } catch {
      // Page didn't reach networkidle, continue anyway
    }
  }

  if (def.waitForSelector) {
    await page
      .waitForSelector(def.waitForSelector, { timeout: 10000 })
      .catch(() => {})
  }

  // Execute steps
  const ctx: ActionContext = { outputDir, zoomState }

  for (const [i, step] of def.steps.entries()) {
    const label = step.action + ('selector' in step ? ` ${step.selector}` : '')
    process.stderr.write(`  [${i + 1}/${def.steps.length}] ${label}\n`)

    try {
      await ACTIONS[step.action](page, step, ctx)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      process.stderr.write(`  step ${i + 1} failed: ${msg}\n`)
    }

    if (step.action === 'screenshot') {
      const name =
        'name' in step && step.name ? step.name : `step-${Date.now()}`
      screenshots.push(path.join(outputDir, `${name}.png`))
    }

    if (step.action !== 'wait') {
      await page.waitForTimeout(step.pauseAfter ?? 500)
    }
  }

  // Final screenshot
  const finalPath = path.join(outputDir, 'final.png')
  await page.screenshot({ path: finalPath })
  screenshots.push(finalPath)

  await context.close()
  await browser.close()

  // Find video file
  const files = fs.readdirSync(outputDir)
  const videoFile = files.find((f: string) => f.endsWith('.webm'))

  return {
    video: videoFile ? path.join(outputDir, videoFile) : undefined,
    screenshots,
  }
}
