import { slots, type Atom, type Row } from '@inkboard/math/formula'
import { parseRows } from '../../../engine/formulaexpr'

/** Whether a formula with no answer divides by zero (or comes out as infinity). */

function has(rows: Row, test: (a: Atom) => boolean): boolean {
  return rows.some((a) => test(a) || slots(a).some((r) => has(r, test)))
}

export function dividesByZero(rows: Row): boolean {
  const last = rows[rows.length - 1]
  const endsWithEq = !!last && last.t === 'c' && last.s === '='
  if (has(rows, (a) => a.t === 'c' && a.s === '∞') && (endsWithEq || rows.length >= 2)) return true
  if (!endsWithEq || rows.length < 2) return false
  const body = rows.slice(0, -1)
  if (has(body, (a) => a.t === 'frac' && a.d.length === 1 && a.d[0].t === 'c' && a.d[0].s === '0')) return true
  // A plain sum with no letters that still has no answer: something divided by zero in it.
  const parsed = parseRows(body)
  return parsed.ok && !has(body, (a) => a.t === 'c' && /^[a-z]$/i.test(a.s))
}
