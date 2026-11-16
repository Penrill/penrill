import type { Egg } from '../core/types'
import { bell } from './bell/bell'
import { blackhole } from './blackhole/blackhole'
import { dejavu } from './dejavu/dejavu'
import { flashbang } from './flashbang/flashbang'
import { floater } from './floater/floater'
import { golden } from './golden/golden'
import { jackpot } from './jackpot/jackpot'
import { matrix } from './matrix/matrix'
import { microscope } from './microscope/microscope'
import { newton } from './newton/newton'
import { nightowl } from './nightowl/nightowl'
import { pi } from './pi/pi'
import { sixseven } from './sixseven/sixseven'
import { storm } from './storm/storm'
import { telescope } from './telescope/telescope'

/**
 * Every easter egg in Inkboard. Each egg lives in its own folder under eggs/ with its component,
 * its medal metadata and its styles.
 */
export const EGGS: Egg[] = [
  jackpot,
  sixseven,
  pi,
  golden,
  blackhole,
  matrix,
  newton,
  floater,
  storm,
  microscope,
  telescope,
  bell,
  nightowl,
  flashbang,
  dejavu
]
