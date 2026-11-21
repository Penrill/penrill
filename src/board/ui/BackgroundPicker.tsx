import { useState, type ReactNode } from 'react'
import { BACKGROUND_STYLE, CHALK_PATTERN_COLOR, MAJOR_COLOR } from '../engine/background'
import { bgPattern, CHALK_WHITE, CHALKBOARD_COLOR, isChalk, withPattern, withSurface } from '../engine/surface'
import type { PaperPattern } from '@penrill/core/types'
import { useT, type MessageKey } from '../i18n'
import { prefsStore, usePrefs } from '../store'
import { PanelTitle } from './chrome'

type Option = { kind: PaperPattern; label: MessageKey }

/** The everyday patterns, always shown. */
const MAIN_OPTIONS: Option[] = [
  { kind: 'blank', label: 'bg.blank' },
  { kind: 'dots', label: 'bg.dots' },
  { kind: 'grid', label: 'bg.grid' },
  { kind: 'lines', label: 'bg.lines' }
]

/** Busier school patterns, folded under "More" so they do not crowd the picker. */
const MORE_OPTIONS: Option[] = [
  { kind: 'math', label: 'bg.math' },
  { kind: 'hand', label: 'bg.hand' },
  { kind: 'slant', label: 'bg.slant' }
]

function Preview({ kind, chalk }: { kind: PaperPattern; chalk: boolean }) {
  const cells = [10, 22, 34, 46]
  const ink = (p: keyof typeof BACKGROUND_STYLE, paper: string): string => (chalk ? CHALK_PATTERN_COLOR[p] : paper)
  return (
    <svg width="56" height="56" viewBox="0 0 56 56" aria-hidden>
      <rect width="56" height="56" rx="6" fill={chalk ? CHALKBOARD_COLOR : '#fff'} />
      {kind === 'dots' && cells.map((y) => cells.map((x) => <circle key={`${x}-${y}`} cx={x} cy={y} r="1.3" fill={ink('dots', '#a9acb5')} />))}
      {kind === 'grid' &&
        cells.map((v) => (
          <g key={v} stroke={ink('grid', '#d5d8e0')}>
            <line x1={v} y1="0" x2={v} y2="56" />
            <line x1="0" y1={v} x2="56" y2={v} />
          </g>
        ))}
      {kind === 'lines' && cells.map((v) => <line key={v} x1="0" y1={v} x2="56" y2={v} stroke={ink('lines', '#cdd3dd')} />)}
      {kind === 'math' &&
        [4, 10, 16, 22, 28, 34, 40, 46, 52].map((v, i) => (
          <g key={v} stroke={i % 5 === 0 ? (chalk ? MAJOR_COLOR.chalk : '#aab2c0') : ink('math', '#dfe2e8')}>
            <line x1={v} y1="0" x2={v} y2="56" />
            <line x1="0" y1={v} x2="56" y2={v} />
          </g>
        ))}
      {kind === 'hand' &&
        [8, 32].map((y) => (
          <g key={y}>
            <line x1="0" y1={y} x2="56" y2={y} stroke={chalk ? MAJOR_COLOR.chalk : '#aab2c0'} />
            <line x1="0" y1={y + 8} x2="56" y2={y + 8} stroke={ink('hand', '#c3cad6')} strokeDasharray="2 2" />
            <line x1="0" y1={y + 16} x2="56" y2={y + 16} stroke={chalk ? MAJOR_COLOR.chalk : '#aab2c0'} />
          </g>
        ))}
      {kind === 'slant' && (
        <g>
          {[-16, -8, 0, 8, 16, 24, 32, 40, 48, 56].map((x) => (
            <line key={x} x1={x} y1="56" x2={x + 26} y2="0" stroke={ink('slant', '#d3d9e3')} />
          ))}
          {[12, 22, 36, 46].map((y) => (
            <line key={y} x1="0" y1={y} x2="56" y2={y} stroke={chalk ? MAJOR_COLOR.chalk : '#aab2c0'} />
          ))}
        </g>
      )}
    </svg>
  )
}

/** The board's surface (paper or chalkboard) and its pattern: the top-right "Background" flyout. */
export function PaperPanel() {
  const background = usePrefs((s) => s.background)
  const { setBackground } = prefsStore.getState()
  const chalk = isChalk(background)
  const pattern = bgPattern(background)
  const t = useT()
  const moreActive = MORE_OPTIONS.some((o) => o.kind === pattern)
  const [moreOpen, setMoreOpen] = useState(moreActive)
  const option = (o: Option): ReactNode => (
    <button
      key={o.kind}
      className={`bg-option ${pattern === o.kind ? 'active' : ''}`}
      aria-pressed={pattern === o.kind}
      onClick={() => setBackground(withPattern(background, o.kind))}
    >
      <Preview kind={o.kind} chalk={chalk} />
      <span>{t(o.label)}</span>
    </button>
  )
  return (
    <div className="paper-panel">
      <PanelTitle>{t('settings.background')}</PanelTitle>
      {/* Picking a surface by hand ends "board follows the interface theme" (Settings → General). */}
      <div className="surface-options" role="radiogroup" aria-label={t('settings.surface')}>
        {[false, true].map((c) => (
          <button
            key={String(c)}
            role="radio"
            aria-checked={chalk === c}
            title={t(c ? 'surface.chalkboard' : 'surface.paper')}
            className={`surface-option ${chalk === c ? 'active' : ''}`}
            onClick={() => {
              prefsStore.setState({ linkBoardToTheme: false })
              setBackground(withSurface(background, c))
            }}
          >
            <span className="surface-swatch" style={{ background: c ? CHALKBOARD_COLOR : '#fff' }}>
              {/* A short stroke in the ink colour that board shows: dark on paper, chalk white on green. */}
              <svg width="30" height="18" viewBox="0 0 30 18" aria-hidden>
                <path d="M4 12c4-7 7-7 9-2s5 5 8-1 4-4 5-2" fill="none" stroke={c ? CHALK_WHITE : '#222'} strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </span>
            <span>{t(c ? 'surface.chalkboard' : 'surface.paper')}</span>
          </button>
        ))}
      </div>
      <div className="bg-options">{MAIN_OPTIONS.map(option)}</div>
      <button
        className={`bg-more ${moreOpen ? 'open' : ''} ${moreActive ? 'has-active' : ''}`}
        aria-expanded={moreOpen}
        onClick={() => setMoreOpen((o) => !o)}
      >
        <span>{t('bg.more')}</span>
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
          <path d="M2 3.5 5 6.5 8 3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {moreOpen && <div className="bg-options">{MORE_OPTIONS.map(option)}</div>}
    </div>
  )
}
