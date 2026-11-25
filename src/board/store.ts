import type { IPadFingerMode } from './modules/iPadInput'
/**
 * User preferences: pens, colours, language, theme, toolbar layout and the like. They are shared by
 * every open board and survive restarts. What belongs to one open board (tool, selection, camera,
 * instruments) lives in that board's session store (session.ts).
 */
import { useStore } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { createStore } from 'zustand/vanilla'
import type { GraphPreset } from './engine/graph'
import type { ShapeKind } from '@penrill/core/shapes'
import { validateRows, type Cursor, type FormulaState, type Row } from '@penrill/math/formula'
import { cleanInstrumentPrefs, DEFAULT_INSTRUMENTS, type InstrumentPrefs } from './engine/instruments'
import { cleanToolbarLayout, insertDefaultDividers, isToolbarDivider, type ToolbarItemId } from './toolbarLayout'
import {
  cleanCustomPresets,
  cleanWorkspaceLayout,
  cloneWorkspaceLayout,
  DEFAULT_WORKSPACE_LAYOUT,
  migrateLegacyLayout,
  WORKSPACE_PRESETS,
  workspaceLayoutsEqual,
  type CustomWorkspacePreset,
  type WorkspaceLayout,
  type WorkspacePresetId
} from './workspaceLayout'
import type { FullRun } from './engine/text'
import { moveStorageKey } from '../shared/legacyStorage'
import type { BackgroundKind, LineCap, LineDash } from '@penrill/core/types'
import { detectLanguage, type Lang } from './i18n'

export type Tool = 'select' | 'brushSelect' | 'move' | 'pen' | 'highlighter' | 'eraser' | 'pan' | 'shape' | 'text' | 'laser'

/** 'stroke' removes whole strokes (like Whiteboard); 'point' cuts away only what it touches. */
export type EraserMode = 'stroke' | 'point'
/** What the plain mouse wheel does on the board. */
export type WheelMode = 'scroll' | 'zoom'
/** Unit used for shape length / dimension labels. */
export type ShapeLengthUnit = 'cm' | 'cells'

export interface ShapeDefaults {
  showLabels: boolean
  showAngles: boolean
  showLengths: boolean
  unit: ShapeLengthUnit
  /** Show the Blender-style X/Y/Z 3D rotation gizmo automatically when a 3D shape is selected. */
  gizmo3d: boolean
}

export const DEFAULT_SHAPE_DEFAULTS: ShapeDefaults = {
  showLabels: false,
  showAngles: false,
  showLengths: false,
  unit: 'cm',
  gizmo3d: true
}

function cleanShapeDefaults(v: unknown): ShapeDefaults {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>
  return {
    showLabels: o.showLabels === true,
    showAngles: o.showAngles === true,
    showLengths: o.showLengths === true,
    unit: o.unit === 'cells' ? 'cells' : 'cm',
    gizmo3d: o.gizmo3d !== false
  }
}

/** How long the pen is held still before a stroke snaps to a shape (ms). */
export const SNAP_DELAY = { min: 500, max: 2000, default: 1000 }

/** How many recent formulas the keypad remembers. */
export const FORMULA_HISTORY = 20

const cleanFormulaHistory = (v: unknown): Row[] =>
  Array.isArray(v) ? v.map((r) => validateRows(r)).filter((r): r is Row => !!r && r.length > 0).slice(0, FORMULA_HISTORY) : []

/** Text being typed on the board (a new one, or an existing item while it's edited). */
export interface TextEdit {
  id?: string
  x: number
  y: number
  /** Base size / colour: what new characters typed into an empty box get. */
  size: number
  color: string
  runs: FullRun[]
}

/**
 * A formula being built on the board (a new one, or an existing item while it's edited). Anchored
 * at the left end of its baseline, so it doesn't jump while fractions and roots make it taller.
 */
export interface FormulaEdit {
  id?: string
  x: number
  baseline: number
  size: number
  color: string
  rows: Row
  cur: Cursor
}

