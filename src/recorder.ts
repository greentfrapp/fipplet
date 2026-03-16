import fs from 'fs'
import path from 'path'
import { chromium } from 'playwright-core'
import { ACTIONS } from './actions'
import type {
  ActionContext,
  RecordOptions,
  RecordingDefinition,
  RecordingResult,
} from './types'
import { loadDefinition } from './validation'
import { timestamp } from './utils'
import { createZoomState } from './zoom'

export async function record(
  input: RecordingDefinition | string,
  options: RecordOptions = {},
): Promise<RecordingResult> {
  const def = typeof input === 'string' ? loadDefinition(input) : input
  const outputDir = options.outputDir ?? './fipplet-output'
  const headless = options.headless ?? true
  // CLI --setup takes precedence over inline setup block
  const setup = options.setup ?? def.setup

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

  process.stderr.write('  launching browser...\n')
  const browser = await chromium.launch({ headless })

  // --- Setup phase (no video) ---
  if (setup) {
    process.stderr.write('  running setup...\n')

    const setupContextOptions: Record<string, unknown> = {
      viewport,
      colorScheme: def.colorScheme ?? 'light',
    }

    if (storageState) {
      setupContextOptions.storageState = storageState
    }

    if (def.headers) {
      setupContextOptions.extraHTTPHeaders = def.headers
    }

    const setupContext = await browser.newContext(setupContextOptions)

    if (def.cookies && def.cookies.length > 0) {
      await setupContext.addCookies(def.cookies)
    }

    const setupPage = await setupContext.newPage()

    // Navigate to setup URL (or main URL if not specified)
    const setupUrl = setup.url ?? def.url
    try {
      await setupPage.goto(setupUrl, { waitUntil: 'load', timeout: 15000 })
    } catch {
      // Page didn't reach load, continue anyway
    }

    // Handle localStorage injection during setup
    if (def.localStorage && Object.keys(def.localStorage).length > 0) {
      await setupPage.evaluate((entries: Record<string, string>) => {
        for (const [key, value] of Object.entries(entries)) {
          localStorage.setItem(key, value)
        }
      }, def.localStorage)
      await setupPage
        .reload({ waitUntil: 'load', timeout: 15000 })
        .catch((err) => process.stderr.write(`  warning: reload did not reach load: ${err.message}\n`))
    }

    // Execute setup steps
    const setupCtx: ActionContext = { outputDir, zoomState: createZoomState() }
    for (const [i, step] of setup.steps.entries()) {
      const label = step.action + ('selector' in step ? ` ${step.selector}` : '')
      process.stderr.write(`  [setup ${i + 1}/${setup.steps.length}] ${label}\n`)

      try {
        await ACTIONS[step.action](setupPage, step, setupCtx)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        process.stderr.write(`  setup step ${i + 1} failed: ${msg}\n`)
      }

      if (step.action !== 'wait') {
        await setupPage.waitForTimeout(step.pauseAfter ?? 500)
      }
    }

    // Export session state and close setup context
    storageState = await setupContext.storageState()
    await setupContext.close()
    process.stderr.write('  setup complete.\n')
  }

  // --- Recording phase (with video) ---
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

  // Only add cookies/localStorage manually when there was no setup phase
  // (setup phase already baked them into the exported storageState)
  if (!setup) {
    if (def.cookies && def.cookies.length > 0) {
      await context.addCookies(def.cookies)
    }
  }

  const page = await context.newPage()

  // Handle localStorage auth (requires navigating first) — skip if setup handled it
  if (!setup && def.localStorage && Object.keys(def.localStorage).length > 0) {
    await page
      .goto(def.url, { waitUntil: 'commit', timeout: 15000 })
      .catch((err) => process.stderr.write(`  warning: initial navigation failed: ${err.message}\n`))
    await page.evaluate((entries: Record<string, string>) => {
      for (const [key, value] of Object.entries(entries)) {
        localStorage.setItem(key, value)
      }
    }, def.localStorage)
    await page
      .reload({ waitUntil: 'load', timeout: 15000 })
      .catch((err) => process.stderr.write(`  warning: reload did not reach load: ${err.message}\n`))
  } else {
    try {
      await page.goto(def.url, { waitUntil: 'load', timeout: 15000 })
    } catch {
      // Page didn't reach load, continue anyway
    }
  }

  if (def.waitForSelector) {
    await page
      .waitForSelector(def.waitForSelector, { timeout: 10000 })
      .catch((err) => process.stderr.write(`  warning: waitForSelector '${def.waitForSelector}' failed: ${err.message}\n`))
  }

  // Execute steps
  const ctx: ActionContext = { outputDir, zoomState }

  for (const [i, step] of def.steps.entries()) {
    const label = step.action + ('selector' in step ? ` ${step.selector}` : '')
    process.stderr.write(`  [${i + 1}/${def.steps.length}] ${label}\n`)

    try {
      const result = await ACTIONS[step.action](page, step, ctx)
      if (step.action === 'screenshot' && typeof result === 'string') {
        screenshots.push(result)
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      process.stderr.write(`  step ${i + 1} failed: ${msg}\n`)
    }

    if (step.action !== 'wait') {
      await page.waitForTimeout(step.pauseAfter ?? 500)
    }
  }

  // Final screenshot
  const finalPath = path.join(outputDir, `final-${timestamp()}.png`)
  await page.screenshot({ path: finalPath })
  screenshots.push(finalPath)

  // Save video: close the context first (finalizes the video file),
  // then call saveAs on the video handle.
  const video = page.video()
  const baseName = typeof input === 'string'
    ? path.basename(input, path.extname(input))
    : 'recording'
  let videoPath: string | undefined

  await context.close()

  if (video) {
    videoPath = path.join(outputDir, `${baseName}-${timestamp()}.webm`)
    await video.saveAs(videoPath)
    await video.delete()
  }

  await browser.close()

  return {
    video: videoPath,
    screenshots,
  }
}
