export function timestamp(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const ms = String(d.getMilliseconds()).padStart(3, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}-${ms}`
}

export function sanitizeFilename(name: string): string {
  return name.replace(/\.\./g, '_').replace(/[/\\]/g, '_')
}
