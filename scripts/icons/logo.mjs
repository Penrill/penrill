/**
 * The Penrill logo: three ink strokes on a dotted board. The drawing lives here once; every colour
 * comes from a palette, so recolouring the logo means editing a palette, not the shapes.
 */

/** Hex values are Tailwind's oklch colours converted to sRGB. */
export const PALETTES = {
  // Tailwind "Mist", the neutral of the Oatmeal kit.
  mist: {
    tile: '#ffffff', edge: '#e3e7e8', dot: '#d0d6d8', ink: ['#090b0c', '#4b585b', '#9ca8ab'],
    page: '#f1f3f3', text: '#090b0c', muted: '#4b585b',
  },
  'mist-dark': {
    tile: '#161b1d', edge: '#22292b', dot: '#394447', ink: ['#f9fbfb', '#9ca8ab', '#67787c'],
    page: '#090b0c', text: '#f9fbfb', muted: '#9ca8ab',
  },
  blue: {
    tile: '#ffffff', edge: '#e1dfd8', dot: '#d3d7e2', ink: ['#3b5bdb', '#7289e5', '#a9b7ef'],
    page: '#f6f7fb', text: '#14161b', muted: '#575c69',
  },
}

// Canvas is 1024x1024. The tile follows Apple's icon grid: 824 square with a 100 margin.
const TILE = { x: 100, y: 100, size: 824, radius: 185 }

/** Catmull-Rom spline through `pts`, resampled every 4 units so the stroke width changes smoothly. */
function spline(pts) {
  const raw = []
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)]
    for (let k = 0; k < 60; k++) {
      const t = k / 60, t2 = t * t, t3 = t2 * t
      const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3)
      raw.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])])
    }
  }
  raw.push(pts[pts.length - 1])
  const len = [0]
  for (let i = 1; i < raw.length; i++) len.push(len[i - 1] + Math.hypot(raw[i][0] - raw[i - 1][0], raw[i][1] - raw[i - 1][1]))
  const out = []
  let j = 0
  for (let d = 0; d <= len[len.length - 1]; d += 4) {
    while (len[j + 1] < d) j++
    const t = (d - len[j]) / (len[j + 1] - len[j] || 1)
    out.push([raw[j][0] + (raw[j + 1][0] - raw[j][0]) * t, raw[j][1] + (raw[j + 1][1] - raw[j][1]) * t])
  }
  out.push(raw[raw.length - 1])
  return out
}

/** Outline of a pen stroke through `pts` whose width follows `width(u)`, u in [0, 1]. Round caps. */
function stroke(pts, width) {
  const s = spline(pts)
  const left = [], right = []
  for (let i = 0; i < s.length; i++) {
    const a = s[Math.max(0, i - 2)], b = s[Math.min(s.length - 1, i + 2)]
    const d = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1
    const dx = (b[0] - a[0]) / d, dy = (b[1] - a[1]) / d
    const w = width(i / (s.length - 1)) / 2
    left.push([s[i][0] - dy * w, s[i][1] + dx * w])
    right.push([s[i][0] + dy * w, s[i][1] - dx * w])
  }
  const f = (p) => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`
  const r0 = (width(0) / 2).toFixed(1), r1 = (width(1) / 2).toFixed(1)
  return (
    `M${f(left[0])}` + left.slice(1).map((p) => `L${f(p)}`).join('') +
    `A${r1} ${r1} 0 0 0 ${f(right[right.length - 1])}` +
    right.slice(0, -1).reverse().map((p) => `L${f(p)}`).join('') +
    `A${r0} ${r0} 0 0 0 ${f(left[0])}Z`
  )
}

const ease = (x) => 0.5 - 0.5 * Math.cos(Math.PI * Math.min(1, Math.max(0, x)))
/** Pen pressure: ramps from `start` to `max` over [0, a], holds, eases to `end` over [b, 1]. */
const pressure = (start, max, end, a, b) => (u) =>
  u < a ? start + (max - start) * ease(u / a) : u > b ? max + (end - max) * ease((u - b) / (1 - b)) : max

function wave(y) {
  const x0 = 262, x1 = 762, amp = 44
  const q = (x1 - x0) / 4
  return stroke(
    [[x0, y + amp * 0.4], [x0 + q * 0.95, y - amp], [(x0 + x1) / 2, y], [x1 - q * 0.95, y + amp], [x1, y - amp * 0.4]],
    pressure(26, 66, 30, 0.12, 0.74),
  )
}
const WAVES = [372, 512, 652].map(wave)

/**
 * The logo as an SVG string. `bleed` fills the whole square without the rounded tile, for
 * platforms that round the icon themselves (apple-touch-icon).
 */
export function logoSvg(p, { bleed = false } = {}) {
  let dots = ''
  for (let y = 212; y <= 812; y += 75) for (let x = 212; x <= 812; x += 75) dots += `<circle cx="${x}" cy="${y}" r="9"/>`
  const tile = bleed
    ? `<rect x="${TILE.x}" y="${TILE.y}" width="${TILE.size}" height="${TILE.size}" fill="${p.tile}"/>`
    : `<rect x="${TILE.x}" y="${TILE.y}" width="${TILE.size}" height="${TILE.size}" rx="${TILE.radius}" fill="${p.tile}" stroke="${p.edge}" stroke-width="6"/>`
  const view = bleed ? `${TILE.x} ${TILE.y} ${TILE.size} ${TILE.size}` : '0 0 1024 1024'
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${view}" width="1024" height="1024">` +
    tile +
    `<g fill="${p.dot}">${dots}</g>` +
    WAVES.map((d, i) => `<path d="${d}" fill="${p.ink[i]}"/>`).join('') +
    `</svg>\n`
  )
}