/** Where the math keypad types: the formula field that has the focus. */
export interface MathTarget {
  apply: (f: (st: FormulaState) => FormulaState) => void
  /** The current formula, for keys that depend on it. */
  get: () => FormulaState
  /** Enter on the keypad. */
  done: () => void
  /** The field is a function of x for a plot: the keypad leads with x. */
  plot: boolean
}

/**
 * What a pen button does while it's held (the Wacom driver decides which button the browser sees).
 * No "move" actions: a stuck button state must never leave the pen dragging things around.
 */
export type PenAction = 'eraser' | 'select' | 'tool'
const PEN_ACTIONS: readonly PenAction[] = ['eraser', 'select', 'tool']

export interface PenButtons {
  /** Lower side switch; arrives as the right button (button 2). */
  lower: PenAction
  /** Upper side switch; arrives as the middle button (button 1) when set to "Middle click" in the driver. */
  upper: PenAction
  /** Eraser end of the pen (button 5). */
  eraserEnd: PenAction
}

export const DEFAULT_PEN_BUTTONS: PenButtons = { lower: 'eraser', upper: 'tool', eraserEnd: 'eraser' }

/** Saved settings from older versions may hold actions that no longer exist ("pan", "move"). */
export function cleanPenButtons(v: unknown): PenButtons {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>
  const pick = (k: keyof PenButtons): PenAction =>
    PEN_ACTIONS.includes(o[k] as PenAction) ? (o[k] as PenAction) : DEFAULT_PEN_BUTTONS[k]
  return { lower: pick('lower'), upper: pick('upper'), eraserEnd: pick('eraserEnd') }
}

/** App interface theme (only used while the `darkTheme` feature flag is on). */
export type ThemePref = 'system' | 'light' | 'dark'
const THEME_PREFS: readonly ThemePref[] = ['system', 'light', 'dark']

export interface InkSlot {
  color: string
  /** Width in world units (= screen px at 100% zoom). */
  size: number
  /** Line pattern for new strokes. */
  dash?: LineDash
  /** Line ends (arrow, dot…) of everything drawn with this pen. */
  startCap?: LineCap
  endCap?: LineCap
}

/**
 * No white: on the chalkboard dark ink is already shown as chalk white, so a real white pen would
 * look the same there and vanish on paper (and in exports).
 */
export const PEN_COLORS = [
  '#1e1e1e', '#5c5f66', '#e03131', '#f76707', '#f59f00',
  '#2f9e44', '#0c8599', '#1971c2', '#6741d9', '#c2255c', '#8d5524'
]
export const HIGHLIGHTER_COLORS = ['#ffe066', '#8ce99a', '#74c0fc', '#f783ac', '#ffa94d', '#b197fc']
export const PEN_SIZES = [1.5, 3, 5, 8, 12]
export const HIGHLIGHTER_SIZES = [12, 18, 26, 36]

