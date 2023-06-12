'use client'
import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useBoolean } from 'ahooks'
import { useContext } from 'use-context-selector'
import { useRouter } from 'next/navigation'
import DatasetDetailContext from '@/context/dataset-detail'
import type { FullDocumentDetail } from '@/models/datasets'
import { fetchTenantInfo } from '@/service/common'
import type { MetadataType } from '@/service/datasets'
import { fetchDocumentDetail } from '@/service/datasets'

import Loading from '@/app/components/base/loading'
import StepTwo from '@/app/components/datasets/create/step-two'
import AccountSetting from '@/app/components/header/account-setting'
import AppUnavailable from '@/app/components/base/app-unavailable'

type DocumentSettingsProps = {
  datasetId: string
  documentId: string
}

const DocumentSettings = ({ datasetId, documentId }: DocumentSettingsProps) => {
  const { t } = useTranslation()
  const router = useRouter()
  const [hasSetAPIKEY, setHasSetAPIKEY] = useState(true)
  const [isShowSetAPIKey, { setTrue: showSetAPIKey, setFalse: hideSetAPIkey }] = useBoolean()
  const [hasError, setHasError] = useState(false)
  const { indexingTechnique, dataset } = useContext(DatasetDetailContext)

  const saveHandler = () => router.push(`/datasets/${datasetId}/documents/${documentId}`)

  const cancelHandler = () => router.back()

  const checkAPIKey = async () => {
    const data = await fetchTenantInfo({ url: '/info' })
    const hasSetKey = data.providers.some(({ is_valid }) => is_valid)
    setHasSetAPIKEY(hasSetKey)
  }

  useEffect(() => {
    checkAPIKey()
  }, [])

  const [documentDetail, setDocumentDetail] = useState<FullDocumentDetail | null>(null)
  useEffect(() => {
    (async () => {
      try {
        const detail = await fetchDocumentDetail({
          datasetId,
          documentId,
          params: { metadata: 'without' as MetadataType },
        })
        setDocumentDetail(detail)
      }
      catch (e) {
        setHasError(true)
      }
    })()
  }, [datasetId, documentId])

  if (hasError)
    return <AppUnavailable code={500} unknownReason={t('datasetCreation.error.unavailable') as string} />

  return (
    <div className='flex' style={{ height: 'calc(100vh - 56px)' }}>
      <div className="grow bg-white">
        {!documentDetail && <Loading type='app' />}
        {dataset && documentDetail && (
          <StepTwo
            hasSetAPIKEY={hasSetAPIKEY}
            onSetting={showSetAPIKey}
            datasetId={datasetId}
            indexingType={indexingTechnique || ''}
            isSetting
            documentDetail={documentDetail}
            file={documentDetail.data_source_info.upload_file}
            onSave={saveHandler}
            onCancel={cancelHandler}
          />
        )}
      </div>
      {isShowSetAPIKey && <AccountSetting activeTab="provider" onCancel={async () => {
        await checkAPIKey()
        hideSetAPIkey()
      }} />}
    </div>
  )
}

export default DocumentSettings
