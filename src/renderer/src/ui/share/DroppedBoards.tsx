import { Notice } from '../../../../board/ui/notices'
import { useT } from '../../../../board/i18n'
import { useDroppedBoards } from '../../sync/librarySync'

/** Says which boards someone else owned just left this device, and why. */
export function DroppedBoards() {
  const t = useT()
  const dropped = useDroppedBoards((s) => s.dropped)
  const close = (key: string) => () => useDroppedBoards.setState(({ dropped }) => ({ dropped: dropped.filter((d) => d.key !== key) }))
  return (
    <>
      {dropped.map((board) => (
        <Notice key={board.key} timeout={15000} onClose={close(board.key)}>
          {t(board.why === 'removed' ? 'share.droppedRemoved' : 'share.droppedDenied', { owner: board.owner, title: board.title })}
        </Notice>
      ))}
    </>
  )
}
