import type { ReactNode } from 'react'
import './lens.css'

/**
 * The eyepiece shared by the microscope and the telescope: a round hole in the middle shows the board
 * as it is, and `children` (microbes, space) fill the screen around it.
 */
export function Lens({ far, icon, text, children }: { far?: boolean; icon: string; text: string; children: ReactNode }) {
  return (
    <div className={`lens ${far ? 'far' : 'near'}`}>
      <div className="lens-view">{children}</div>
      <div className="lens-rim" />
      <div className="lens-label">
        <span className="lens-icon">{icon}</span>
        <span>{text}</span>
      </div>
    </div>
  )
}
