import type { Egg } from '../core/egg'
import { bell } from './bell'
import { blackhole } from './blackhole'
import { dejavu } from './dejavu'
import { fireworks } from './fireworks'
import { flashbang } from './flashbang'
import { floater } from './floater'
import { giotto } from './giotto'
import { golden } from './golden'
import { jackpot } from './jackpot'
import { matrix } from './matrix'
import { microscope } from './microscope'
import { newton } from './newton'
import { owl } from './owl'
import { pi } from './pi'
import { rainbow } from './rainbow'
import { sixseven } from './sixseven'
import { storm } from './storm'
import { tabula } from './tabula'
import { telescope } from './telescope'

/**
 * Every easter egg, in the order of the replay list. Each lives in its own folder: index.ts says
 * what the medal is and what sets it off, show.ts paints it.
 */
export const EGGS: Egg[] = [
  // Formula answers.
  jackpot,
  sixseven,
  pi,
  golden,
  newton,
  blackhole,
  matrix,
  // Drawing on the board.
  giotto,
  rainbow,
  fireworks,
  tabula,
  // Looking at the board.
  microscope,
  telescope,
  // The clock and the settings.
  owl,
  bell,
  flashbang,
  // Typed on a board.
  storm,
  floater,
  // Off the record.
  dejavu
]
