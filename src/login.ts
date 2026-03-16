import fs from 'fs'
import os from 'os'
import path from 'path'
import { chromium } from 'playwright-core'
import type { Viewport } from './types'

export interface LoginOptions {
  url: string
  saveState: string
  viewport?: Viewport
  channel?: string
  cdpUrl?: string
}

export async function login(options: LoginOptions): Promise<void> {
  const { url, saveState, viewport = { width: 1280, height: 720 }, channel, cdpUrl } = options
  const outputPath = path.resolve(saveState)

  let context
  let page
  let tempProfileDir: string | undefined

  if (cdpUrl) {
    console.log(`Connecting to browser at ${cdpUrl} …\n`)
    const browser = await chromium.connectOverCDP(cdpUrl)
    context = browser.contexts()[0] ?? await browser.newContext({ viewport })
    page = context.pages()[0] ?? await context.newPage()
    await page.goto(url, { waitUntil: 'load', timeout: 30000 }).catch(() => {})

    console.log('Log in manually, then press Enter here to save the session.')
    await waitForEnter()
  } else {
    console.log('Opening browser — log in manually, then close the browser window.\n')

    // Use a persistent context with --disable-blink-features=AutomationControlled
    // to remove the navigator.webdriver flag that OAuth providers (e.g. Google) check.
    tempProfileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fipplet-login-'))
    context = await chromium.launchPersistentContext(tempProfileDir, {
      headless: false,
      channel,
      viewport,
      args: ['--disable-blink-features=AutomationControlled'],
    })
    page = context.pages()[0] ?? await context.newPage()
    await page.goto(url, { waitUntil: 'load', timeout: 30000 }).catch(() => {})

    await page.waitForEvent('close', { timeout: 0 })
  }

  const state = await context.storageState()
  fs.mkdirSync(path.dirname(outputPath), { recursive: true })
  fs.writeFileSync(outputPath, JSON.stringify(state, null, 2))

  await context.close()

  if (tempProfileDir) {
    fs.rmSync(tempProfileDir, { recursive: true, force: true })
  }

  console.log(`\nSession saved to ${outputPath}`)
}

function waitForEnter(): Promise<void> {
  return new Promise((resolve) => {
    process.stdin.setRawMode?.(false)
    process.stdin.resume()
    process.stdin.once('data', () => {
      process.stdin.pause()
      resolve()
    })
  })
}
