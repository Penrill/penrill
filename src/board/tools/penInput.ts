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

/** A tilted tip lays down a wider mark. Store the resulting width in the existing pressure channel. */
export function penWidth(e: Pick<PointerEvent, 'pressure' | 'altitudeAngle' | 'tiltX' | 'tiltY'>): number {
  const radians = Math.PI / 180
  const altitude = e.altitudeAngle
  const tilt = Number.isFinite(altitude) && altitude < Math.PI / 2
    ? Math.cos(altitude)
    : Math.sin(Math.atan(Math.hypot(Math.tan(e.tiltX * radians), Math.tan(e.tiltY * radians))))
  const pressure = Math.max(0.05, e.pressure)
  return pressure + (1 - pressure) * (tilt || 0) * 0.25
}
