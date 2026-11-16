import { slots, type Atom, type Row } from '@inkboard/math/formula'
import { parseRows } from '../../../engine/formulaexpr'
import { particles, rnd } from '../../core/random'
import type { Egg, ShowProps, Vars } from '../../core/types'
import './blackhole.css'

/**
 * Event horizon: dividing by zero or writing infinity in a formula opens a Gargantua black hole at
 * the middle of the screen. The board itself spirals into the singularity while an accretion disk,
 * gravitational lensing halo, polar plasma jets and spaghettified math symbols swirl around it.
 */

const SYMBOLS = ['0', '∞', '÷', '=', 'π', 'x', '∫', '∑', '√', 'Δ', 'λ', '∂']

function hasAtom(rows: Row, pred: (a: Atom) => boolean): boolean {
  return rows.some((a) => pred(a) || slots(a).some((r) => hasAtom(r, pred)))
}

function isDivByZeroOrInf(rows: Row): boolean {
  const last = rows[rows.length - 1]
  const endsWithEq = !!last && last.t === 'c' && last.s === '='
  if (hasAtom(rows, (a) => a.t === 'c' && a.s === '∞') && (endsWithEq || rows.length >= 2)) return true
  if (!endsWithEq || rows.length < 2) return false
  const body = rows.slice(0, -1)
  if (hasAtom(body, (a) => a.t === 'frac' && a.d.length === 1 && a.d[0].t === 'c' && a.d[0].s === '0')) return true
  const parsed = parseRows(body)
  return parsed.ok && !hasAtom(body, (a) => a.t === 'c' && /^[a-z]$/i.test(a.s))
}

function BlackHole({ uk }: ShowProps) {
  return (
    <>
      <div className="bh-cosmos" />
      <div className="bh-lensing-waves">
        {particles(4, (i) => (
          <span key={i} style={{ '--d': `${i * 0.7}s` } as Vars} />
        ))}
      </div>

      {/* Infalling stars and spaghettified math symbols spiraling into the singularity */}
      <div className="bh-infall">
        {particles(64, (i) => {
          const a = (i / 64) * 360 + rnd(i, 1) * 25
          const r = 24 + rnd(i, 2) * 38
          const isSym = i % 4 === 0
          return (
            <span
              key={i}
              className={isSym ? 'bh-sym' : 'bh-streak'}
              style={{
                '--a': `${a}deg`,
                '--r': `${r}vmin`,
                '--d': `${rnd(i, 3) * 3.2}s`,
                '--dur': `${1.8 + rnd(i, 4) * 1.6}s`,
                '--c': i % 3 === 0 ? '#ffd27d' : i % 3 === 1 ? '#8be8ff' : '#ff8552'
              } as Vars}
            >
              {isSym ? SYMBOLS[i % SYMBOLS.length] : null}
            </span>
          )
        })}
      </div>

      {/* The Gargantua singularity: polar jets, gravitationally lensed upper/lower halo, shadow and front disk */}
      <div className="bh-core-wrap">
        <div className="bh-jet north" />
        <div className="bh-jet south" />
        <div className="bh-lensed-top" />
        <div className="bh-lensed-bottom" />
        <div className="bh-disk back">
          <span className="bh-disk-spin" />
        </div>
        <div className="bh-shadow">
          <span className="bh-photon-ring" />
        </div>
        <div className="bh-disk front">
          <span className="bh-disk-spin" />
        </div>
      </div>

      <div className="bh-flash" />

      <div className="bh-caption">
        <div className="bh-eq">lim (x → 0) 1 / x = ∞</div>
        <div className="bh-title">{uk ? 'ГОРИЗОНТ ПОДІЙ' : 'EVENT HORIZON'}</div>
      </div>
    </>
  )
}

export const blackhole: Egg = {
  id: 'blackhole',
  icon: '🕳️',
  name: { en: 'Event Horizon', uk: 'Горизонт подій' },
  how: { en: 'Divided by zero in a formula', uk: 'Поділити на нуль у формулі' },
  life: 8000,
  toastAt: 6800,
  appClass: 'ach-blackhole',
  Show: BlackHole,
  noAnswer: isDivByZeroOrInf,
  words: ['BLACKHOLE']
}
