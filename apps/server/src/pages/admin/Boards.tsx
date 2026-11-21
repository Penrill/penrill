import { Button } from '@penrill/ui/button'
import { Select } from '@penrill/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@penrill/ui/table'
import { Text, TextLink } from '@penrill/ui/text'
import { ChevronLeftIcon } from '@heroicons/react/16/solid'
import { useState, type FormEvent } from 'react'
import { api } from '../../api'
import { useDates, useT } from '../../i18n'
import { ErrorText, LoadFailed, Loading, Notice, PageTitle, useAction, useLoad } from '../../parts'

/** Boards from server versions before accounts have no owner; give each one to someone. */
export function BoardsPage() {
  const t = useT()
  const dates = useDates()
  const data = useLoad(() => Promise.all([api.admin.orphans(), api.admin.people()]))
  const give = useAction()
  const [notice, setNotice] = useState<string | null>(null)

  async function submit(event: FormEvent<HTMLFormElement>, board: string) {
    event.preventDefault()
    const user = String(new FormData(event.currentTarget).get('user'))
    if (await give.run(() => api.admin.giveBoard(board, user))) {
      setNotice(t('boards.given', { name: user }))
      data.reload()
    }
  }

  return (
    <>
      <Text>
        <TextLink href="/admin/server" className="inline-flex items-center gap-1 no-underline">
          <ChevronLeftIcon className="size-4" />
          {t('nav.server')}
        </TextLink>
      </Text>
      <div className="mt-4">
        <PageTitle title={t('boards.title')}>{t('boards.intro')}</PageTitle>
      </div>
      {notice && <Notice className="mt-6">{notice}</Notice>}
      <div className="mt-6">
        <ErrorText error={give.error} />
      </div>
      <div className="mt-2">
        {data.failed && !data.data ? (
          <LoadFailed retry={data.reload} />
        ) : !data.data ? (
          <Loading />
        ) : data.data[0].length === 0 ? (
          <Text>{t('boards.none')}</Text>
        ) : (
          <Table className="[--gutter:--spacing(6)] lg:[--gutter:--spacing(10)]">
            <TableHead>
              <TableRow>
                <TableHeader>{t('boards.board')}</TableHeader>
                <TableHeader>{t('boards.lastChange')}</TableHeader>
                <TableHeader>{t('boards.giveTo')}</TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {data.data[0].map((board) => (
                <TableRow key={board.id}>
                  <TableCell className="font-medium">{board.title}</TableCell>
                  <TableCell className="text-zinc-500 dark:text-zinc-400">{dates.day(board.updated)}</TableCell>
                  <TableCell>
                    <form onSubmit={(event) => void submit(event, board.id)} className="flex gap-2">
                      <Select name="user" aria-label={t('boards.ownerOf', { name: board.title })} className="w-40">
                        {data.data![1].users.map((user) => (
                          <option key={user.name} value={user.name}>
                            {user.name}
                          </option>
                        ))}
                      </Select>
                      <Button type="submit" outline disabled={give.busy}>
                        {t('boards.give')}
                      </Button>
                    </form>
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
