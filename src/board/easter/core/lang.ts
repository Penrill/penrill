import { usePrefs } from '../../store'
import type { Text } from './types'

export function useUk(): boolean {
  return usePrefs((s) => s.lang) === 'uk'
}

export const pick = (text: Text, uk: boolean): string => (uk ? text.uk : text.en)
