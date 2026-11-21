import type { Item } from '@penrill/core/types'
import type { Json, WireItem } from '@penrill/sync/protocol'
import { DEFAULT_CAMERA } from '../../../board/editor'
import { deserializeBoard, FORMAT, FORMAT_VERSION, serializeBoard, type BoardFile } from '../../../board/engine/serialize'

const SHELL = { background: 'dots', camera: DEFAULT_CAMERA } as const

export function toWire(item: Item): WireItem {
  const file = serializeBoard({ ...SHELL, items: [item] })
  const [first] = file.items
  const wire = first.type === 'image' ? (({ asset, ...rest }) => ({ ...rest, src: file.assets[asset] }))(first) : first
  return JSON.parse(JSON.stringify(wire)) as WireItem
}

export function fromWire(row: WireItem): Item | undefined {
  const image = row.type === 'image' && typeof row.src === 'string'
  const item: Record<string, Json> = image ? { ...row, asset: 'image' } : row
  if (image) delete item.src
  const file = {
    format: FORMAT, version: FORMAT_VERSION, ...SHELL,
    assets: image ? { image: row.src as string } : {},
    items: [item]
  } as unknown as BoardFile
  try {
    return deserializeBoard(file).items[0]
  } catch {
    return undefined
  }
}
