import { execFile } from 'child_process'

/**
 * Resolve the path to the ffmpeg binary.
 * Uses ffmpeg-static if available, falls back to system ffmpeg.
 */
export function getFFmpegPath(): string {
  try {
    // ffmpeg-static is externalized in tsup config, so require() resolves
    // at runtime from node_modules regardless of ESM/CJS output format.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const ffmpegPath = require('ffmpeg-static') as string | null
    if (ffmpegPath) return ffmpegPath
  } catch {
    // ffmpeg-static not installed
  }
  return 'ffmpeg'
}

export function runFFmpeg(
  args: string[],
  timeoutMs: number = 5 * 60 * 1000,
): Promise<void> {
  const ffmpeg = getFFmpegPath()
  return new Promise((resolve, reject) => {
    execFile(
      ffmpeg,
      args,
      { maxBuffer: 50 * 1024 * 1024, timeout: timeoutMs },
      (err, _stdout, stderr) => {
        if (err) {
          reject(new Error(`ffmpeg failed: ${err.message}\n${stderr}`))
        } else {
          resolve()
        }
      },
    )
  })
}
