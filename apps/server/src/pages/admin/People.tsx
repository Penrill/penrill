import { Avatar } from '@penrill/ui/avatar'
import { Badge } from '@penrill/ui/badge'
import { Button } from '@penrill/ui/button'
import { Field, Label } from '@penrill/ui/fieldset'
import { Subheading } from '@penrill/ui/heading'
import { Select } from '@penrill/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@penrill/ui/table'
import { Text } from '@penrill/ui/text'
import { LinkIcon } from '@heroicons/react/16/solid'
import { useState, type FormEvent } from 'react'
import { api, type NewLink, type Person } from '../../api'
import { useDates, useT } from '../../i18n'
import { Actions, ConfirmButton, CopyField, ErrorText, LoadFailed, Loading, Notice, PageTitle, Qr, useAction, useLoad } from '../../parts'

/** A link just created (an invite or a password reset): shown once, with a QR code for phones. */
function FreshLink({ title, link }: { title: string; link: NewLink }) {
  const t = useT()
  return (
    <section className="mt-8 flex flex-wrap items-start gap-6 rounded-lg bg-zinc-950/2.5 p-4 ring-1 ring-zinc-950/5 dark:bg-white/5 dark:ring-white/10">
      <div className="min-w-0 flex-1 basis-64">
        <Text className="font-medium text-zinc-950! dark:text-white!">{title}</Text>
        <div className="mt-3">
          <CopyField value={link.url} label={title} />
        </div>
        <Text className="mt-3">{t('people.linkHint')}</Text>
      </div>
      <Qr svg={link.qr} label={title} />
    </section>
  )
}

function RoleCell({ person, onChange }: { person: Person; onChange: (role: 'Member' | 'Admin') => void }) {
  const t = useT()
  if (person.role === 'owner') return <Badge color="green">{t('role.owner')}</Badge>
  return (
    <Select
      aria-label={t('people.roleOf', { name: person.name })}
      value={person.role === 'admin' ? 'Admin' : 'Member'}
      onChange={(event) => onChange(event.target.value as 'Member' | 'Admin')}
      className="w-40"
    >
      <option value="Member">{t('role.member')}</option>
      <option value="Admin">{t('role.admin')}</option>
    </Select>
  )
}

