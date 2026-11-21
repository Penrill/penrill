import { Badge } from '@penrill/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@penrill/ui/table'
import { Text } from '@penrill/ui/text'
import { RectangleStackIcon } from '@heroicons/react/24/outline'
import { UsersIcon } from '@heroicons/react/16/solid'
import { useState } from 'react'
import { api } from '../../api'
import { useDates, useT } from '../../i18n'
import { Actions, ConfirmButton, Empty, LoadFailed, Loading, Notice, PageTitle, useLoad } from '../../parts'

/** Templates people shared on this server. Admins can stop sharing any of them. */
export function TemplatesPage() {
  const t = useT()
  const dates = useDates()
  const templates = useLoad(api.admin.templates)
  const [notice, setNotice] = useState<string | null>(null)
  return (
    <>
      <PageTitle title={t('templates.title')}>{t('templates.intro')}</PageTitle>
      {notice && <Notice className="mt-6">{notice}</Notice>}
      <div className="mt-8">
        {templates.failed && !templates.data ? (
          <LoadFailed retry={templates.reload} />
        ) : !templates.data ? (
          <Loading />
        ) : templates.data.length === 0 ? (
          <Empty icon={<RectangleStackIcon />} title={t('templates.empty')}>
            <Text className="mx-auto mt-1 max-w-sm">{t('templates.emptyHint')}</Text>
          </Empty>
        ) : (
          <Table className="[--gutter:--spacing(6)] lg:[--gutter:--spacing(10)]">
            <TableHead>
              <TableRow>
                <TableHeader>{t('templates.template')}</TableHeader>
                <TableHeader>{t('templates.author')}</TableHeader>
                <TableHeader>{t('templates.sharedWith')}</TableHeader>
                <TableHeader>{t('templates.changed')}</TableHeader>
                <TableHeader>
                  <span className="sr-only">{t('templates.stop')}</span>
                </TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {templates.data.map((template) => (
                <TableRow key={template.id}>
                  <TableCell className="font-medium">{template.name}</TableCell>
                  <TableCell>{template.author}</TableCell>
                  <TableCell>
                    {template.folder ? (
                      <Badge>
                        <UsersIcon className="size-3" />
                        {template.folder}
                      </Badge>
                    ) : (
                      <Badge color="blue">{t('templates.everyone')}</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-zinc-500 dark:text-zinc-400">{dates.day(template.updated)}</TableCell>
                  <TableCell>
                    <Actions>
                      <ConfirmButton
                        label={t('templates.stop')}
                        question={t('templates.confirm', { name: template.name })}
                        onConfirm={async () => {
                          await api.admin.removeTemplate(template.id).catch(() => undefined)
                          setNotice(t('templates.stopped', { name: template.name }))
                          templates.reload()
                        }}
                      />
                    </Actions>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </>
  )
}
