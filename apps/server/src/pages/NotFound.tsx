import { Button } from '@penrill/ui/button'
import { useT } from '../i18n'
import { PageTitle } from '../parts'

export function NotFoundPage() {
  const t = useT()
  return (
    <>
      <PageTitle title={t('notFound.title')}>{t('notFound.text')}</PageTitle>
      <Button outline href="/" className="mt-8">
        {t('nav.home')}
      </Button>
    </>
  )
}