export function PeoplePage() {
  const t = useT()
  const dates = useDates()
  const people = useLoad(api.admin.people)
  const action = useAction()
  const [fresh, setFresh] = useState<{ title: string; link: NewLink } | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const change = async (work: () => Promise<void>, message?: string): Promise<void> => {
    setNotice(null)
    if (await action.run(work)) {
      if (message) setNotice(message)
      people.reload()
    }
  }

  async function invite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    await change(async () => {
      const link = await api.admin.invite(form.get('role') as 'Member' | 'Admin', Number(form.get('uses')), Number(form.get('days')))
      setFresh({ title: t('people.inviteLink'), link })
    })
  }

  return (
    <>
      <PageTitle title={t('people.title')}>{t('people.intro')}</PageTitle>
      {fresh && <FreshLink {...fresh} />}
      {notice && <Notice className="mt-6">{notice}</Notice>}
      {action.error && (
        <div className="mt-6">
          <ErrorText error={action.error} />
        </div>
      )}

      <section className="mt-10">
        <Subheading>{t('people.invite')}</Subheading>
        <form onSubmit={invite} className="mt-4 grid gap-4 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end">
          <Field>
            <Label>{t('people.for')}</Label>
            <Select name="uses" defaultValue="1">
              <option value="1">{t('people.one')}</option>
              <option value="5">{t('people.five')}</option>
              <option value="30">{t('people.class')}</option>
              <option value="100">{t('people.hundred')}</option>
            </Select>
          </Field>
          <Field>
            <Label>{t('people.as')}</Label>
            <Select name="role" defaultValue="Member">
              <option value="Member">{t('role.member')}</option>
              <option value="Admin">{t('role.admin')}</option>
            </Select>
          </Field>
          <Field>
            <Label>{t('people.days')}</Label>
            <Select name="days" defaultValue="7">
              <option value="1">{t('people.day1')}</option>
              <option value="7">{t('people.day7')}</option>
              <option value="30">{t('people.day30')}</option>
            </Select>
          </Field>
          <Button type="submit" color="blue" disabled={action.busy}>
            <LinkIcon />
            {t('people.create')}
          </Button>
        </form>
      </section>

      {people.failed && !people.data ? (
        <div className="mt-12">
          <LoadFailed retry={people.reload} />
        </div>
      ) : !people.data ? (
        <div className="mt-12">
          <Loading />
        </div>
      ) : (
        <>
          {people.data.invites.length > 0 && (
            <section className="mt-12">
              <Subheading>{t('people.open')}</Subheading>
              <Table className="mt-4 [--gutter:--spacing(6)] lg:[--gutter:--spacing(10)]">
                <TableHead>
                  <TableRow>
                    <TableHeader>{t('people.as')}</TableHeader>
                    <TableHeader>{t('people.placesLeft')}</TableHeader>
                    <TableHeader>{t('people.until')}</TableHeader>
                    <TableHeader>{t('people.createdBy')}</TableHeader>
                    <TableHeader>
                      <span className="sr-only">{t('people.delete')}</span>
                    </TableHeader>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {people.data.invites.map((invite) => (
                    <TableRow key={invite.id}>
                      <TableCell>
                        <Badge color={invite.role === 'admin' ? 'blue' : 'zinc'}>{t(`role.${invite.role}`)}</Badge>
                      </TableCell>
                      <TableCell>{invite.usesLeft}</TableCell>
                      <TableCell className="text-zinc-500 dark:text-zinc-400">{invite.expires ? dates.dayTime(invite.expires) : t('people.noLimit')}</TableCell>
                      <TableCell className="text-zinc-500 dark:text-zinc-400">{invite.createdBy}</TableCell>
                      <TableCell>
                        <Actions>
                          <Button plain className="text-red-700! dark:text-red-400!" onClick={() => void change(() => api.admin.deleteInvite(invite.id), t('people.deleted'))}>
                            {t('people.delete')}
                          </Button>
                        </Actions>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </section>
          )}

          <section className="mt-12">
            <Subheading>{t('people.accounts')}</Subheading>
            <Table className="mt-4 [--gutter:--spacing(6)] lg:[--gutter:--spacing(10)]">
              <TableHead>
                <TableRow>
                  <TableHeader>{t('people.name')}</TableHeader>
                  <TableHeader>{t('people.role')}</TableHeader>
                  <TableHeader>
                    <span className="sr-only">{t('people.reset')}</span>
                  </TableHeader>
                </TableRow>
              </TableHead>
              <TableBody>
                {people.data.users.map((person) => (
                  <TableRow key={person.name}>
                    <TableCell>
                      <span className="flex items-center gap-3">
                        <Avatar initials={person.name.slice(0, 1)} className="size-8 bg-zinc-200 text-zinc-700 dark:bg-white/10 dark:text-white" />
                        <span className="font-medium">{person.name}</span>
                        {person.disabled && <Badge color="red">{t('people.disabled')}</Badge>}
                      </span>
                    </TableCell>
                    <TableCell>
                      <RoleCell
                        person={person}
                        onChange={(role) =>
                          void change(() => api.admin.setRole(person.name, role), t('people.isRole', { name: person.name, role: t(role === 'Admin' ? 'role.admin' : 'role.member').toLowerCase() }))
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <Actions>
                        <Button
                          plain
                          onClick={() =>
                            void change(async () => {
                              const link = await api.admin.resetLink(person.name)
                              setFresh({ title: t('people.resetLink', { name: person.name }), link })
                              window.scrollTo({ top: 0, behavior: 'smooth' })
                            })
                          }
                        >
                          {t('people.reset')}
                        </Button>
                        {person.role !== 'owner' &&
                          (person.disabled ? (
                            <Button plain onClick={() => void change(() => api.admin.setDisabled(person.name, false), t('people.wasEnabled', { name: person.name }))}>
                              {t('people.enable')}
                            </Button>
                          ) : (
                            <ConfirmButton
                              label={t('people.disable')}
                              question={t('people.confirmDisable', { name: person.name })}
                              onConfirm={() => change(() => api.admin.setDisabled(person.name, true), t('people.wasDisabled', { name: person.name }))}
                            />
                          ))}
                      </Actions>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </section>
        </>
      )}
    </>
  )
}
