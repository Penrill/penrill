/** A null preference lets a new iPad draw by touch until its owner chooses a mode. */
export type IPadFingerMode = 'draw' | 'pan' | null

export function allowsFingerInk(ipad: boolean, mode: IPadFingerMode): boolean {
  return ipad && mode !== 'pan'
}

export function shouldOfferPencilChoice(ipad: boolean, mode: IPadFingerMode, pointerType: string): boolean {
  return ipad && mode === null && pointerType === 'pen'
}
