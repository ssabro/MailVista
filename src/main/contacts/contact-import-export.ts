/**
 * 연락처 가져오기/내보내기 기능
 */
import ExcelJS from 'exceljs'
import { logger, LogCategory } from '../logger'
import {
  getContacts,
  addContact,
  updateContact,
  getContactGroups,
  addContactGroup
} from '../storage/contacts-repository'
import type { ImportedContact, ImportValidationResult, ImportResult } from './types'

// 이메일 유효성 검사
function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(email)
}

/**
 * 파일에서 연락처 파싱 (Excel/CSV)
 */
export async function parseContactsFile(
  filePath: string
): Promise<{ success: boolean; contacts?: ImportedContact[]; error?: string }> {
  logger.info(LogCategory.IMPORT, 'Starting contact file parsing', { filePath })
  try {
    const workbook = new ExcelJS.Workbook()

    // 파일 확장자에 따라 읽기 방식 결정
    const ext = filePath.toLowerCase().split('.').pop()
    if (ext === 'csv') {
      await workbook.csv.readFile(filePath)
    } else {
      await workbook.xlsx.readFile(filePath)
    }

    const worksheet = workbook.worksheets[0]
    if (!worksheet) {
      return { success: false, error: '워크시트를 찾을 수 없습니다.' }
    }

    // 행 데이터 추출
    const rawData: string[][] = []
    worksheet.eachRow((row, rowNumber) => {
      const rowValues: string[] = []
      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        // 열 인덱스 맞추기 (1부터 시작)
        while (rowValues.length < colNumber - 1) {
          rowValues.push('')
        }
        rowValues.push(cell.value?.toString() || '')
      })
      rawData[rowNumber - 1] = rowValues
    })

    if (rawData.length < 2) {
      logger.warn(LogCategory.IMPORT, 'File has insufficient data rows', {
        rowCount: rawData.length
      })
      return {
        success: false,
        error: '데이터가 없습니다. 헤더와 최소 1개의 데이터 행이 필요합니다.'
      }
    }

    // 헤더 행 분석 (첫 번째 행)
    const headers = (rawData[0] || []).map((h) => String(h).toLowerCase().trim())

    // 필수 필드 확인 (이름과 이메일)
    const nameIndex = headers.findIndex((h) =>
      ['name', '이름', '名前', '姓名', 'fullname', 'full name', '성명'].includes(h)
    )
    const emailIndex = headers.findIndex((h) =>
      ['email', '이메일', 'メール', '邮箱', 'e-mail', 'mail', '메일주소', '이메일주소'].includes(h)
    )

    if (emailIndex === -1) {
      logger.error(LogCategory.IMPORT, 'Email column not found in file', { headers })
      return {
        success: false,
        error:
          '이메일 열을 찾을 수 없습니다. 헤더에 "이메일", "email", "E-mail" 등의 열이 필요합니다.'
      }
    }

    // 선택적 필드 인덱스
    const orgIndex = headers.findIndex((h) =>
      ['organization', '조직', '회사', '組織', '会社', '组织', '公司', 'company', 'org'].includes(h)
    )
    const phoneIndex = headers.findIndex((h) =>
      [
        'phone',
        '전화',
        '전화번호',
        '電話',
        '电话',
        'tel',
        'telephone',
        '휴대폰',
        'mobile'
      ].includes(h)
    )
    const memoIndex = headers.findIndex((h) =>
      ['memo', '메모', 'メモ', '备注', 'note', 'notes', '비고', 'comment'].includes(h)
    )
    const groupIndex = headers.findIndex((h) =>
      ['group', '그룹', 'グループ', '分组', '분류', 'category'].includes(h)
    )

    logger.debug(LogCategory.IMPORT, 'Column mapping detected', {
      nameIndex,
      emailIndex,
      orgIndex,
      phoneIndex,
      memoIndex,
      groupIndex
    })

    // 데이터 행 파싱 (헤더 제외)
    const contacts: ImportedContact[] = []
    for (let i = 1; i < rawData.length; i++) {
      const row = rawData[i]
      if (!row || row.length === 0) continue

      const email = String(row[emailIndex] || '').trim()
      if (!email) continue // 이메일이 없으면 스킵

      const contact: ImportedContact = {
        name: nameIndex !== -1 ? String(row[nameIndex] || '').trim() : '',
        email: email,
        organization: orgIndex !== -1 ? String(row[orgIndex] || '').trim() : undefined,
        phone: phoneIndex !== -1 ? String(row[phoneIndex] || '').trim() : undefined,
        memo: memoIndex !== -1 ? String(row[memoIndex] || '').trim() : undefined,
        groupName: groupIndex !== -1 ? String(row[groupIndex] || '').trim() : undefined
      }

      // 이름이 없으면 이메일의 로컬 파트를 이름으로 사용
      if (!contact.name) {
        contact.name = email.split('@')[0]
      }

      contacts.push(contact)
    }

    logger.info(LogCategory.IMPORT, 'Contact file parsed successfully', {
      totalContacts: contacts.length,
      filePath
    })
    return { success: true, contacts }
  } catch (error) {
    logger.error(LogCategory.IMPORT, 'Failed to parse contact file', {
      filePath,
      error: error instanceof Error ? error.message : String(error)
    })
    return {
      success: false,
      error: `파일을 읽을 수 없습니다: ${error instanceof Error ? error.message : '알 수 없는 오류'}`
    }
  }
}

