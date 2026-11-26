import { readdir, stat, statfs } from 'node:fs/promises'
import { join, parse } from 'node:path'

/** Kept free on top of what the installer writes, so Windows and the app itself still have room. */
export const SPARE_BYTES = 200 * 1024 * 1024

export interface SpaceNeed {
  /** Root of the drive the app is installed on, like `C:\`. */
  installDrive: string
  /** Root of the drive with the temp folder, where the installer unpacks the app first. */
  tempDrive: string
  /** Size of the installed app now: the new version takes about as much. */
  installedBytes: number
  /** Size of the downloaded installer: its archive is copied to temp before unpacking. */
  installerBytes: number
}

export interface Shortfall {
  drive: string
  /** How much more has to be freed on that drive. */
  missingBytes: number
}

/**
 * Which drive lacks room for the update, if any. The installer removes the old version before it
 * unpacks the new one, so running out of space halfway leaves no app at all; this check runs first.
 * Space freed by removing the old version is not counted, to stay on the safe side.
 */
export function spaceShortfall(need: SpaceNeed, freeBytes: (drive: string) => number): Shortfall | null {
  const want = new Map<string, number>()
  const add = (drive: string, bytes: number): void => {
    const key = drive.toUpperCase()
    want.set(key, (want.get(key) ?? 0) + bytes)
  }
  add(need.installDrive, need.installedBytes)
  add(need.tempDrive, need.installerBytes)
  let worst: Shortfall | null = null
  for (const [drive, bytes] of want) {
    const missing = bytes + SPARE_BYTES - freeBytes(drive)
    if (missing > 0 && (!worst || missing > worst.missingBytes)) worst = { drive, missingBytes: missing }
  }
  return worst
}

/** Total size of the files under a folder. */
export async function folderBytes(dir: string): Promise<number> {
  let total = 0
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) total += await folderBytes(path)
    else if (entry.isFile()) total += (await stat(path)).size
  }
  return total
}

/** Free space on the drive holding `path`. */
export async function freeBytesAt(path: string): Promise<number> {
  const s = await statfs(path)
  return s.bavail * s.bsize
}

export const driveOf = (path: string): string => parse(path).root
