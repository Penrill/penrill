import { platform } from '../platform'
import { account } from './accounts'
import { PenrillClient } from './api'

export const clientFor = (origin: string) => new PenrillClient(origin, platform.http, () => account(origin)?.token ?? null)
