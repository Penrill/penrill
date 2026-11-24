import type { ShapeSpec } from '@penrill/core/types'
import { useT } from '../../i18n'

export type TriangleCircleOptions = Pick<ShapeSpec, 'incircle' | 'circumcircle'>

/** The same construction options when inserting a triangle and editing an existing one. */
export function TriangleCircleControls({ value, onChange }: {
  value: TriangleCircleOptions
  onChange: (patch: TriangleCircleOptions) => void
}) {
  const t = useT()
  return (
    <div className="triangle-circles">
      {(['incircle', 'circumcircle'] as const).map((key) => (
        <label key={key}>
          <input type="checkbox" checked={!!value[key]} onChange={(e) => onChange({ [key]: e.target.checked })} />
          <span>{t(`shapes.${key}`)}</span>
        </label>
      ))}
    </div>
  )
}
