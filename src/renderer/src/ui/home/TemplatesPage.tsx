import { EllipsisHorizontalIcon, PencilIcon, PlusIcon, TrashIcon } from '@heroicons/react/16/solid'
import { ArrowRightIcon, RectangleStackIcon } from '@heroicons/react/20/solid'
import { Button } from '@penrill/ui/button'
import { Dropdown, DropdownButton, DropdownDivider, DropdownItem, DropdownLabel, DropdownMenu } from '@penrill/ui/dropdown'
import { useState } from 'react'
import { relativeTime, useT } from '../../../../board/i18n'
import { usePrefs } from '../../../../board/store'
import type { TemplateEntry } from '../../../../shared/library'
import { useApp } from '../../appState'
import { boardLibrary } from '../../boardLibrary'
import { homePath } from '../../router'
import { ConfirmAlert, RenameDialog } from './dialogs'
import { Card, CardGrid, CardMeta, CardTitle, EmptyState, PageHeader, Picture, Section, useImageUrl } from './parts'

function TemplateCard({ template }: { template: TemplateEntry }) {
  const t = useT()
  const lang = usePrefs((s) => s.lang)
  const [dialog, setDialog] = useState<'rename' | 'delete' | null>(null)
  const thumb = useImageUrl(() => boardLibrary.templateThumbUrl(template.id), [template.id, template.updatedAt])
  const start = (): void => void boardLibrary.newBoardFromTemplate(template.id)
  const close = (): void => setDialog(null)
  return (
    <>
      <Card
        label={t('tpl.newBoard')}
        picture={<Picture url={thumb} />}
        onOpen={start}
        menu={
          <Dropdown>
            <DropdownButton plain aria-label={t('card.more')} title={t('card.more')}>
              <EllipsisHorizontalIcon />
            </DropdownButton>
            <DropdownMenu anchor="bottom end" className="min-w-48">
              <DropdownItem onClick={start}>
                <PlusIcon />
                <DropdownLabel>{t('tpl.newBoard')}</DropdownLabel>
              </DropdownItem>
              <DropdownItem onClick={() => setDialog('rename')}>
                <PencilIcon />
                <DropdownLabel>{t('card.rename')}</DropdownLabel>
              </DropdownItem>
              <DropdownDivider />
              <DropdownItem onClick={() => setDialog('delete')}>
                <TrashIcon />
                <DropdownLabel>{t('tpl.delete')}</DropdownLabel>
              </DropdownItem>
            </DropdownMenu>
          </Dropdown>
        }
      >
        <CardTitle>{template.name}</CardTitle>
        <CardMeta>{t('tpl.added', { when: relativeTime(lang, template.updatedAt ?? template.createdAt) })}</CardMeta>
      </Card>
      <RenameDialog
        open={dialog === 'rename'}
        title={t('card.rename')}
        label={t('tpl.namePlaceholder')}
        value={template.name}
        onClose={close}
        onSave={(name) => void boardLibrary.renameTemplate(template.id, name)}
      />
      <ConfirmAlert
        open={dialog === 'delete'}
        message={t('tpl.confirmDelete', { name: template.name })}
        confirm={t('tpl.delete')}
        onClose={close}
        onConfirm={() => void boardLibrary.deleteTemplate(template.id)}
      />
    </>
  )
}

/** Templates: each card starts a new board with that template on it. */
export function TemplatesPage({ shared }: { shared: boolean }) {
  const t = useT()
  const templates = useApp((s) => s.library.templates)
  const sorted = [...templates].sort((a, b) => (b.updatedAt ?? b.createdAt) - (a.updatedAt ?? a.createdAt))
  return (
    <>
      <PageHeader
        title={t('tpl.title')}
        description={t('tpl.hint')}
        actions={
          shared && (
            <Button outline href={homePath('shared')}>
              {t('tpl.shared')}
              <ArrowRightIcon />
            </Button>
          )
        }
      />
      {sorted.length > 0 ? (
        <Section>
          <CardGrid>
            {sorted.map((tp) => (
              <TemplateCard key={tp.id} template={tp} />
            ))}
          </CardGrid>
        </Section>
      ) : (
        <EmptyState icon={<RectangleStackIcon />} title={t('tpl.none')} />
      )}
    </>
  )
}