/**
 * 가져온 연락처 유효성 검사 및 중복 확인
 */
export function validateImportedContacts(
  accountEmail: string,
  importedContacts: ImportedContact[]
): ImportValidationResult {
  logger.info(LogCategory.IMPORT, 'Starting contact validation', {
    accountEmail,
    totalToValidate: importedContacts.length
  })

  const { contacts: existingContacts } = getContacts(accountEmail)

  const result: ImportValidationResult = {
    valid: [],
    invalid: [],
    duplicates: []
  }

  const seenEmails = new Set<string>()

  importedContacts.forEach((contact, index) => {
    const rowNum = index + 2 // 헤더가 1행이므로 데이터는 2행부터

    // 이메일 유효성 검사
    if (!isValidEmail(contact.email)) {
      result.invalid.push({
        row: rowNum,
        data: contact as unknown as Record<string, string>,
        error: '유효하지 않은 이메일 형식입니다.'
      })
      return
    }

    // 파일 내 중복 검사
    const emailLower = contact.email.toLowerCase()
    if (seenEmails.has(emailLower)) {
      result.invalid.push({
        row: rowNum,
        data: contact as unknown as Record<string, string>,
        error: '파일 내에 중복된 이메일이 있습니다.'
      })
      return
    }
    seenEmails.add(emailLower)

    // 기존 연락처와 중복 검사
    const existingContact = existingContacts.find((c) => c.email.toLowerCase() === emailLower)
    if (existingContact) {
      result.duplicates.push({
        row: rowNum,
        data: contact,
        existingContact
      })
      return
    }

    result.valid.push(contact)
  })

  logger.info(LogCategory.IMPORT, 'Contact validation completed', {
    valid: result.valid.length,
    invalid: result.invalid.length,
    duplicates: result.duplicates.length
  })

  return result
}

/**
 * 연락처 일괄 가져오기
 */
