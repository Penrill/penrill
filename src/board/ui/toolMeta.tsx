import type { ReactNode } from 'react'
import { useShallow } from 'zustand/react/shallow'
import type { MessageKey } from '../i18n'
import type { ShortcutId } from '../shortcuts'
import { usePrefs } from '../store'
import type { ConcreteToolId } from '../toolbarLayout'
import {
  AxesIcon,
  BrushSelectIcon,
  EraserIcon,
  FormulaIcon,
  HandIcon,
  ImageIcon,
  LaserIcon,
  LassoIcon,
  RectSelectIcon,
  MoveIcon,
  PenIcon,
  RedoIcon,
  RulerIcon,
  ShapesIcon,
  StampIcon,
  TextIcon,
  UndoIcon
} from './icons'

export const TOOL_LABELS: Record<ConcreteToolId, MessageKey> = {
  rectSelect: 'select.rect',
  select: 'select.lasso',
  brushSelect: 'select.brush',
  move: 'select.move',
  pan: 'toolbar.pan',
  pen1: 'toolbar.pen1',
  pen2: 'toolbar.pen2',
  pen3: 'toolbar.pen3',
  highlighter: 'toolbar.highlighter',
  eraser: 'toolbar.eraser',
  laser: 'toolbar.laser',
  undo: 'toolbar.undo',
  redo: 'toolbar.redo',
  text: 'insert.text',
  formula: 'insert.formula',
  shapes: 'insert.shapes',
  graph: 'insert.graph',
  templates: 'tpl.title',
  image: 'insert.image',
  instruments: 'toolbar.instruments'
}

export const TOOL_SHORTCUTS: Partial<Record<ConcreteToolId, ShortcutId>> = {
  rectSelect: 'rectSelect',
  select: 'lasso',
  brushSelect: 'brushSelect',
  move: 'move',
  pen1: 'pen1',
  pen2: 'pen2',
  pen3: 'pen3',
  highlighter: 'highlighter',
  eraser: 'eraser',
  laser: 'laser',
  undo: 'undo',
  redo: 'redo'
}

export function ToolMiniIcon({ id }: { id: ConcreteToolId }) {
  const { pens, highlighter } = usePrefs(useShallow((s) => ({ pens: s.pens, highlighter: s.highlighter })))
  const icon = ((): ReactNode => {
    switch (id) {
      case 'rectSelect': return <RectSelectIcon />
      case 'select': return <LassoIcon />
      case 'brushSelect': return <BrushSelectIcon />
      case 'move': return <MoveIcon />
      case 'pan': return <HandIcon />
      case 'pen1': return <PenIcon color={pens[0].color} direction="down" />
      case 'pen2': return <PenIcon color={pens[1].color} direction="down" />
      case 'pen3': return <PenIcon color={pens[2].color} direction="down" />
      case 'highlighter': return <PenIcon color={highlighter.color} highlighter direction="down" />
      case 'eraser': return <EraserIcon direction="down" />
      case 'laser': return <LaserIcon />
      case 'undo': return <UndoIcon />
      case 'redo': return <RedoIcon />
      case 'text': return <TextIcon />
      case 'formula': return <FormulaIcon />
      case 'shapes': return <ShapesIcon />
      case 'graph': return <AxesIcon />
      case 'instruments': return <RulerIcon />
      case 'image': return <ImageIcon />
      case 'templates': return <StampIcon />
    }
  })()
  return (
    <span className="flex size-6 shrink-0 items-center justify-center text-zinc-700 dark:text-zinc-200 [&>svg]:max-h-5 [&>svg]:max-w-5">
      {icon}
    </span>
  )
}
