import { Text } from '@penrill/ui/text'
import { useState } from 'react'
import { api } from '../../api'
import { useT } from '../../i18n'
import { LoadFailed, Loading, Notice, PageTitle, useLoad } from '../../parts'
import { DeviceTable } from '../DeviceTable'

export function DevicesPage() {
  const t = useT()
  const devices = useLoad(api.admin.devices)
  const [notice, setNotice] = useState<string | null>(null)
  return (
    <>
      <PageTitle title={t('nav.allDevices')}>{t('allDevices.intro')}</PageTitle>
      {notice && <Notice className="mt-6">{notice}</Notice>}
      <div className="mt-8">
        {devices.failed && !devices.data ? (
          <LoadFailed retry={devices.reload} />
        ) : !devices.data ? (
          <Loading />
        ) : devices.data.length === 0 ? (
          <Text>{t('allDevices.empty')}</Text>
        ) : (
          <DeviceTable
            showPerson
            devices={devices.data}
            onDisconnect={async (id) => {
              await api.admin.disconnect(id)
              setNotice(t('devices.disconnected'))
              devices.reload()
            }}
          />
        )}
      </div>
    </>
  )
}
