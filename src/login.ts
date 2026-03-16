import fs from 'fs'
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

  let browser
  let context
  let page

  if (cdpUrl) {
    console.log(`Connecting to browser at ${cdpUrl} …\n`)
    browser = await chromium.connectOverCDP(cdpUrl)
    context = browser.contexts()[0] ?? await browser.newContext({ viewport })
    page = context.pages()[0] ?? await context.newPage()
    await page.goto(url, { waitUntil: 'load', timeout: 30000 }).catch(() => {})

    console.log('Log in manually, then press Enter here to save the session.')
    await waitForEnter()
  } else {
    console.log('Opening browser — log in manually, then close the browser window.\n')
    browser = await chromium.launch({ headless: false, channel })
    context = await browser.newContext({ viewport })
    page = await context.newPage()
    await page.goto(url, { waitUntil: 'load', timeout: 30000 }).catch(() => {})

    await page.waitForEvent('close', { timeout: 0 })
  }

  const state = await context.storageState()
  fs.mkdirSync(path.dirname(outputPath), { recursive: true })
  fs.writeFileSync(outputPath, JSON.stringify(state, null, 2))

  if (!cdpUrl) {
    await context.close()
    await browser.close()
  } else {
    await browser.close()
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
