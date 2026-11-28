import { RectangleStackIcon } from '@heroicons/react/20/solid'
import { useT } from '../../../../board/i18n'
import { ServerTemplates, TemplateSections, useNewBoardAction } from '../templates'
import { EmptyState, PageHeader } from './parts'

/** Templates: this person's own, those added from others, and what others shared on the server. */
export function TemplatesPage() {
  const t = useT()
  const main = useNewBoardAction()
  return (
    <>
      <PageHeader title={t('tpl.title')} />
      <TemplateSections main={main} empty={<EmptyState icon={<RectangleStackIcon />} title={t('tpl.none')} />} />
      <ServerTemplates />
    </>
  )
}
