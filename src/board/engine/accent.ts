/** Canvas accent for selection, handles and the drawing instruments: Tailwind's blue-500, the same
 *  blue as the interface's focus ring and menu highlight (`--focus` in styles.css). */
export const ACCENT = '#2b7fff'

/** Pale tint of the accent for the see-through instrument bodies (Tailwind's blue-50). */
export const ACCENT_TINT = '#eff6ff'

/** The accent with an alpha, as rgba(). */
export function accent(alpha: number): string {
  return `rgba(43, 127, 255, ${alpha})`
}