export interface Prefs {
  iPadFingerMode: IPadFingerMode
  pencilPressure: boolean
  tabletPressure: boolean
  penButtons: PenButtons
  setPenButton: (which: keyof PenButtons, action: PenAction) => void
  /** Colour and font size of new text. */
  textStyle: { color: string; size: number }
  /** Colour and font size of new formulas. */
  formulaStyle: { color: string; size: number }
  /** Formulas put on boards lately, newest first (the keypad's history). */
  formulaHistory: Row[]
  /** Chosen base / side / point count for pyramids, prisms, polygons and stars. */
  shapeBases: Partial<Record<ShapeKind, number>>
  /** Circles to include when drawing a triangle. */
  triangleCircles: { incircle?: boolean; circumcircle?: boolean }
  /** Default measurement display and unit for shapes (both off by default). */
  shapeDefaults: ShapeDefaults
  /** The user's own coordinate-plane/line presets. */
  graphPresets: GraphPreset[]
  pens: InkSlot[]
  highlighter: InkSlot
  /** Brush-select circle radius in screen px (mouse wheel changes it). */
  selectRadius: number
  /** Eraser radius in screen px. */
  eraserRadius: number
  eraserMode: EraserMode
  wheelMode: WheelMode
  /** Hold the pen still at the end of a stroke to snap it to a clean shape. */
  shapeSnap: boolean
  /** How long to hold (ms). */
  shapeSnapDelay: number
  /** Background of the open board, remembered as the one for new boards. */
  background: BackgroundKind
  lang: Lang
  theme: ThemePref
  /** The board surface follows the interface theme: chalkboard when it is dark, paper when light. */
  linkBoardToTheme: boolean
  /** Protractor angle snapping. */
  instruments: InstrumentPrefs
  /** Instrument tips the user closed ("protractor", "compass"); they don't show again. */
  hiddenTips: string[]
  /** Kept only for legacy compatibility; active tool placement lives in `workspaceLayout.docks`. */
  toolbarLayout: ToolbarItemId[] | null
  workspaceLayout: WorkspaceLayout
  customPresets: CustomWorkspacePreset[]
  setWorkspaceLayout: (patch: Partial<WorkspaceLayout>) => void
  replaceWorkspaceLayout: (layout: WorkspaceLayout) => void
  applyWorkspacePreset: (preset: WorkspacePresetId) => void
  resetWorkspaceLayout: () => void
  saveCustomPreset: (name: string, layout?: WorkspaceLayout) => CustomWorkspacePreset
  updateCustomPreset: (id: string, layout?: WorkspaceLayout) => void
  renameCustomPreset: (id: string, name: string) => void
  deleteCustomPreset: (id: string) => void
  updatePen: (index: number, patch: Partial<InkSlot>) => void
  updateHighlighter: (patch: Partial<InkSlot>) => void
  setBackground: (bg: BackgroundKind) => void
  setLang: (lang: Lang) => void
  setTheme: (theme: ThemePref) => void
}

