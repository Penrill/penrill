import type { Rng } from '../../gfx/rng'

/** Lightning: a jagged path made by splitting a line and nudging the middles, with side branches. */

export type Path = Array<[number, number]>

function jag(r: Rng, a: [number, number], b: [number, number], spread: number, depth: number): Path {
  if (depth === 0) return [a, b]
  const mid: [number, number] = [(a[0] + b[0]) / 2 + r.spread(spread), (a[1] + b[1]) / 2 + r.spread(spread * 0.3)]
  return [...jag(r, a, mid, spread / 2, depth - 1).slice(0, -1), ...jag(r, mid, b, spread / 2, depth - 1)]
}

export function bolt(r: Rng, x: number, top: number, bottom: number): Path[] {
  const trunk = jag(r, [x, top], [x + r.spread(120), bottom], 140, 6)
  const branches: Path[] = []
  for (let i = 0; i < 3; i++) {
    const from = trunk[Math.floor(r.range(0.2, 0.7) * trunk.length)]
    const len = r.range(80, 200)
    const dir = r.chance(0.5) ? 1 : -1
    branches.push(jag(r, from, [from[0] + dir * len, from[1] + len * 0.9], 50, 4))
  }
  return [trunk, ...branches]
}

/** Glow, body and white core, in additive light. */
export function paintBolt(ctx: CanvasRenderingContext2D, paths: Path[], alpha: number): void {
  const prev = ctx.globalCompositeOperation
  ctx.globalCompositeOperation = 'lighter'
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  paths.forEach((p, i) => {
    const thin = i === 0 ? 1 : 0.5
    for (const [width, colour] of [
      [16 * thin, `rgba(120, 160, 255, ${0.16 * alpha})`],
      [5 * thin, `rgba(190, 210, 255, ${0.55 * alpha})`],
      [1.8 * thin, `rgba(255, 255, 255, ${alpha})`]
    ] as const) {
      ctx.strokeStyle = colour
      ctx.lineWidth = width
      ctx.beginPath()
      for (const [x, y] of p) ctx.lineTo(x, y)
      ctx.stroke()
    }
  })
  ctx.globalCompositeOperation = prev
}
