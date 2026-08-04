import { describe, expect, it } from 'vitest'
import { EventDeliveryGuard, isDeviceOnline, reconnectDelay } from './reliability'

describe('connection reliability', () => {
  it('backs off reconnect attempts without waiting longer than 30 seconds', () => {
    expect([0, 1, 2, 3, 4, 9].map(reconnectDelay)).toEqual([1_000, 2_000, 5_000, 10_000, 30_000, 30_000])
  })

  it('retries an event after a failed delivery but rejects duplicates after completion', () => {
    const guard = new EventDeliveryGuard()
    expect(guard.begin('event-1')).toBe(true)
    expect(guard.begin('event-1')).toBe(false)
    guard.fail('event-1')
    expect(guard.begin('event-1')).toBe(true)
    guard.complete('event-1')
    expect(guard.begin('event-1')).toBe(false)
  })

  it('does not report stale or invalid heartbeats as online', () => {
    const now = Date.parse('2026-08-04T08:00:00Z')
    expect(isDeviceOnline('2026-08-04T07:59:30Z', now)).toBe(true)
    expect(isDeviceOnline('2026-08-04T07:58:00Z', now)).toBe(false)
    expect(isDeviceOnline('invalid', now)).toBe(false)
  })
})