export const prefsStore = createStore<Prefs>()(
  persist(
    (set) => ({
      shapeBases: {},
      triangleCircles: {},
      shapeDefaults: DEFAULT_SHAPE_DEFAULTS,
      selectRadius: 24,
      iPadFingerMode: null,
      pencilPressure: true,
      tabletPressure: true,
      penButtons: DEFAULT_PEN_BUTTONS,
      setPenButton: (which, action) => set((s) => ({ penButtons: { ...s.penButtons, [which]: action } })),
      textStyle: { color: '#1e1e1e', size: 24 },
      formulaStyle: { color: '#1e1e1e', size: 32 },
      formulaHistory: [],
      graphPresets: [],
      pens: [
        { color: '#1e1e1e', size: 3 },
        { color: '#e03131', size: 3 },
        { color: '#1971c2', size: 3 }
      ],
      highlighter: { color: '#ffe066', size: 18 },
      eraserRadius: 12,
      eraserMode: 'stroke',
      wheelMode: 'scroll',
      shapeSnap: true,
      shapeSnapDelay: SNAP_DELAY.default,
      background: 'dots',
      lang: detectLanguage(),
      theme: 'system',
      linkBoardToTheme: true,
      instruments: DEFAULT_INSTRUMENTS,
      hiddenTips: [],
      toolbarLayout: null,
      workspaceLayout: cloneWorkspaceLayout(DEFAULT_WORKSPACE_LAYOUT),
      customPresets: [],
      setWorkspaceLayout: (patch) =>
        set((s) => ({
          workspaceLayout: {
            ...s.workspaceLayout,
            ...patch,
            docks: patch.docks ? cloneWorkspaceLayout({ ...s.workspaceLayout, docks: patch.docks }).docks : s.workspaceLayout.docks
          }
        })),
      replaceWorkspaceLayout: (layout) => set({ workspaceLayout: cloneWorkspaceLayout(layout) }),
      applyWorkspacePreset: (preset) => set({ workspaceLayout: cloneWorkspaceLayout(WORKSPACE_PRESETS[preset]) }),
      resetWorkspaceLayout: () => set({ workspaceLayout: cloneWorkspaceLayout(DEFAULT_WORKSPACE_LAYOUT) }),
      saveCustomPreset: (name, layout) => {
        const trimmed = name.trim().slice(0, 60) || 'Preset'
        const preset: CustomWorkspacePreset = {
          id: typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `preset-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          name: trimmed,
          layout: cloneWorkspaceLayout(layout ?? prefsStore.getState().workspaceLayout),
          updatedAt: Date.now()
        }
        set((s) => ({ customPresets: [...s.customPresets, preset] }))
        return preset
      },
      updateCustomPreset: (id, layout) =>
        set((s) => ({
          customPresets: s.customPresets.map((p) =>
            p.id === id ? { ...p, layout: cloneWorkspaceLayout(layout ?? s.workspaceLayout), updatedAt: Date.now() } : p
          )
        })),
      renameCustomPreset: (id, name) => {
        const trimmed = name.trim().slice(0, 60)
        if (!trimmed) return
        set((s) => ({
          customPresets: s.customPresets.map((p) => (p.id === id ? { ...p, name: trimmed, updatedAt: Date.now() } : p))
        }))
      },
      deleteCustomPreset: (id) =>
        set((s) => ({ customPresets: s.customPresets.filter((p) => p.id !== id) })),
      updatePen: (index, patch) =>
        set((s) => ({ pens: s.pens.map((p, i) => (i === index ? { ...p, ...patch } : p)) })),
      updateHighlighter: (patch) => set((s) => ({ highlighter: { ...s.highlighter, ...patch } })),
      setBackground: (background) => set({ background }),
      setLang: (lang) => set({ lang }),
      setTheme: (theme) => set({ theme })
    }),
    {
      // Only user preferences survive restarts; the board itself is restored from the autosave file.
      name: 'penrill-settings',
      storage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
      version: 5,
      migrate: (persisted, version) => {
        let state = (persisted ?? {}) as Prefs
        if (version < 2 && state.shapeDefaults && typeof state.shapeDefaults === 'object') {
          state = { ...state, shapeDefaults: { ...state.shapeDefaults, gizmo3d: true } }
        }
        if (version < 3 && Array.isArray(state.toolbarLayout)) {
          const cleaned = cleanToolbarLayout(state.toolbarLayout)
          if (cleaned && !cleaned.some((id) => isToolbarDivider(id))) {
            state = { ...state, toolbarLayout: insertDefaultDividers(cleaned) }
          }
        }
        if (version < 4) {
          state = {
            ...state,
            workspaceLayout: migrateLegacyLayout(state.workspaceLayout, state.toolbarLayout),
            customPresets: cleanCustomPresets((state as { customPresets?: unknown }).customPresets)
          }
        }
        if (version < 5 && state.workspaceLayout) {
          // Users still on the untouched v0.13.12/v0.13.13 split default switch to the classic all-on-top default.
          const current = cleanWorkspaceLayout(state.workspaceLayout, state.toolbarLayout)
          const oldSplitPopover = WORKSPACE_PRESETS.split
          const oldSplitStrip = { ...WORKSPACE_PRESETS.split, optionsMode: 'strip' as const }
          if (workspaceLayoutsEqual(current, oldSplitPopover) || workspaceLayoutsEqual(current, oldSplitStrip)) {
            state = { ...state, workspaceLayout: cloneWorkspaceLayout(DEFAULT_WORKSPACE_LAYOUT) }
          }
        }
        return state
      },
      merge: (saved, current) => {
        const p = (saved ?? {}) as Partial<Prefs>
        return {
          ...current,
          ...p,
          iPadFingerMode: p.iPadFingerMode === 'draw' || p.iPadFingerMode === 'pan' ? p.iPadFingerMode : null,
          pencilPressure: p.pencilPressure !== false,
          tabletPressure: p.tabletPressure !== false,
          penButtons: cleanPenButtons(p.penButtons),
          // White was removed from the palette: pens saved with it go back to black.
          ...(Array.isArray(p.pens) ? { pens: p.pens.map((pen) => (pen?.color?.toLowerCase() === '#ffffff' ? { ...pen, color: '#1e1e1e' } : pen)) } : {}),
          ...(p.textStyle?.color?.toLowerCase() === '#ffffff' ? { textStyle: { ...p.textStyle, color: '#1e1e1e' } } : {}),
          theme: THEME_PREFS.includes(p.theme as ThemePref) ? (p.theme as ThemePref) : 'system',
          // On for new users; people who already had settings keep the board they picked by hand.
          linkBoardToTheme: typeof p.linkBoardToTheme === 'boolean' ? p.linkBoardToTheme : Object.keys(p).length === 0,
          eraserMode: p.eraserMode === 'point' ? 'point' : 'stroke',
          eraserRadius: typeof p.eraserRadius === 'number' && p.eraserRadius >= 4 && p.eraserRadius <= 120 ? p.eraserRadius : current.eraserRadius,
          wheelMode: p.wheelMode === 'zoom' ? 'zoom' : 'scroll',
          shapeSnap: typeof p.shapeSnap === 'boolean' ? p.shapeSnap : current.shapeSnap,
          // 700 ms was the first default (too eager): treat it as "never chosen" and use the current one.
          shapeSnapDelay:
            typeof p.shapeSnapDelay === 'number' && p.shapeSnapDelay !== 700 && p.shapeSnapDelay >= SNAP_DELAY.min && p.shapeSnapDelay <= SNAP_DELAY.max
              ? p.shapeSnapDelay
              : SNAP_DELAY.default,
          instruments: cleanInstrumentPrefs(p.instruments),
          shapeDefaults: cleanShapeDefaults(p.shapeDefaults),
          toolbarLayout: cleanToolbarLayout(p.toolbarLayout),
          workspaceLayout: cleanWorkspaceLayout(p.workspaceLayout, p.toolbarLayout),
          customPresets: cleanCustomPresets(p.customPresets),
          hiddenTips: Array.isArray(p.hiddenTips) ? p.hiddenTips.filter((x) => typeof x === 'string') : [],
          formulaHistory: cleanFormulaHistory(p.formulaHistory)
        }
      },
      partialize: (s) => ({
        pens: s.pens,
        highlighter: s.highlighter,
        eraserRadius: s.eraserRadius,
        eraserMode: s.eraserMode,
        wheelMode: s.wheelMode,
        shapeSnap: s.shapeSnap,
        shapeSnapDelay: s.shapeSnapDelay,
        background: s.background,
        lang: s.lang,
        theme: s.theme,
        linkBoardToTheme: s.linkBoardToTheme,
        graphPresets: s.graphPresets,
        shapeBases: s.shapeBases,
        triangleCircles: s.triangleCircles,
        shapeDefaults: s.shapeDefaults,
        selectRadius: s.selectRadius,
        iPadFingerMode: s.iPadFingerMode,
        pencilPressure: s.pencilPressure,
        tabletPressure: s.tabletPressure,
        penButtons: s.penButtons,
        textStyle: s.textStyle,
        formulaStyle: s.formulaStyle,
        formulaHistory: s.formulaHistory,
        hiddenTips: s.hiddenTips,
        instruments: s.instruments,
        toolbarLayout: s.toolbarLayout,
        workspaceLayout: s.workspaceLayout,
        customPresets: s.customPresets
      })
    }
  )
)

/** React binding for the preferences. */
export function usePrefs<T>(select: (s: Prefs) => T): T {
  return useStore(prefsStore, select)
}

export function enablePreferenceStorage(): void {
  moveStorageKey('inkboard-settings', 'penrill-settings')
  prefsStore.persist.setOptions({ storage: createJSONStorage(() => localStorage) })
  void prefsStore.persist.rehydrate()
}