export function importContacts(
  accountEmail: string,
  contacts: ImportedContact[],
  duplicateAction: 'skip' | 'update' | 'add_all' = 'skip'
): ImportResult {
  logger.info(LogCategory.IMPORT, 'Starting contact import', {
    accountEmail,
    totalContacts: contacts.length,
    duplicateAction
  })

  const { contacts: existingContacts } = getContacts(accountEmail)
  const groups = getContactGroups(accountEmail)

  let imported = 0
  let skipped = 0
  let failed = 0
  const errors: string[] = []

  // 그룹 이름 -> ID 매핑 (없으면 생성)
  const groupNameToId = new Map<string, string>()
  groups.forEach((g) => groupNameToId.set(g.name.toLowerCase(), g.id))

  const getOrCreateGroupId = (groupName: string): string => {
    const nameLower = groupName.toLowerCase()
    if (groupNameToId.has(nameLower)) {
      return groupNameToId.get(nameLower)!
    }

    // 새 그룹 생성
    const result = addContactGroup(accountEmail, groupName)
    if (result.success && result.group) {
      groupNameToId.set(nameLower, result.group.id)
      return result.group.id
    }

    // 생성 실패 시 빈 그룹 ID 반환
    return ''
  }

  for (const contact of contacts) {
    try {
      const emailLower = contact.email.toLowerCase()
      const existing = existingContacts.find((c) => c.email.toLowerCase() === emailLower)

      if (existing) {
        // 중복 처리
        if (duplicateAction === 'skip') {
          skipped++
          continue
        } else if (duplicateAction === 'update') {
          // 기존 연락처 업데이트
          const groupIds = [...existing.groupIds]
          if (contact.groupName) {
            const groupId = getOrCreateGroupId(contact.groupName)
            if (groupId && !groupIds.includes(groupId)) {
              groupIds.push(groupId)
            }
          }

          const updateResult = updateContact(accountEmail, existing.id, {
            name: contact.name || existing.name,
            organization: contact.organization || existing.organization,
            phone: contact.phone || existing.phone,
            memo: contact.memo || existing.memo,
            groupIds
          })

          if (updateResult.success) {
            imported++
          } else {
            failed++
            errors.push(`${contact.email}: ${updateResult.error || '업데이트 실패'}`)
          }
          continue
        }
        // add_all의 경우 중복이어도 추가 (아래로 진행)
      }

      // 새 연락처 추가
      const groupIds: string[] = []
      if (contact.groupName) {
        const groupId = getOrCreateGroupId(contact.groupName)
        if (groupId) {
          groupIds.push(groupId)
        }
      }

      const addResult = addContact(accountEmail, {
        name: contact.name,
        email: contact.email,
        organization: contact.organization,
        phone: contact.phone,
        memo: contact.memo,
        groupIds,
        starred: false
      })

      if (addResult.success) {
        imported++
      } else {
        // 중복 이메일 에러인 경우 (add_all 모드에서도 실패할 수 있음)
        if (addResult.error?.includes('이미 등록된')) {
          skipped++
        } else {
          failed++
          errors.push(`${contact.email}: ${addResult.error || '추가 실패'}`)
        }
      }
    } catch (error) {
      failed++
      errors.push(`${contact.email}: ${error instanceof Error ? error.message : '알 수 없는 오류'}`)
    }
  }

  logger.info(LogCategory.IMPORT, 'Contact import completed', {
    imported,
    skipped,
    failed,
    errors: errors.length > 0 ? errors : undefined
  })

  return {
    success: true,
    imported,
    skipped,
    failed,
    errors: errors.length > 0 ? errors : undefined
  }
}

/**
 * 연락처 내보내기 (Excel/CSV)
 */
