// A pen may report pressure before its button bit, or the tip bit before pressure.
type Contact = Pick<PointerEvent, 'buttons' | 'pressure'>

export function penInContact(e: Contact): boolean {
  return e.buttons !== 0 || e.pressure > 0
}

/** Only measured points from this contact belong in the permanent stroke. */
export function inkSamples(e: PointerEvent, downTime: number): PointerEvent[] {
  const batch = e.getCoalescedEvents?.()
  if (!batch?.length) return [e]
  if (e.pointerType !== 'pen') return batch
  const contact = batch.filter(p => p.timeStamp >= downTime && penInContact(p))
  return contact.length ? contact : [e]
}

type Pos = { x: number; y: number; t: number }

// Screen px, and px per ms: far beyond any real hand movement.
const JUMP_PX = 48
const JUMP_SPEED = 6

/** Some tablet drivers park the cursor (often in the screen centre) when the pen lifts and
 * report the next press there; the first real sample then lands far away a few ms later. */
export function penJumped(from: Pos, to: Pos): boolean {
  const d = Math.hypot(to.x - from.x, to.y - from.y)
  return d > JUMP_PX && d > Math.max(to.t - from.t, 1) * JUMP_SPEED
}

/** Index of the first sample after the last jump from the press position, or -1 when none jumped. */
export function afterStaleStart(down: Pos, samples: Pos[]): number {
  let prev = down
  let from = -1
  samples.forEach((s, i) => {
    if (penJumped(prev, s)) from = i
    prev = s
  })
  return from
}

/** A tilted tip lays down a wider mark. Store the resulting width in the existing pressure channel. */
function tabletPressure(e: Pick<PointerEvent, 'pressure' | 'altitudeAngle' | 'tiltX' | 'tiltY'>): number {
  const radians = Math.PI / 180
  const altitude = e.altitudeAngle
  const tilt = Number.isFinite(altitude) && altitude < Math.PI / 2
    ? Math.cos(altitude)
    : Math.sin(Math.atan(Math.hypot(Math.tan(e.tiltX * radians), Math.tan(e.tiltY * radians))))
  const pressure = Math.max(0.05, e.pressure)
  return pressure + (1 - pressure) * (tilt || 0) * 0.25
}

/** Pointer Events identify a pen, but do not expose its manufacturer. iPadOS
 * also serves desktop pages with a Mac platform identifier. */
export function isIPad(platform: Pick<Navigator, 'userAgent' | 'platform' | 'maxTouchPoints'>) {
  return /iPad/.test(platform.userAgent) ||
    (platform.platform === 'MacIntel' && platform.maxTouchPoints > 1)
}

export function stylusStrategy(platform: Pick<Navigator, 'userAgent' | 'platform' | 'maxTouchPoints'>) {
  return isIPad(platform) ? pencilStrategy : tabletStrategy
}

const pencilStrategy = {
  preference: 'pencilPressure' as const,
  pressure: (event: Pick<PointerEvent, 'pressure'>) => event.pressure
}

const tabletStrategy = {
  preference: 'tabletPressure' as const,
  pressure: tabletPressure
}
