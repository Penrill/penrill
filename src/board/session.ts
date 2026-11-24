import { createStore, type StoreApi } from 'zustand/vanilla'
import type { ShapeKind } from '@penrill/core/shapes'
import type { Camera, GraphParams, Quat } from '@penrill/core/types'
import type { Compass } from './engine/compass'
import type { Protractor } from './engine/protractor'
import type { Straightedge } from './engine/straightedge'
import type { FormulaEdit, MathTarget, TextEdit, Tool } from './store'

/**
 * The state of one open board: the tool in hand, the selection, the camera, what is being typed and
 * which instruments lie on it. Every editor has its own (see createEditor), so several boards can be
 * open at once. User preferences shared by all boards are in store.ts.
 */
export interface Session {
  /**
   * Whether this board is the one on screen. The app turns it off while another screen covers the
   * board (the home screen); keys and docked panels only act on an active board.
   */
  active: boolean
  tool: Tool
  /** Shape drawn by the shape tool. */
  shape: ShapeKind
  activePen: number
  textEdit: TextEdit | null
  formulaEdit: FormulaEdit | null
  /** The focused formula field; the math keypad is shown while there is one. */
  mathTarget: MathTarget | null
  /** Coordinate settings dialog: insert a new graph or edit the selected one. */
  graphDialog: { mode: 'insert' | 'edit'; id?: string; params: GraphParams } | null
  /** Function panel docked beside the selected coordinate plane (`session` groups its edits into one undo step). */
  fnPanel: { id: string; session: number } | null
  /** Mirrors editor.camera so React chrome (zoom label, selection toolbar) can follow it. */
  camera: Camera
  zoom: number
  canUndo: boolean
  canRedo: boolean
  /** Bumped on every board change so chrome that reads items (selection bar) re-renders. */
  sceneVersion: number
  selectedIds: string[]
  shortcutsOpen: boolean
  /** On-board ruler, or null when hidden. */
  ruler: Straightedge | null
  /** On-board set square (45° or 30°/60°), or null when hidden. */
  setSquare: Straightedge | null
  /** On-board protractor, or null when hidden. */
  protractor: Protractor | null
  /** On-board compass, or null when hidden. */
  compass: Compass | null
  /** Settings card docked beside the protractor. */
  protractorPanel: boolean
  /** Contextual vertex or edge mini-popover for the selected shape. */
  shapePopover: { kind: 'vertex' | 'edge'; index: number; targetId?: string } | null
  /** Non-modal shape inspector docked beside the selected shape (stays open while interacting with the canvas). */
  shapePanel: boolean
  /** Remembered 3D orientation before switching to an orthographic side editing view. */
  prev3dView: { itemId: string; orbit?: [number, number]; rot3?: Quat } | null
  /** Per-board override for showing the 3D X/Y/Z rotation gizmo (`null` = follow `shapeDefaults.gizmo3d`). */
  gizmo3dOverride: boolean | null
  /** Transform axis frame for the 3D rotation gizmo ('local' rotates with solid; 'world' stays aligned to room). */
  gizmo3dSpace: 'local' | 'world'
  /** Open Settings dialog to a section, or null when closed. */
  settingsSection: 'general' | 'layout' | 'shapes' | 'toolbar' | null
  /** Live on-board workspace drag-and-drop customization mode. */
  customizingWorkspace: boolean
  setTool: (tool: Tool) => void
  selectPen: (index: number) => void
}

export type SessionStore = StoreApi<Session>

export function createSessionStore(): SessionStore {
  return createStore<Session>()((set) => ({
    active: true,
    tool: 'pen',
    shape: 'rectangle',
    activePen: 0,
    textEdit: null,
    formulaEdit: null,
    mathTarget: null,
    graphDialog: null,
    fnPanel: null,
    camera: { x: 0, y: 0, zoom: 1 },
    zoom: 1,
    canUndo: false,
    canRedo: false,
    sceneVersion: 0,
    selectedIds: [],
    shortcutsOpen: false,
    ruler: null,
    setSquare: null,
    protractor: null,
    compass: null,
    protractorPanel: false,
    shapePopover: null,
    shapePanel: false,
    prev3dView: null,
    gizmo3dOverride: null,
    gizmo3dSpace: 'local',
    settingsSection: null,
    customizingWorkspace: false,
    setTool: (tool) => set({ tool }),
    selectPen: (index) => set({ tool: 'pen', activePen: index })
  }))
}
