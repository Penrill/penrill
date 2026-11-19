import { useEffect } from 'react'
import { useEditor } from '../../editorContext'
import { EGGS } from '../eggs'
import { play } from './play'

/** Arms every egg's triggers while collecting is on; unmounting disarms them all. */
export function Armed() {
  const editor = useEditor()
  useEffect(() => {
    const env = { editor }
    const disarm = EGGS.flatMap((egg) => egg.triggers.map((trigger) => trigger.arm(env, (data) => play(egg, data))))
    return () => disarm.forEach((off) => off())
  }, [editor])
  return null
}
