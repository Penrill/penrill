import { slots, type Atom, type Row } from '@inkboard/math/formula'
import type { Egg } from '../../core/egg'
import { formula } from '../../triggers/formula'
import { typed } from '../../triggers/typed'
import { matrixShow } from './show'

/** A matrix (or determinant) of at least 2×2 with every cell filled in. */
function hasMatrix(rows: Row): boolean {
  const check = (a: Atom): boolean =>
    (a.t === 'grid' && (a.k === 'matrix' || a.k === 'det') && a.cells.length >= 4 && a.cells.every((c) => c.length > 0)) || slots(a).some((r) => r.some(check))
  return rows.some(check)
}

export const matrix: Egg = {
  id: 'matrix',
  icon: '🕶️',
  name: { en: 'The Matrix', uk: 'Матриця' },
  how: { en: 'Built a matrix in a formula or typed MATRIX', uk: 'Скласти матрицю у формулі або набрати MATRIX' },
  triggers: [formula(hasMatrix), typed('MATRIX', 'REDPILL')],
  show: matrixShow
}
