import type { LaserPoint } from '../engine/laser'
import type { Gesture, Sample, ToolContext } from './types'

/** How long a laser pointer trail stays visible (ms). */
export const LASER_FADE_MS = 900

/** The laser pointer's fading trail: board points with the time they were drawn. Never saved. */
export class LaserTrail {
  points: LaserPoint[] = []

  add(x: number, y: number, time: number, start = false): void {
    this.points.push({ x, y, time, start })
  }

  /** Drop points older than the fade time; true while something is still visible. */
  prune(now: number): boolean {
    let expired = 0
    while (expired < this.points.length && now - this.points[expired].time >= LASER_FADE_MS) expired++
    if (expired) this.points.splice(0, expired)
    return this.points.length > 0
  }
}

/** The laser tool: the pointer leaves a red trail that fades out and is never saved. */
export function beginLaser(ctx: ToolContext, trail: LaserTrail, start: Sample): Gesture {
  trail.add(start.x, start.y, start.time, true)
  return {
    move(samples) {
      for (const s of samples) trail.add(s.x, s.y, s.time)
      ctx.invalidate(false)
    },
    end() {}
  }
}
