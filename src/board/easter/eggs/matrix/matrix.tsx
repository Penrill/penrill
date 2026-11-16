import { slots, type Atom, type Row } from '@inkboard/math/formula'
import { particles, rnd } from '../../core/random'
import type { Egg, ShowProps, Vars } from '../../core/types'
import './matrix.css'

/**
 * The Matrix: filling in a matrix [ ] or determinant | | in a formula (or typing MATRIX) connects
 * the film with linear algebra. Green digital-and-math rain falls behind Morpheus's rimless glasses
 * (reflecting a red pill det(A) ≠ 0 and a blue pill det(A) = 0), while a 3×3 bracketed matrix
 * row-reduces to the identity matrix I and warps a coordinate grid underneath.
 */

const GLYPHS = '01λ∑det⊗∇ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜﾝ'

const CELLS_INIT = ['cos θ', '−sin θ', '0', 'sin θ', 'cos θ', '0', '0', '0', '1']
const CELLS_DIAG = ['1', '0', '0', '0', '1', '0', '0', '0', '1']

function hasFilledMatrix(rows: Row): boolean {
  const check = (a: Atom): boolean =>
    (a.t === 'grid' && (a.k === 'matrix' || a.k === 'det') && a.cells.length >= 4 && a.cells.every((c) => c.length > 0)) ||
    slots(a).some((r) => r.some(check))
  return rows.some(check)
}

function MatrixShow({ uk }: ShowProps) {
  return (
    <>
      <div className="mtx-bg" />

      {/* 3D vector-space coordinate plane warping under a linear transformation A·v */}
      <div className="mtx-plane-wrap">
        <div className="mtx-plane" />
      </div>

      {/* 44 columns of falling phosphor-green katakana & linear-algebra glyphs */}
      <div className="mtx-rain" aria-hidden>
        {particles(44, (i) => {
          const stream = Array.from({ length: 16 }, (_, k) => GLYPHS[Math.floor(rnd(i * 19 + k, 2) * GLYPHS.length)]).join('\n')
          return (
            <span
              key={i}
              className="mtx-col"
              style={{
                left: `${(i / 44) * 100}%`,
                '--d': `${-rnd(i, 3) * 2.5}s`,
                '--dur': `${1.8 + rnd(i, 4) * 1.8}s`,
                '--sz': `${13 + (i % 3) * 3}px`,
                '--op': 0.35 + rnd(i, 5) * 0.55
              } as Vars}
            >
              {stream}
            </span>
          )
        })}
      </div>

      <div className="mtx-stage">
        {/* Morpheus's rimless pince-nez glasses reflecting the Red Pill and Blue Pill */}
        <div className="mtx-glasses">
          <div className="mtx-lens left">
            <span className="mtx-glint" />
            <span className="mtx-pill red">
              <i>det ≠ 0</i>
            </span>
          </div>
          <span className="mtx-bridge" />
          <div className="mtx-lens right">
            <span className="mtx-glint" />
            <span className="mtx-pill blue">
              <i>det = 0</i>
            </span>
          </div>
        </div>

        {/* The mathematical 3×3 matrix [A | I] with Gaussian row reduction */}
        <div className="mtx-math-box">
          <div className="mtx-row-ops">
            <span>R₂ ← R₂ − k·R₁</span>
            <span>A · v = λ · v</span>
          </div>

          <div className="mtx-brackets">
            <span className="mtx-brk left" />
            <div className="mtx-grid">
              {CELLS_INIT.map((init, i) => (
                <div key={i} className={`mtx-cell ${i % 4 === 0 ? 'diag' : 'off'}`} style={{ '--d': `${0.2 + i * 0.08}s` } as Vars}>
                  <span className="mtx-val-init">{init}</span>
                  <span className="mtx-val-diag">{CELLS_DIAG[i]}</span>
                </div>
              ))}
            </div>
            <span className="mtx-brk right" />
          </div>

          <div className="mtx-eigen">det(A − λI) = 0</div>
        </div>

        <div className="mtx-terminal">
          {uk ? '> ПРОКИДАЙСЯ, НЕО… РАНГ МАТРИЦІ = 3' : '> WAKE UP, NEO… RANK(A) = 3'}
        </div>
        <div className="mtx-title">{uk ? 'МАТРИЦЯ' : 'THE MATRIX'}</div>
      </div>
    </>
  )
}

export const matrix: Egg = {
  id: 'matrix',
  icon: '🕶️',
  name: { en: 'The Matrix', uk: 'Матриця' },
  how: { en: 'Built a matrix in a formula or typed MATRIX', uk: 'Скласти матрицю у формулі або набрати MATRIX' },
  life: 8000,
  toastAt: 6800,
  Show: MatrixShow,
  noAnswer: hasFilledMatrix,
  words: ['MATRIX', 'REDPILL']
}
