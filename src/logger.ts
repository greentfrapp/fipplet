export type LogLevel = 'quiet' | 'normal' | 'verbose'

let currentLevel: LogLevel = 'normal'

export function setLogLevel(level: LogLevel): void {
  currentLevel = level
}

export function getLogLevel(): LogLevel {
  return currentLevel
}

/** Always printed (errors). */
export function logError(msg: string): void {
  process.stderr.write(msg + '\n')
}

/** Printed at normal and verbose levels. */
export function log(msg: string): void {
  if (currentLevel !== 'quiet') {
    process.stderr.write(msg + '\n')
  }
}

/** Only printed at verbose level. */
export function logVerbose(msg: string): void {
  if (currentLevel === 'verbose') {
    process.stderr.write(msg + '\n')
  }
}
