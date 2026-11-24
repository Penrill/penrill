import * as Headless from '@headlessui/react'
import { BeakerIcon, Cog6ToothIcon, CubeIcon, InformationCircleIcon, LinkIcon, LinkSlashIcon, PencilIcon, Squares2X2Icon, CircleStackIcon, XMarkIcon } from '@heroicons/react/20/solid'
import { Dialog, DialogTitle } from '@penrill/ui/dialog'
import { Select } from '@penrill/ui/select'
import { Switch } from '@penrill/ui/switch'
import { Subheading } from '@penrill/ui/heading'
import { Text } from '@penrill/ui/text'
import clsx from 'clsx'
import { useEffect, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { FEATURE_IDS } from '../../shared/features'
import { isChalk, withSurface } from '../engine/surface'
import { useEditor } from '../editorContext'
import { useFeatures } from '../features'
import { LANGUAGES, useT, type Lang, type MessageKey } from '../i18n'
import { type PenAction, type PenButtons, type ThemePref, type WheelMode, SNAP_DELAY, prefsStore, usePrefs } from '../store'
import { DEFAULT_TOOLBAR, isToolShown, withToolShown, type ToolbarToolId } from '../toolbarLayout'
import { isIPad } from '../tools/penInput'
import { ShapeSettingsGroup } from '../modules/shapeEditor/ShapeSettingsGroup'
import { Segmented } from './chrome'

/** One setting: its name (and a line about it) on the left, the control on the right. */
function Row({ label, description, children }: { label: ReactNode; description?: ReactNode; children: ReactNode }) {
  return (
    <Headless.Field className="grid grid-cols-[1fr_auto] items-center gap-x-6 gap-y-1 py-3">
      <Headless.Label className="text-sm/6 font-medium text-zinc-950 select-none dark:text-white">{label}</Headless.Label>
      <div className="col-start-2 row-span-2 row-start-1 flex justify-end">{children}</div>
      {description && <Headless.Description className="text-sm/5 text-zinc-500 dark:text-zinc-400">{description}</Headless.Description>}
    </Headless.Field>
  )
}

/** A titled block of rows, divided by hairlines. */
function Group({ title, description, children }: { title?: ReactNode; description?: ReactNode; children: ReactNode }) {
  return (
    <section className="not-first:mt-8">
      {title && <Subheading level={3}>{title}</Subheading>}
      {description && <Text className="mt-1">{description}</Text>}
      <div className={clsx('divide-y divide-zinc-950/5 dark:divide-white/5', title && 'mt-2')}>{children}</div>
    </section>
  )
}

const THEMES: ThemePref[] = ['system', 'light', 'dark']
type Surface = 'paper' | 'chalk'

/**
 * Interface theme and board surface, one above the other, with a chain button bracketing the pair:
 * linked, the board follows the theme (chalkboard when dark, paper when light, so with "System" it
 * switches together with the OS).
 */
function AppearanceSettings() {
  const t = useT()
  const theme = usePrefs((s) => s.theme)
  const background = usePrefs((s) => s.background)
  const linked = usePrefs((s) => s.linkBoardToTheme)
  const darkTheme = useFeatures((s) => s.flags.darkTheme)
  const surface: Surface = isChalk(background) ? 'chalk' : 'paper'
  const boardControl = (
    <Segmented
      label={t('settings.board')}
      value={surface}
      disabled={darkTheme && linked}
      onChange={(next) => prefsStore.getState().setBackground(withSurface(background, next === 'chalk'))}
      options={[
        { value: 'paper', label: t('surface.paper') },
        { value: 'chalk', label: t('surface.chalkboard') }
      ]}
    />
  )
  if (!darkTheme) {
    return (
      <Group title={t('settings.appearance')}>
        <Row label={t('settings.board')}>{boardControl}</Row>
      </Group>
    )
  }
  const line = linked ? 'border-blue-500/60 dark:border-blue-400/60' : 'border-zinc-950/15 dark:border-white/15'
  const label = 'text-sm/6 font-medium text-zinc-950 select-none dark:text-white'
  return (
    <Group title={t('settings.appearance')}>
      <div className="grid grid-cols-[1fr_auto_2rem] grid-rows-[3.5rem_3.5rem] items-center gap-x-2">
        <span className={label}>{t('settings.interface')}</span>
        <div className="flex justify-end">
          <Segmented
            label={t('settings.interface')}
            value={theme}
            onChange={(next) => prefsStore.getState().setTheme(next)}
            options={THEMES.map((th) => ({ value: th, label: t(`theme.${th}` as MessageKey) }))}
          />
        </div>
        {/* The bracket runs from the middle of one row to the middle of the other. */}
        <div className="col-start-3 row-span-2 row-start-1 flex h-full flex-col items-center py-7">
          <span className={clsx('w-[calc(50%+0.5px)] flex-1 self-start rounded-tr-md border-t border-r transition-colors', line)} />
          <button
            type="button"
            aria-pressed={linked}
            aria-label={t(linked ? 'settings.unlinkBoard' : 'settings.linkBoard')}
            title={t(linked ? 'settings.unlinkBoard' : 'settings.linkBoard')}
            onClick={() => prefsStore.setState({ linkBoardToTheme: !linked })}
            className={clsx(
              'my-1 flex size-8 shrink-0 items-center justify-center rounded-lg transition-colors',
              linked
                ? 'bg-blue-600/10 text-blue-600 hover:bg-blue-600/15 dark:bg-blue-400/15 dark:text-blue-400 dark:hover:bg-blue-400/20'
                : 'text-zinc-400 hover:bg-zinc-950/5 hover:text-zinc-700 dark:text-zinc-500 dark:hover:bg-white/10 dark:hover:text-zinc-200'
            )}
          >
            {linked ? <LinkIcon className="size-4" /> : <LinkSlashIcon className="size-4" />}
          </button>
          <span className={clsx('w-[calc(50%+0.5px)] flex-1 self-start rounded-br-md border-r border-b transition-colors', line)} />
        </div>
        <span className={label}>{t('settings.board')}</span>
        <div className="flex justify-end">{boardControl}</div>
      </div>
      {linked && <Text className="pb-1">{t('settings.linkedHint')}</Text>}
    </Group>
  )
}

function GeneralSettings({ fixedLanguage }: { fixedLanguage?: boolean }) {
  const t = useT()
  const lang = usePrefs((s) => s.lang)
  return (
    <>
      {!fixedLanguage && (
        <Group>
          <Row label={t('settings.language')}>
            <Select value={lang} onChange={(e) => prefsStore.getState().setLang(e.target.value as Lang)}>
              {(Object.keys(LANGUAGES) as Lang[]).map((l) => (
                <option key={l} value={l}>
                  {LANGUAGES[l]}
                </option>
              ))}
            </Select>
          </Row>
        </Group>
      )}
      <AppearanceSettings />
    </>
  )
}

const PEN_ACTIONS: PenAction[] = ['eraser', 'select', 'tool']
const PEN_BUTTONS: { key: keyof PenButtons; label: MessageKey }[] = [
  { key: 'lower', label: 'pen.lower' },
  { key: 'upper', label: 'pen.upper' },
  { key: 'eraserEnd', label: 'pen.eraserEnd' }
]

function PenTester() {
  const t = useT()
  const [detected, setDetected] = useState<string | null>(null)
  const describe = (e: ReactPointerEvent): string => {
    if (e.pointerType !== 'pen') return t('pen.notPen', { type: e.pointerType })
    if (e.button === 5 || (e.buttons & 32) !== 0) return t('pen.eraserEnd')
    if (e.button === 2 || (e.buttons & 2) !== 0) return t('pen.lower')
    if (e.button === 1 || (e.buttons & 4) !== 0) return t('pen.upper')
    return t('pen.tip')
  }
  return (
    <div
      className="mt-3 flex min-h-20 touch-none items-center justify-center rounded-xl border-2 border-dashed border-zinc-950/10 px-4 text-center text-sm/5 text-zinc-500 dark:border-white/10 dark:text-zinc-400"
      onPointerDown={(e) => {
        e.preventDefault()
        setDetected(describe(e))
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {detected ? t('pen.detected', { what: detected }) : t('pen.testHere')}
    </div>
  )
}

function PenAndMouseSettings() {
  const t = useT()
  // Hold-to-snap comes from the shape recognition module; without it there is nothing to set.
  const canSnap = !!useEditor().features.strokeRecognizer
  const fingerMode = usePrefs(s => s.iPadFingerMode)
  const pencilPressure = usePrefs((s) => s.pencilPressure)
  const tabletPressure = usePrefs((s) => s.tabletPressure)
  const penButtons = usePrefs((s) => s.penButtons)
  const setPenButton = usePrefs((s) => s.setPenButton)
  const wheel = usePrefs((s) => s.wheelMode)
  const snap = usePrefs((s) => s.shapeSnap)
  const delay = usePrefs((s) => s.shapeSnapDelay)
  const lang = usePrefs((s) => s.lang)
  const seconds = (delay / 1000).toFixed(1)
  return (
    <>
      {isIPad(navigator) && (
        <Group title="iPad">
          <Row label={t('pen.allowFinger')} description={t('pen.fingerSettingHint')}>
            <Switch aria-label={t('pen.allowFinger')} color="blue" checked={fingerMode !== 'pan'}
              onChange={draw => prefsStore.setState({ iPadFingerMode: draw ? 'draw' : 'pan' })} />
          </Row>
        </Group>
      )}
      <Group title={t('pen.pressure')}>
        <Row label={t('pen.pencilPressure')}>
          <Switch aria-label={t('pen.pencilPressure')} color="blue" checked={pencilPressure} onChange={(pencilPressure) => prefsStore.setState({ pencilPressure })} />
        </Row>
        <Row label={t('pen.tabletPressure')}>
          <Switch aria-label={t('pen.tabletPressure')} color="blue" checked={tabletPressure} onChange={(tabletPressure) => prefsStore.setState({ tabletPressure })} />
        </Row>
      </Group>
      <Group title={t('pen.title')}>
        {PEN_BUTTONS.map((b) => (
          <Row key={b.key} label={t(b.label)}>
            <Select value={penButtons[b.key]} onChange={(e) => setPenButton(b.key, e.target.value as PenAction)}>
              {PEN_ACTIONS.map((a) => (
                <option key={a} value={a}>
                  {t(`pen.action.${a}` as MessageKey)}
                </option>
              ))}
            </Select>
          </Row>
        ))}
      </Group>
      <PenTester />
      <Group title={t('settings.board')}>
        <Row label={t('settings.wheel')}>
          <Segmented
            label={t('settings.wheel')}
            value={wheel}
            onChange={(wheelMode: WheelMode) => prefsStore.setState({ wheelMode })}
            options={[
              { value: 'scroll', label: t('settings.wheelScroll') },
              { value: 'zoom', label: t('settings.wheelZoom') }
            ]}
          />
        </Row>
        {canSnap && (
          <Row label={t('settings.shapeSnap')}>
            <Switch color="blue" checked={snap} onChange={(shapeSnap) => prefsStore.setState({ shapeSnap })} />
          </Row>
        )}
        {canSnap && snap && (
          <Row label={t('settings.shapeSnapDelay')}>
            <span className="flex items-center gap-3 text-sm/6 text-zinc-600 tabular-nums dark:text-zinc-300">
              <input
                type="range"
                min={SNAP_DELAY.min}
                max={SNAP_DELAY.max}
                step={100}
                value={delay}
                className="w-36 accent-blue-600"
                onChange={(e) => prefsStore.setState({ shapeSnapDelay: Number(e.target.value) })}
              />
              <span className="w-10 text-right">{t('settings.seconds', { n: lang === 'uk' ? seconds.replace('.', ',') : seconds })}</span>
            </span>
          </Row>
        )}
      </Group>
    </>
  )
}

const TOOL_LABELS: Record<Exclude<ToolbarToolId, 'divider'>, MessageKey> = {
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

const INSERT_TOOLS: ToolbarToolId[] = ['text', 'formula', 'shapes', 'graph', 'instruments', 'image', 'templates']

function ToolbarSettings({ templates }: { templates: boolean }) {
  const t = useT()
  const layout = usePrefs((s) => s.toolbarLayout)
  const tools = DEFAULT_TOOLBAR.filter((id) => id !== 'templates' || templates)
  const row = (id: Exclude<ToolbarToolId, 'divider'>): ReactNode => (
    <Row key={id} label={t(TOOL_LABELS[id])}>
      <Switch
        color="blue"
        checked={isToolShown(layout, id)}
        onChange={(on) => prefsStore.setState({ toolbarLayout: withToolShown(layout, id, on) })}
      />
    </Row>
  )
  return (
    <>
      <Text>{t('settings.toolbarHint')}</Text>
      <Group title={t('rail.label')}>{tools.filter((id) => !INSERT_TOOLS.includes(id)).map(row)}</Group>
      <Group title={t('insert.label')}>{tools.filter((id) => INSERT_TOOLS.includes(id)).map(row)}</Group>
    </>
  )
}

function ExperimentalSettings() {
  const t = useT()
  const flags = useFeatures((s) => s.flags)
  const setFlag = useFeatures((s) => s.set)
  return (
    <Group>
      {FEATURE_IDS.map((id) => (
        <Row key={id} label={t(`feature.${id}` as MessageKey)}>
          <Switch color="blue" checked={flags[id]} onChange={(on) => void setFlag(id, on)} />
        </Row>
      ))}
    </Group>
  )
}

export interface SettingsDialogProps {
  open: boolean
  onClose: () => void
  /** When opened via a direct link (e.g. from Shapes), focus General and scroll to that group. */
  focusSection?: 'general' | 'shapes' | null
  /** App-provided sections (backup folder, version and updates); left out where they don't apply. */
  storageSettings?: ReactNode
  about?: ReactNode
  fixedLanguage?: boolean
  hideExperimental?: boolean
  /** The app has board templates (their switch in the toolbar section). */
  templates?: boolean
}

/** Settings of the app, not of one board: a dialog with its sections listed on the left. */
export function SettingsDialog({ open, onClose, focusSection, storageSettings, about, fixedLanguage, hideExperimental, templates = false }: SettingsDialogProps) {
  const editor = useEditor()
  const t = useT()
  const hasShapeEditor = !!editor.features.shapeEditor
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [vertical, setVertical] = useState(() => window.matchMedia('(min-width: 40rem)').matches)
  useEffect(() => {
    if (!open) return
    const layout = window.matchMedia('(min-width: 40rem)')
    const sync = () => setVertical(layout.matches)
    sync()
    layout.addEventListener('change', sync)
    return () => layout.removeEventListener('change', sync)
  }, [open])
  const sections: { id: string; label: MessageKey; icon: ReactNode; content: ReactNode }[] = [
    { id: 'general', label: 'settings.general', icon: <Cog6ToothIcon />, content: <GeneralSettings fixedLanguage={fixedLanguage} /> },
    { id: 'pen', label: 'settings.pen', icon: <PencilIcon />, content: <PenAndMouseSettings /> },
    ...(hasShapeEditor ? [{ id: 'shapes', label: 'shapes.title' as MessageKey, icon: <CubeIcon />, content: <ShapeSettingsGroup /> }] : []),
    { id: 'toolbar', label: 'settings.toolbar', icon: <Squares2X2Icon />, content: <ToolbarSettings templates={templates} /> }
  ]
  if (storageSettings) sections.push({ id: 'storage', label: 'settings.storage', icon: <CircleStackIcon />, content: storageSettings })
  if (!hideExperimental) sections.push({ id: 'experimental', label: 'settings.experimental', icon: <BeakerIcon />, content: <ExperimentalSettings /> })
  if (about) sections.push({ id: 'about', label: 'settings.about', icon: <InformationCircleIcon />, content: about })

  useEffect(() => {
    if (!open || !focusSection) return
    const idx = sections.findIndex((s) => s.id === focusSection)
    setSelectedIndex(idx >= 0 ? idx : 0)
  }, [open, focusSection, hasShapeEditor])

  return (
    <Dialog open={open} onClose={onClose} size="3xl" className="relative overflow-hidden p-0!">
      <Headless.TabGroup selectedIndex={selectedIndex} onChange={setSelectedIndex} vertical={vertical} className="flex max-sm:flex-col sm:h-[min(36rem,calc(100dvh-8rem))]">
        <div className="shrink-0 border-zinc-950/5 bg-zinc-50 p-3 max-sm:border-b sm:w-56 sm:border-r dark:border-white/5 dark:bg-white/2.5">
          <DialogTitle className="px-2 pt-2 pb-4">{t('settings.title')}</DialogTitle>
          <Headless.TabList className="flex gap-0.5 max-sm:overflow-x-auto sm:flex-col">
            {sections.map((s) => (
              <Headless.Tab
                key={s.id}
                className={clsx(
                  'flex shrink-0 items-center gap-3 rounded-lg px-2 py-2 text-left text-sm/5 font-medium whitespace-nowrap focus:outline-none',
                  'text-zinc-600 data-focus:outline-2 data-focus:outline-blue-500 data-hover:bg-zinc-950/5 data-hover:text-zinc-950',
                  'data-selected:bg-white data-selected:text-zinc-950 data-selected:shadow-sm data-selected:ring-1 data-selected:ring-zinc-950/5',
                  'dark:text-zinc-400 dark:data-hover:bg-white/5 dark:data-hover:text-white dark:data-selected:bg-white/10 dark:data-selected:text-white dark:data-selected:ring-white/5',
                  '*:data-[slot=icon]:size-5 *:data-[slot=icon]:shrink-0 *:data-[slot=icon]:fill-zinc-500 data-selected:*:data-[slot=icon]:fill-blue-600 dark:*:data-[slot=icon]:fill-zinc-400 dark:data-selected:*:data-[slot=icon]:fill-blue-400'
                )}
              >
                <span data-slot="icon" className="flex *:size-5">{s.icon}</span>
                {t(s.label)}
              </Headless.Tab>
            ))}
          </Headless.TabList>
        </div>
        <Headless.TabPanels className="min-w-0 flex-1 overflow-y-auto px-6 py-6 sm:px-8">
          {sections.map((s) => (
            <Headless.TabPanel key={s.id} className="focus:outline-none">
              <h3 className="mb-4 text-base/7 font-semibold text-zinc-950 sm:text-sm/6 dark:text-white">{t(s.label)}</h3>
              {s.content}
            </Headless.TabPanel>
          ))}
        </Headless.TabPanels>
      </Headless.TabGroup>
      <button
        type="button"
        aria-label={t('settings.done')}
        title={t('settings.done')}
        onClick={onClose}
        className="absolute top-3 right-3 flex size-8 items-center justify-center rounded-lg text-zinc-500 hover:bg-zinc-950/5 hover:text-zinc-950 dark:text-zinc-400 dark:hover:bg-white/10 dark:hover:text-white"
      >
        <XMarkIcon className="size-5" />
      </button>
    </Dialog>
  )
}
