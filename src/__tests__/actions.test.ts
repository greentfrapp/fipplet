import { describe, expect, it } from 'vitest'
import { ACTIONS } from '../actions'

describe('ACTIONS registry', () => {
  const expectedActions = [
    'wait',
    'click',
    'type',
    'clear',
    'fill',
    'select',
    'scroll',
    'hover',
    'keyboard',
    'navigate',
    'screenshot',
    'zoom',
  ]

  it('has handlers for all expected action types', () => {
    for (const action of expectedActions) {
      expect(ACTIONS[action], `missing handler for '${action}'`).toBeDefined()
      expect(typeof ACTIONS[action]).toBe('function')
    }
  })

  it('has exactly the expected number of actions', () => {
    expect(Object.keys(ACTIONS)).toHaveLength(expectedActions.length)
  })

  it('does not contain unexpected action types', () => {
    for (const key of Object.keys(ACTIONS)) {
      expect(expectedActions, `unexpected action '${key}'`).toContain(key)
    }
  })
})
