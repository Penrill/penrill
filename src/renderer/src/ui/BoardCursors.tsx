import { useEffect } from 'react'
import { worldToScreen } from '@penrill/core/camera'
import { useSession } from '../../../board/editorContext'
import { syncCoordinator } from '../sync/coordinator'
import { usePeerCursors } from '../sync/presence'

const colors = ['#1559a6', '#a13957', '#09746a', '#7a44a3', '#985514', '#326d32']

function colorFor(name: string) {
  let hash = 0
  for (const letter of name) hash = (hash * 31 + letter.charCodeAt(0)) >>> 0
  return colors[hash % colors.length]
}

export function BoardCursors() {
  const camera = useSession(s => s.camera)
  const cursors = usePeerCursors(s => s.cursors)
  useEffect(() => {
    const canvas = document.querySelector<HTMLCanvasElement>('.board-overlay')
    return canvas ? syncCoordinator.attachCanvas(canvas) : undefined
  }, [])
  return <div className="peer-cursors" aria-hidden="true">{cursors.map(peer => {
    const { x, y } = worldToScreen(camera, peer.x, peer.y)
    return <div className="peer-cursor" key={peer.client} style={{ transform: `translate(${x}px, ${y}px)`, color: colorFor(peer.user) }}>
      <svg width="18" height="22" viewBox="0 0 18 22"><path d="M1 1 16 13 9 14 6 20Z" fill="currentColor" stroke="white" strokeWidth="1.5" strokeLinejoin="round" /></svg>
      <span>{peer.user}</span>
    </div>
  })}</div>
}
