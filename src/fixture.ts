import { test as base } from '@playwright/test'
import { recordPage } from './record-page.js'
import type { PageRecorder, RecordPageOptions } from './record-page.js'

type FippletFixtures = {
  fippletPage: PageRecorder
  fippletOptions: RecordPageOptions & {
    viewport?: { width: number; height: number }
    deviceScaleFactor?: number
  }
}

export const test = base.extend<FippletFixtures>({
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
})

export { expect } from '@playwright/test'
export type { PageRecorder, RecordPageOptions } from './record-page.js'
