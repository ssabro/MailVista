import { app } from 'electron'
import * as path from 'path'
import * as fs from 'fs'

export class BodyStorage {
  private basePath: string

  constructor(basePath?: string) {
    this.basePath = basePath || path.join(app.getPath('userData'), 'mail-storage', 'bodies')
    fs.mkdirSync(this.basePath, { recursive: true })
  }

  // EML 파일 경로 생성
  getBodyPath(accountId: string, folderId: string, uid: number): string {
    return path.join(this.basePath, accountId, folderId, `${uid}.eml`)
  }

  // 상대 경로 반환 (DB 저장용)
  getRelativePath(accountId: string, folderId: string, uid: number): string {
    return path.join(accountId, folderId, `${uid}.eml`)
  }

  // EML 본문 저장
  async saveBody(
    accountId: string,
    folderId: string,
    uid: number,
    emlContent: string
  ): Promise<string> {
    const filePath = this.getBodyPath(accountId, folderId, uid)
    const dirPath = path.dirname(filePath)

    await fs.promises.mkdir(dirPath, { recursive: true })
    await fs.promises.writeFile(filePath, emlContent, 'utf8')

    return this.getRelativePath(accountId, folderId, uid)
  }

  // EML 본문 저장 (Buffer 버전 - 바이너리 데이터용)
  async saveBodyBuffer(
    accountId: string,
    folderId: string,
    uid: number,
    emlBuffer: Buffer
  ): Promise<string> {
    const filePath = this.getBodyPath(accountId, folderId, uid)
    const dirPath = path.dirname(filePath)

    await fs.promises.mkdir(dirPath, { recursive: true })
    await fs.promises.writeFile(filePath, emlBuffer)

    return this.getRelativePath(accountId, folderId, uid)
  }

  // EML 본문 조회
  async getBody(accountId: string, folderId: string, uid: number): Promise<string | null> {
    const filePath = this.getBodyPath(accountId, folderId, uid)
    try {
      return await fs.promises.readFile(filePath, 'utf8')
    } catch {
      return null
    }
  }

  // EML 본문 조회 (Buffer 버전)
  async getBodyBuffer(accountId: string, folderId: string, uid: number): Promise<Buffer | null> {
    const filePath = this.getBodyPath(accountId, folderId, uid)
    try {
      return await fs.promises.readFile(filePath)
    } catch {
      return null
    }
  }

  // 경로가 basePath 내에 있는지 검증 (Path Traversal 방지)
  private isPathSafe(filePath: string): boolean {
    const normalizedPath = path.normalize(filePath)
    const normalizedBase = path.normalize(this.basePath)
    return normalizedPath.startsWith(normalizedBase + path.sep) || normalizedPath === normalizedBase
  }

  // 상대 경로로 본문 조회
  async getBodyByPath(relativePath: string): Promise<string | null> {
    const filePath = path.join(this.basePath, relativePath)
    // Path Traversal 방지
    if (!this.isPathSafe(filePath)) {
      console.error('[BodyStorage] Path traversal attempt blocked:', relativePath)
      return null
    }
    try {
      return await fs.promises.readFile(filePath, 'utf8')
    } catch {
      return null
    }
  }

  // 상대 경로로 본문 조회 (Buffer 버전)
  async getBodyBufferByPath(relativePath: string): Promise<Buffer | null> {
    const filePath = path.join(this.basePath, relativePath)
    // Path Traversal 방지
    if (!this.isPathSafe(filePath)) {
      console.error('[BodyStorage] Path traversal attempt blocked:', relativePath)
      return null
    }
    try {
      return await fs.promises.readFile(filePath)
    } catch {
      return null
    }
  }

  // EML 본문 삭제
  async deleteBody(accountId: string, folderId: string, uid: number): Promise<void> {
    const filePath = this.getBodyPath(accountId, folderId, uid)
    try {
      await fs.promises.unlink(filePath)
      // 빈 디렉토리 정리
      await this.cleanupEmptyDirectories(path.dirname(filePath))
    } catch {
      // 파일이 없으면 무시
    }
  }

