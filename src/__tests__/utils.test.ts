import { describe, expect, it } from 'vitest'
import { sanitizeFilename, timestamp } from '../utils'

describe('timestamp', () => {
  it('returns a string matching YYYY-MM-DD_HH-MM-SS-mmm format', () => {
    const ts = timestamp()
    expect(ts).toMatch(/^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}-\d{3}$/)
  })

  it('returns different values on successive calls (or at least valid ones)', () => {
    const a = timestamp()
    const b = timestamp()
    // Both should be valid format
    expect(a).toMatch(/^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}-\d{3}$/)
    expect(b).toMatch(/^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}-\d{3}$/)
  })
})

describe('sanitizeFilename', () => {
  it('passes through clean filenames unchanged', () => {
    expect(sanitizeFilename('my-screenshot')).toBe('my-screenshot')
    expect(sanitizeFilename('step_01')).toBe('step_01')
  })

  it('replaces ".." with underscores', () => {
    expect(sanitizeFilename('foo..bar')).toBe('foo_bar')
    // Full traversal: .. replaced first, then slashes
    expect(sanitizeFilename('../../etc/passwd')).toBe('____etc_passwd')
  })

  it('replaces forward slashes with underscores', () => {
    expect(sanitizeFilename('path/to/file')).toBe('path_to_file')
  })

  it('replaces backslashes with underscores', () => {
    expect(sanitizeFilename('path\\to\\file')).toBe('path_to_file')
  })

  it('handles combined traversal attempts', () => {
    const result = sanitizeFilename('../../../secret')
    expect(result).not.toContain('..')
    expect(result).not.toContain('/')
  })
})
