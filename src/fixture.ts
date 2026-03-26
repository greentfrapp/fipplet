import { test as base } from '@playwright/test'
import type { Page } from 'playwright-core'
import { recordPage } from './record-page.js'
import type { PageRecorder, RecordPageOptions } from './record-page.js'

export type TestreelFixtures = {
  page: Page
  testreelPage: PageRecorder
  testreelOptions: RecordPageOptions & {
    viewport?: { width: number; height: number }
    deviceScaleFactor?: number
  }
}

/**
 * Raw fixtures object — compose into your own test.extend() alongside
 * other custom fixtures (auth, database, etc.):
 *
 *   import { test as base } from '@playwright/test'
 *   import { testreelFixtures, type TestreelFixtures } from 'testreel/playwright'
 *
 *   const test = base.extend<TestreelFixtures>(testreelFixtures)
 */
export const testreelFixtures: Parameters<
  typeof base.extend<TestreelFixtures>
>[0] = {
  testreelOptions: [{}, { option: true }],

  page: async ({ browser, testreelOptions }, use, testInfo) => {
    const projectUse = testInfo.project.use
    const viewport =
      testreelOptions.viewport ?? projectUse.viewport ?? { width: 1280, height: 720 }
    const scale =
      testreelOptions.deviceScaleFactor ?? projectUse.deviceScaleFactor ?? 1

    const context = await browser.newContext({
      ...projectUse.contextOptions,
      storageState: projectUse.storageState,
      locale: projectUse.locale,
      extraHTTPHeaders: projectUse.extraHTTPHeaders,
      geolocation: projectUse.geolocation,
      permissions: projectUse.permissions,
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
    await use(page)

    // Finalize video and attach to test report
    const video = page.video()
    await context.close()
    if (video) {
      await testInfo.attach('testreel-video', {
        path: await video.path(),
        contentType: 'video/webm',
      })
    }
  },

  testreelPage: async ({ browser, testreelOptions }, use, testInfo) => {
    const viewport = testreelOptions.viewport ?? { width: 1280, height: 720 }
    const scale =
      testreelOptions.scale ?? testreelOptions.deviceScaleFactor ?? 1

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
      ...testreelOptions,
    })

    await use(recorder)

    // Finalize recording even on test failure
    try {
      const result = await recorder.stop()
      if (result.video) {
        await testInfo.attach('testreel-video', {
          path: result.video,
          contentType: 'video/webm',
        })
      }
      for (const s of result.screenshots) {
        await testInfo.attach('testreel-screenshot', {
          path: s,
          contentType: 'image/png',
        })
      }
    } catch {
      // Partial video on failure — swallow error
    }
  },
}

/** Pre-composed test for the simple case: `import { test } from 'testreel/playwright'` */
export const test = base.extend<TestreelFixtures>(testreelFixtures)

export { expect } from '@playwright/test'
export type { PageRecorder, RecordPageOptions } from './record-page.js'
