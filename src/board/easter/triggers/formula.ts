import type { Row } from '@inkboard/math/formula'
import { listen } from '../core/bus'
import type { Trigger } from '../core/egg'

/** Triggers from the formula editor. */

/** A formula's answer is shown and passes `test`. */
export const answer = (test: (value: number) => boolean): Trigger => ({
  arm: (_, fire) => listen('answer', (v) => void (test(v) && fire(v)))
})

/** The formula being edited has no numeric answer and passes `test`; fires once per such formula. */
export const formula = (test: (rows: Row) => boolean): Trigger => ({
  arm: (_, fire) => {
    let lit = false
    return listen('formula', (rows) => {
      const hit = !!rows && rows.length > 0 && test(rows)
      if (hit && !lit) fire(rows)
      lit = hit
    })
  }
})
