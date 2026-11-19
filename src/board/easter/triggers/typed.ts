import type { Trigger } from '../core/egg'

/**
 * Words typed on a board outside any text field, cheat-code style. Letters are read by physical key
 * (`KeyboardEvent.code`), so a word works on any keyboard layout.
 *
 * The letters also reach the board's own shortcuts (P pen, R ruler, S set square...), so when a word
 * plays its egg, the tools and instruments are put back as they were before its first letter.
 */

function typing(t: EventTarget | null): boolean {
  return t instanceof HTMLElement && (t.isContentEditable || t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')
}

export const typed = (...words: string[]): Trigger => ({
  arm: ({ editor }, fire) => {
    const longest = Math.max(...words.map((w) => w.length))
    const snapshot = (): Record<string, unknown> => {
      const s = editor.session.getState()
      return { tool: s.tool, activePen: s.activePen, ruler: s.ruler, setSquare: s.setSquare, protractor: s.protractor, compass: s.compass }
    }
    // The last letters typed, each with the tools as they were just before it.
    let keys: Array<{ ch: string; before: Record<string, unknown> }> = []
    const onKey = (e: KeyboardEvent): void => {
      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey || typing(e.target)) return
      const m = /^Key([A-Z])$/.exec(e.code)
      if (!m) {
        keys = []
        return
      }
      keys = [...keys, { ch: m[1], before: snapshot() }].slice(-longest)
      const text = keys.map((k) => k.ch).join('')
      const word = words.find((w) => text.endsWith(w))
      if (!word) return
      const before = keys[keys.length - word.length].before
      keys = []
      // After the board has handled this last letter: put the tools back as they were.
      if (fire(word)) setTimeout(() => editor.session.setState(before), 0)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }
})
