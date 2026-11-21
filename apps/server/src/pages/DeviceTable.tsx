import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@penrill/ui/table'
import type { Device } from '../api'
import { useDates, useT } from '../i18n'
import { Actions, ConfirmButton } from '../parts'

/** Devices with a Disconnect button: a person's own (Your devices) or everyone's (admin), with `showPerson`. */
export function DeviceTable({ devices, showPerson = false, onDisconnect }: { devices: Device[]; showPerson?: boolean; onDisconnect: (id: string) => Promise<void> }) {
  const t = useT()
  const dates = useDates()
  return (
    <Table className="[--gutter:--spacing(6)] lg:[--gutter:--spacing(10)]">
      <TableHead>
        <TableRow>
          <TableHeader>{t('devices.device')}</TableHeader>
          {showPerson && <TableHeader>{t('devices.person')}</TableHeader>}
          <TableHeader>{t('devices.connected')}</TableHeader>
          <TableHeader>{t('devices.lastUsed')}</TableHeader>
          <TableHeader>
            <span className="sr-only">{t('devices.disconnect')}</span>
          </TableHeader>
        </TableRow>
      </TableHead>
      <TableBody>
        {devices.map((device) => (
          <TableRow key={device.id}>
            <TableCell className="font-medium">{device.name}</TableCell>
            {showPerson && <TableCell>{device.user}</TableCell>}
            <TableCell className="text-zinc-500 dark:text-zinc-400">{dates.day(device.created)}</TableCell>
            <TableCell className="text-zinc-500 dark:text-zinc-400">{device.lastUsed ? dates.day(device.lastUsed) : t('app.never')}</TableCell>
            <TableCell>
              <Actions>
                <ConfirmButton
                  label={t('devices.disconnect')}
                  question={t('devices.confirm', { device: device.name })}
                  onConfirm={() => onDisconnect(device.id)}
                />
              </Actions>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
