import type { Show } from '../../core/egg'
import { outBack, span } from '../../gfx/ease'
import { additive, glow } from '../../gfx/paint'
import { rng } from '../../gfx/rng'

/**
 * A matrix in a formula turns the screen into falling green code: columns of glyphs with white-hot
 * heads, fading tails and glyphs that keep changing. In the middle, "MATRIX" decodes itself out of
 * the noise between two big brackets.
 */
const GLYPHS = 'ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜﾝ0123456789∑∫√π∞≠±×÷'
const GLYPH_LIST = [...GLYPHS]
const WORD = 'MATRIX'

interface Column {
  head: number
  speed: number
  len: number
  chars: string[]
}

export const matrixShow: Show = {
  duration: 8,
  start(g) {
    const { ctx } = g
    const r = rng(1999)
    const cell = 18
    let cols: Column[] = []
    const fill = (): void => {
      const n = Math.ceil(g.w / cell)
      const rows = Math.ceil(g.h / cell) + 30
      cols = Array.from({ length: n }, () => ({
        head: r.range(-rows, 0),
        speed: r.range(12, 30),
        len: Math.floor(r.range(8, 28)),
        chars: Array.from({ length: rows }, () => r.pick(GLYPH_LIST))
      }))
    }
    fill()
    return (t, dt) => {
      const { w, h } = g
      if (cols.length !== Math.ceil(w / cell)) fill()
      ctx.fillStyle = `rgba(0, 4, 0, ${0.93 * span(t, 0, 0.6)})`
      ctx.fillRect(0, 0, w, h)
      ctx.font = `600 ${cell - 2}px "MS Gothic", "Hiragino Kaku Gothic Pro", Menlo, monospace`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'top'
      const rows = Math.ceil(h / cell)
      cols.forEach((c, i) => {
        c.head += c.speed * dt
        if (c.head - c.len > rows) {
          c.head = r.range(-10, 0)
          c.speed = r.range(12, 30)
        }
        if (r() < 0.04) c.chars[Math.floor(r() * c.chars.length)] = r.pick(GLYPH_LIST)
        const x = i * cell + cell / 2
        const top = Math.floor(c.head)
        for (let k = 0; k < c.len; k++) {
          const row = top - k
          if (row < 0 || row > rows) continue
          const fade = 1 - k / c.len
          ctx.fillStyle = k === 0 ? '#eaffea' : `rgba(40, 255, 110, ${fade * 0.85})`
          ctx.fillText(c.chars[row % c.chars.length], x, row * cell)
        }
        if (top >= 0 && top <= rows) additive(ctx, () => glow(ctx, x, top * cell + cell / 2, cell * 1.4, '#7dff9f', 0.5))
      })
      // The word decoding itself in the middle.
      const k = span(t, 1.4, 3.6)
      if (k <= 0) return
      const size = Math.min(w * 0.12, h * 0.16)
      const cx = w / 2
      const cy = h / 2
      ctx.fillStyle = `rgba(0, 6, 0, ${0.7 * Math.min(1, k * 3)})`
      ctx.fillRect(cx - size * 4.2, cy - size * 0.95, size * 8.4, size * 1.9)
      ctx.font = `700 ${size}px Menlo, "SF Mono", Consolas, monospace`
      ctx.textBaseline = 'middle'
      ctx.shadowColor = '#3dff7a'
      ctx.shadowBlur = size * 0.35
      const step = size * 0.68
      ;[...WORD].forEach((ch, i) => {
        const settled = k * WORD.length * 1.3 > i + 1
        ctx.fillStyle = settled ? '#d9ffe2' : 'rgba(60, 255, 120, 0.8)'
        ctx.fillText(settled ? ch : r.pick(GLYPH_LIST), cx + (i - (WORD.length - 1) / 2) * step, cy)
      })
      const b = outBack(span(t, 3.2, 3.8))
      ctx.strokeStyle = '#7dff9f'
      ctx.lineWidth = size * 0.07
      for (const side of [-1, 1]) {
        const x = cx + side * (size * 2.4 + size * 0.9 * b)
        ctx.beginPath()
        ctx.moveTo(x - side * size * 0.3, cy - size * 0.8)
        ctx.lineTo(x, cy - size * 0.8)
        ctx.lineTo(x, cy + size * 0.8)
        ctx.lineTo(x - side * size * 0.3, cy + size * 0.8)
        ctx.globalAlpha = b > 0 ? 1 : 0
        ctx.stroke()
        ctx.globalAlpha = 1
      }
      ctx.shadowBlur = 0
    }
  }
}
