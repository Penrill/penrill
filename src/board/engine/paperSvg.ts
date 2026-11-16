import { BACKGROUND_STYLE, MAJOR_COLOR, patternColor, ROW } from './background'
import { bgPattern, isChalk } from './surface'
import type { BackgroundKind, BBox } from '@inkboard/core/types'

/** Numbers in SVG output: at most two decimals. */
const r2 = (v: number): string => (Math.round(v * 100) / 100).toString()

/**
 * The paper pattern over `box` as plain vector shapes: one path of dots or lines per colour.
 * Not an SVG <pattern>: printing to PDF turns a pattern into a small blurry picture repeated over
 * the page, so dots smear into dashes when the PDF is zoomed in. Lines are 1 unit wide, on the same
 * world positions as on the board.
 */
export function patternSvg(bgKind: BackgroundKind, box: BBox): string {
  const bg = bgPattern(bgKind)
  if (bg === 'blank') return ''
  const color = patternColor(bgKind, bg)
  const major = isChalk(bgKind) ? MAJOR_COLOR.chalk : MAJOR_COLOR.paper
  const s = BACKGROUND_STYLE[bg].step
  /** Multiples of `step` (plus `offset`) inside [from, to]. */
  const steps = (from: number, to: number, step: number, offset = 0): number[] => {
    const out: number[] = []
    for (let v = Math.ceil((from - offset) / step) * step + offset; v <= to; v += step) out.push(v)
    return out
  }
  // A 1-unit line whose top / left edge is at `v`, as on the board.
  const hLines = (ys: number[], x0 = box.minX, x1 = box.maxX): string => ys.map((y) => `M${r2(x0)} ${r2(y + 0.5)}H${r2(x1)}`).join('')
  const vLines = (xs: number[]): string => xs.map((x) => `M${r2(x + 0.5)} ${r2(box.minY)}V${r2(box.maxY)}`).join('')
  const stroke = (d: string, c: string, extra = ''): string => (d ? `<path d="${d}" fill="none" stroke="${c}" stroke-width="1"${extra}/>` : '')
  const ys = (step: number, offset = 0): number[] => steps(box.minY, box.maxY, step, offset)
  const xs = (step: number, offset = 0): number[] => steps(box.minX, box.maxX, step, offset)

  if (bg === 'dots') {
    const r = 1.1
    const d: string[] = []
    for (const y of ys(s)) for (const x of xs(s)) d.push(`M${r2(x - r)} ${r2(y)}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0`)
    return `<path d="${d.join('')}" fill="${color}"/>`
  }
  if (bg === 'grid') return stroke(hLines(ys(s)) + vLines(xs(s)), color)
  if (bg === 'lines') return stroke(hLines(ys(s)), color)
  if (bg === 'math') {
    const fine = (v: number[]): number[] => v.filter((p) => Math.round(p / s) % 5 !== 0)
    return stroke(hLines(fine(ys(s))) + vLines(fine(xs(s))), color) + stroke(hLines(ys(s * 5)) + vLines(xs(s * 5)), major)
  }
  if (bg === 'hand') {
    // Top and base line of each row in the darker colour, the dashed middle line between them.
    const majors = [...ys(s), ...ys(s, ROW.letter * 2)]
    const x0 = Math.floor(box.minX / 8) * 8
    return stroke(hLines(majors), major) + stroke(hLines(ys(s, ROW.letter), x0), color, ' stroke-dasharray="4 4"')
  }
  // Copybook rows: two darker lines per row, and guide lines leaning at the copybook slant.
  const lean = Math.tan(((90 - ROW.slantDeg) * Math.PI) / 180)
  const w = ROW.slantStep
  // A guide line through (x, 0) reaches x - lean * y at height y (skewed like the board pattern).
  const guides = steps(box.minX + lean * box.minY, box.maxX + lean * box.maxY, w)
    .map((x) => `M${r2(x + 0.5 - lean * box.minY)} ${r2(box.minY)}L${r2(x + 0.5 - lean * box.maxY)} ${r2(box.maxY)}`)
    .join('')
  return stroke(guides, color) + stroke(hLines([...ys(s), ...ys(s, ROW.letter)]), major)
}
