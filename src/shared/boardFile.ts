/**
 * Board files outside the library. New files are saved as `.penrill`; `.inkboard` (the name before
 * 0.13) is still opened everywhere a board file is accepted.
 */
export const BOARD_EXT = 'penrill'
export const LEGACY_BOARD_EXT = 'inkboard'
export const BOARD_EXTS = [BOARD_EXT, LEGACY_BOARD_EXT]
export const BOARD_MIME = 'application/x-penrill'

const BOARD_FILE = /\.(penrill|inkboard)$/i

export const isBoardFileName = (name: string): boolean => BOARD_FILE.test(name)

/** "Lesson.penrill" → "Lesson". */
export const boardTitleOf = (fileName: string): string => fileName.replace(BOARD_FILE, '')
