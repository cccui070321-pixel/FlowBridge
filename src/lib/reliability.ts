export type CloudConnectionState = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'offline' | 'paused' | 'error'

export const RECONCILE_INTERVAL_MS = 30_000
export const HEARTBEAT_INTERVAL_MS = 20_000
const RECONNECT_DELAYS_MS = [1_000, 2_000, 5_000, 10_000, 30_000] as const

export function reconnectDelay(attempt: number) {
  const index = Math.max(0, Math.min(Math.floor(attempt), RECONNECT_DELAYS_MS.length - 1))
  return RECONNECT_DELAYS_MS[index]
}

export class EventDeliveryGuard {
  private readonly inFlight = new Set<string>()
  private readonly completed = new Set<string>()

  begin(id: string) {
    if (this.inFlight.has(id) || this.completed.has(id)) return false
    this.inFlight.add(id)
    return true
  }

  complete(id: string) {
    this.inFlight.delete(id)
    this.completed.add(id)
  }

  fail(id: string) {
    this.inFlight.delete(id)
  }
}

export function isDeviceOnline(lastSeenAt: string, now = Date.now(), thresholdMs = 60_000) {
  const lastSeen = new Date(lastSeenAt).getTime()
  return Number.isFinite(lastSeen) && now - lastSeen < thresholdMs
}
