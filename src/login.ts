import fs from 'fs'
import path from 'path'
import { chromium } from 'playwright-core'
import type { Viewport } from './types'

export interface LoginOptions {
  url: string
  saveState: string
  viewport?: Viewport
}

export async function login(options: LoginOptions): Promise<void> {
  const { url, saveState, viewport = { width: 1280, height: 720 } } = options
  const outputPath = path.resolve(saveState)

  console.log('Opening browser — log in manually, then close the browser window.\n')

  const browser = await chromium.launch({ headless: false })
  const context = await browser.newContext({ viewport })
  const page = await context.newPage()

  await page.goto(url, { waitUntil: 'load', timeout: 30000 }).catch(() => {
    // Continue even if load doesn't fully complete
  })

  // Wait for the user to close the page
  await page.waitForEvent('close', { timeout: 0 })

  // Context is still alive — export storage state
  const state = await context.storageState()
  fs.mkdirSync(path.dirname(outputPath), { recursive: true })
  fs.writeFileSync(outputPath, JSON.stringify(state, null, 2))

  await context.close()
  await browser.close()

  console.log(`\nSession saved to ${outputPath}`)
}