export async function exportContacts(
  accountEmail: string,
  format: 'xlsx' | 'csv',
  options?: {
    groupId?: string
    starred?: boolean
  }
): Promise<{ success: boolean; data?: Buffer; filename?: string; error?: string }> {
  logger.info(LogCategory.EXPORT, 'Starting contact export', {
    accountEmail,
    format,
    options
  })

  try {
    const { contacts } = getContacts(accountEmail, {
      groupId: options?.groupId,
      starred: options?.starred
    })
    const groups = getContactGroups(accountEmail)

    // 그룹 ID -> 이름 매핑
    const groupIdToName = new Map<string, string>()
    groups.forEach((g) => groupIdToName.set(g.id, g.name))

    // ExcelJS 워크북 생성
    const workbook = new ExcelJS.Workbook()
    const worksheet = workbook.addWorksheet('Contacts')

    // 헤더 설정
    worksheet.columns = [
      { header: '이름', key: 'name', width: 20 },
      { header: '이메일', key: 'email', width: 30 },
      { header: '조직', key: 'organization', width: 20 },
      { header: '전화번호', key: 'phone', width: 15 },
      { header: '메모', key: 'memo', width: 30 },
      { header: '그룹', key: 'group', width: 20 },
      { header: '즐겨찾기', key: 'starred', width: 10 },
      { header: '생성일', key: 'createdAt', width: 20 }
    ]

    // 데이터 추가
    contacts.forEach((c) => {
      worksheet.addRow({
        name: c.name,
        email: c.email,
        organization: c.organization || '',
        phone: c.phone || '',
        memo: c.memo || '',
        group: c.groupIds.map((gId) => groupIdToName.get(gId) || '').join(', '),
        starred: c.starred ? 'Y' : 'N',
        createdAt: c.createdAt
      })
    })

    // 버퍼로 변환
    let buffer: Buffer
    if (format === 'csv') {
      buffer = Buffer.from(await workbook.csv.writeBuffer())
    } else {
      buffer = Buffer.from(await workbook.xlsx.writeBuffer())
    }

    const timestamp = new Date().toISOString().slice(0, 10).replace(/-/g, '')
    const filename = `contacts_${timestamp}.${format}`

    logger.info(LogCategory.EXPORT, 'Contact export completed', {
      totalExported: contacts.length,
      format,
      filename
    })

    return { success: true, data: buffer, filename }
  } catch (error) {
    logger.error(LogCategory.EXPORT, 'Failed to export contacts', {
      error: error instanceof Error ? error.message : String(error)
    })
    return {
      success: false,
      error: `내보내기 실패: ${error instanceof Error ? error.message : '알 수 없는 오류'}`
    }
  }
}

/**
 * 샘플 템플릿 생성
 */
export async function createContactImportTemplate(format: 'xlsx' | 'csv'): Promise<{
  success: boolean
  data?: Buffer
  filename?: string
  error?: string
}> {
  logger.info(LogCategory.IMPORT, 'Creating contact import template', { format })
  try {
    const templateData = [
      {
        이름: '홍길동',
        이메일: 'hong@example.com',
        조직: '주식회사 예시',
        전화번호: '010-1234-5678',
        메모: '비고 내용',
        그룹: '가족'
      },
      {
        이름: 'John Doe',
        이메일: 'john@example.com',
        조직: 'Example Corp',
        전화번호: '010-9876-5432',
        메모: 'Sample note',
        그룹: 'Work'
      }
    ]

    const workbook = new ExcelJS.Workbook()
    const worksheet = workbook.addWorksheet('Template')

    // Set columns with headers
    worksheet.columns = [
      { header: '이름', key: 'name', width: 20 },
      { header: '이메일', key: 'email', width: 30 },
      { header: '조직', key: 'org', width: 25 },
      { header: '전화번호', key: 'phone', width: 20 },
      { header: '메모', key: 'memo', width: 30 },
      { header: '그룹', key: 'group', width: 15 }
    ]

    // Add data rows
    for (const data of templateData) {
      worksheet.addRow({
        name: data.이름,
        email: data.이메일,
        org: data.조직,
        phone: data.전화번호,
        memo: data.메모,
        group: data.그룹
      })
    }

    let buffer: Buffer
    if (format === 'csv') {
      buffer = Buffer.from(await workbook.csv.writeBuffer())
    } else {
      buffer = Buffer.from(await workbook.xlsx.writeBuffer())
    }

    const filename = `contact_import_template.${format}`

    logger.debug(LogCategory.IMPORT, 'Template created successfully', { format, filename })
    return { success: true, data: buffer, filename }
  } catch (error) {
    logger.error(LogCategory.IMPORT, 'Failed to create template', {
      error: error instanceof Error ? error.message : String(error)
    })
    return {
      success: false,
      error: `템플릿 생성 실패: ${error instanceof Error ? error.message : '알 수 없는 오류'}`
    }
  }
}
