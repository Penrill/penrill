import { useEffect } from 'react'
import type { Editor } from '../../editor'

/**
 * Words typed on a board outside any text field (cheat-code style). Letters are read by physical key
 * (`KeyboardEvent.code`), so a word works on any keyboard layout.
 *
 * The letters also reach the board's own shortcuts (P pen, R ruler, S set square...), so once a word
 * is complete the tools and instruments are put back as they were before its first letter.
 */

function typing(t: EventTarget | null): boolean {
  return t instanceof HTMLElement && (t.isContentEditable || t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')
}

type Snapshot = Record<string, unknown>

/** Calls `onWord` with each word from `words` typed; `onWord` returns false to leave the tools as they are. */
export function useTypedWords(editor: Editor, words: string[], onWord: (word: string) => boolean): void {
  useEffect(() => {
    if (!words.length) return
    const longest = Math.max(...words.map((w) => w.length))
    // The last letters typed, each with the tools as they were just before it.
    let typed: Array<{ ch: string; before: Snapshot }> = []
    const snapshot = (): Snapshot => {
      const s = editor.session.getState()
      return { tool: s.tool, activePen: s.activePen, ruler: s.ruler, setSquare: s.setSquare, protractor: s.protractor, compass: s.compass }
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey || typing(e.target)) return
      const m = /^Key([A-Z])$/.exec(e.code)
      if (!m) {
        typed = []
        return
      }
      typed = [...typed, { ch: m[1], before: snapshot() }].slice(-longest)
      const text = typed.map((t) => t.ch).join('')
      const word = words.find((w) => text.endsWith(w))
      if (!word) return
      const before = typed[typed.length - word.length].before
      typed = []
      // After the board has handled this last letter: put the tools back as they were.
      if (onWord(word)) setTimeout(() => editor.session.setState(before), 0)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [editor, words, onWord])
}
