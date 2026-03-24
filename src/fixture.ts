import { test as base } from '@playwright/test'
import { recordPage } from './record-page.js'
import type { PageRecorder, RecordPageOptions } from './record-page.js'

export type FippletFixtures = {
  fippletPage: PageRecorder
  fippletOptions: RecordPageOptions & {
    viewport?: { width: number; height: number }
    deviceScaleFactor?: number
  }
}

/**
 * Raw fixtures object — compose into your own test.extend() alongside
 * other custom fixtures (auth, database, etc.):
 *
 *   import { test as base } from '@playwright/test'
 *   import { fippletFixtures, type FippletFixtures } from 'fipplet/playwright'
 *
 *   const test = base.extend<FippletFixtures>(fippletFixtures)
 */
export const fippletFixtures: Parameters<
  typeof base.extend<FippletFixtures>
>[0] = {
  fippletOptions: [{}, { option: true }],

  fippletPage: async ({ browser, fippletOptions }, use, testInfo) => {
    const viewport = fippletOptions.viewport ?? { width: 1280, height: 720 }
    const scale =
      fippletOptions.scale ?? fippletOptions.deviceScaleFactor ?? 1

    const context = await browser.newContext({
      viewport,
      deviceScaleFactor: scale,
      recordVideo: {
        dir: testInfo.outputDir,
        size: {
          width: viewport.width * scale,
          height: viewport.height * scale,
        },
      },
    })
    const page = await context.newPage()
    const recorder = await recordPage(page, {
      outputDir: testInfo.outputDir,
      scale,
      ...fippletOptions,
    })

    await use(recorder)

    // Finalize recording even on test failure
    try {
      const result = await recorder.stop()
      if (result.video) {
        await testInfo.attach('fipplet-video', {
          path: result.video,
          contentType: 'video/webm',
        })
      }
      for (const s of result.screenshots) {
        await testInfo.attach('fipplet-screenshot', {
          path: s,
          contentType: 'image/png',
        })
      }
    } catch {
      // Partial video on failure — swallow error
    }
  },
}

/** Pre-composed test for the simple case: `import { test } from 'fipplet/playwright'` */
export const test = base.extend<FippletFixtures>(fippletFixtures)

export { expect } from '@playwright/test'
export type { PageRecorder, RecordPageOptions } from './record-page.js'
