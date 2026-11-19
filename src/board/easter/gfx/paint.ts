/** Small canvas painting helpers shared by the shows: colour, light, shapes and big titles. */

type Ctx = CanvasRenderingContext2D

/** `#rrggbb` with an alpha, as rgba(). */
export function rgba(hex: string, a: number): string {
  const n = parseInt(hex.slice(1, 7), 16)
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`
}

export const hsla = (h: number, s: number, l: number, a = 1): string => `hsla(${h}, ${s}%, ${l}%, ${a})`

/** Runs `paint` with additive blending (light adds up: glows, sparks, fire). */
export function additive(ctx: Ctx, paint: () => void): void {
  const prev = ctx.globalCompositeOperation
  ctx.globalCompositeOperation = 'lighter'
  paint()
  ctx.globalCompositeOperation = prev
}

/** Runs `paint` at an opacity, restoring it afterwards. */
export function faded(ctx: Ctx, alpha: number, paint: () => void): void {
  if (alpha <= 0) return
  const prev = ctx.globalAlpha
  ctx.globalAlpha = prev * Math.min(1, alpha)
  paint()
  ctx.globalAlpha = prev
}

/** A soft round light: `color` at the centre fading out to nothing at radius `r`. */
export function glow(ctx: Ctx, x: number, y: number, r: number, color: string, alpha = 1): void {
  if (r <= 0 || alpha <= 0) return
  const g = ctx.createRadialGradient(x, y, 0, x, y, r)
  g.addColorStop(0, rgba(color, alpha))
  g.addColorStop(0.35, rgba(color, alpha * 0.45))
  g.addColorStop(1, rgba(color, 0))
  ctx.fillStyle = g
  ctx.fillRect(x - r, y - r, r * 2, r * 2)
}

/** Darkens the screen, more at the edges; `alpha` is the strength in the corners. */
export function backdrop(ctx: Ctx, w: number, h: number, alpha: number, color = '#05060c', centre = 0.35): void {
  const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.hypot(w, h) / 2)
  g.addColorStop(0, rgba(color, alpha * centre))
  g.addColorStop(1, rgba(color, alpha))
  ctx.fillStyle = g
  ctx.fillRect(0, 0, w, h)
}

/** Light rays fanning out from (x, y), turning with `rot`. */
export function rays(ctx: Ctx, x: number, y: number, n: number, len: number, rot: number, color: string, alpha: number): void {
  const g = ctx.createRadialGradient(x, y, 0, x, y, len)
  g.addColorStop(0, rgba(color, alpha))
  g.addColorStop(1, rgba(color, 0))
  ctx.fillStyle = g
  ctx.beginPath()
  const half = Math.PI / n / 2
  for (let i = 0; i < n; i++) {
    const a = rot + (i / n) * Math.PI * 2
    ctx.moveTo(x, y)
    ctx.arc(x, y, len, a - half, a + half)
    ctx.closePath()
  }
  ctx.fill()
}

/** A star path with `n` points. */
export function starPath(ctx: Ctx, x: number, y: number, outer: number, inner: number, n = 5, rot = -Math.PI / 2): void {
  ctx.beginPath()
  for (let i = 0; i < n * 2; i++) {
    const r = i % 2 ? inner : outer
    const a = rot + (i * Math.PI) / n
    ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r)
  }
  ctx.closePath()
}

/** A four-pointed sparkle, the "twinkle" shape. */
export function sparkle(ctx: Ctx, x: number, y: number, r: number, color: string, alpha = 1): void {
  if (alpha <= 0 || r <= 0) return
  faded(ctx, alpha, () => {
    ctx.fillStyle = color
    starPath(ctx, x, y, r, r * 0.18, 4, 0)
    ctx.fill()
    glow(ctx, x, y, r * 0.9, color, 0.6)
  })
}

export interface TitleStyle {
  size: number
  weight?: number
  /** Fill colours from top to bottom of the letters. */
  fill: string[]
  /** Outline colour and width (relative to the size). */
  outline?: string
  outlineWidth?: number
  /** Coloured light behind the letters. */
  glow?: string
  /** A hard drop shadow under the letters, relative to the size. */
  depth?: string
  spacing?: number
  align?: CanvasTextAlign
  font?: string
}

/** A big display title: gradient letters, an outline, a glow and a solid drop shadow. */
export function title(ctx: Ctx, text: string, x: number, y: number, s: TitleStyle): void {
  const c = ctx as Ctx & { letterSpacing?: string }
  ctx.save()
  ctx.font = `${s.weight ?? 900} ${s.size}px ${s.font ?? 'system-ui, -apple-system, "Segoe UI", sans-serif'}`
  ctx.textAlign = s.align ?? 'center'
  ctx.textBaseline = 'middle'
  c.letterSpacing = `${(s.spacing ?? 0) * s.size}px`
  ctx.lineJoin = 'round'
  if (s.glow) {
    ctx.shadowColor = s.glow
    ctx.shadowBlur = s.size * 0.5
  }
  if (s.depth) {
    ctx.fillStyle = s.depth
    ctx.fillText(text, x, y + s.size * 0.07)
  }
  if (s.outline) {
    ctx.strokeStyle = s.outline
    ctx.lineWidth = s.size * (s.outlineWidth ?? 0.08)
    ctx.strokeText(text, x, y)
  }
  ctx.shadowBlur = 0
  const g = ctx.createLinearGradient(0, y - s.size / 2, 0, y + s.size / 2)
  s.fill.forEach((col, i) => g.addColorStop(s.fill.length === 1 ? 0 : i / (s.fill.length - 1), col))
  ctx.fillStyle = g
  ctx.fillText(text, x, y)
  ctx.restore()
}

/** Plain text in the shows' house style (captions, labels). */
export function caption(ctx: Ctx, text: string, x: number, y: number, size: number, color: string, alpha = 1, weight = 650): void {
  faded(ctx, alpha, () => {
    ctx.save()
    ctx.font = `${weight} ${size}px system-ui, -apple-system, "Segoe UI", sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.shadowColor = 'rgba(0, 0, 0, 0.55)'
    ctx.shadowBlur = size * 0.4
    ctx.fillStyle = color
    ctx.fillText(text, x, y)
    ctx.restore()
  })
}
