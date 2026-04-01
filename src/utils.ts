import fs from 'fs'
import path from 'path'

const TESTREEL_OUTPUT_EXTENSIONS = new Set([
  '.webm',
  '.mp4',
  '.gif',
  '.png',
  '.json',
])

/** Remove previous testreel output files (videos, screenshots, manifests) from a directory. */
export function cleanOutputDir(dir: string): void {
  let entries: string[]
  try {
    entries = fs.readdirSync(dir)
  } catch {
    return
  }
  for (const entry of entries) {
    const ext = path.extname(entry).toLowerCase()
    if (TESTREEL_OUTPUT_EXTENSIONS.has(ext)) {
      try {
        fs.unlinkSync(path.join(dir, entry))
      } catch {
        // ignore — file may be in use
      }
    }
  }
}

export function timestamp(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const ms = String(d.getMilliseconds()).padStart(3, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}-${ms}`
}

export function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, '_')
}