  // 폴더 전체 삭제
  async deleteFolderBodies(accountId: string, folderId: string): Promise<void> {
    const folderPath = path.join(this.basePath, accountId, folderId)
    try {
      await fs.promises.rm(folderPath, { recursive: true, force: true })
      // 빈 계정 디렉토리 정리
      await this.cleanupEmptyDirectories(path.join(this.basePath, accountId))
    } catch {
      // 디렉토리가 없으면 무시
    }
  }

  // 계정 전체 삭제
  async deleteAccountBodies(accountId: string): Promise<void> {
    const accountPath = path.join(this.basePath, accountId)
    try {
      await fs.promises.rm(accountPath, { recursive: true, force: true })
    } catch {
      // 디렉토리가 없으면 무시
    }
  }

  // 본문 존재 여부 확인
  async exists(accountId: string, folderId: string, uid: number): Promise<boolean> {
    const filePath = this.getBodyPath(accountId, folderId, uid)
    try {
      await fs.promises.access(filePath)
      return true
    } catch {
      return false
    }
  }

  // 파일 크기 조회
  async getFileSize(accountId: string, folderId: string, uid: number): Promise<number> {
    const filePath = this.getBodyPath(accountId, folderId, uid)
    try {
      const stats = await fs.promises.stat(filePath)
      return stats.size
    } catch {
      return 0
    }
  }

  // 전체 스토리지 사용량 계산
  async getStorageSize(accountId?: string): Promise<number> {
    const targetPath = accountId ? path.join(this.basePath, accountId) : this.basePath

    return this.calculateDirectorySize(targetPath)
  }

  // 폴더별 스토리지 사용량 계산
  async getFolderStorageSize(accountId: string, folderId: string): Promise<number> {
    const folderPath = path.join(this.basePath, accountId, folderId)
    return this.calculateDirectorySize(folderPath)
  }

  // 디렉토리 크기 계산 (재귀)
  private async calculateDirectorySize(dirPath: string): Promise<number> {
    try {
      const stats = await fs.promises.stat(dirPath)
      if (!stats.isDirectory()) {
        return stats.size
      }

      let totalSize = 0
      const files = await fs.promises.readdir(dirPath)

      for (const file of files) {
        const filePath = path.join(dirPath, file)
        totalSize += await this.calculateDirectorySize(filePath)
      }

      return totalSize
    } catch {
      return 0
    }
  }

  // 빈 디렉토리 정리
  private async cleanupEmptyDirectories(dirPath: string): Promise<void> {
    // 기본 경로보다 상위로는 정리하지 않음
    if (!dirPath.startsWith(this.basePath) || dirPath === this.basePath) {
      return
    }

    try {
      const files = await fs.promises.readdir(dirPath)
      if (files.length === 0) {
        await fs.promises.rmdir(dirPath)
        await this.cleanupEmptyDirectories(path.dirname(dirPath))
      }
    } catch {
      // 오류 무시
    }
  }

  // 폴더 내 모든 UID 목록 조회
  async listUids(accountId: string, folderId: string): Promise<number[]> {
    const folderPath = path.join(this.basePath, accountId, folderId)
    try {
      const files = await fs.promises.readdir(folderPath)
      return files
        .filter((f) => f.endsWith('.eml'))
        .map((f) => parseInt(f.replace('.eml', ''), 10))
        .filter((uid) => !isNaN(uid))
        .sort((a, b) => b - a) // 최신순
    } catch {
      return []
    }
  }

  // 전체 캐시 삭제
  async clearAll(): Promise<void> {
    try {
      await fs.promises.rm(this.basePath, { recursive: true, force: true })
      await fs.promises.mkdir(this.basePath, { recursive: true })
    } catch {
      // 오류 무시
    }
  }
}

// 싱글톤 인스턴스
let bodyStorageInstance: BodyStorage | null = null

export function getBodyStorage(): BodyStorage {
  if (!bodyStorageInstance) {
    bodyStorageInstance = new BodyStorage()
  }
  return bodyStorageInstance
}
