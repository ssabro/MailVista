/**
 * Trello API Service
 * Handles all Trello-related operations for the email client
 */

import { app } from 'electron'
import { join } from 'path'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'

// Trello API Base URL
const TRELLO_API_BASE = 'https://api.trello.com/1'

// Trello credentials interface
export interface TrelloCredentials {
  apiKey: string
  token: string
}

// Trello board interface
export interface TrelloBoard {
  id: string
  name: string
  closed: boolean
}

// Trello list interface
export interface TrelloList {
  id: string
  name: string
  idBoard: string
  closed: boolean
}

// Trello card creation options
export interface TrelloCardOptions {
  name: string
  desc?: string
  idList: string
  pos?: 'top' | 'bottom' | number
  due?: string
  urlSource?: string
}

// Trello card response
export interface TrelloCard {
  id: string
  name: string
  desc: string
  url: string
  shortUrl: string
  idList: string
  idBoard: string
}

// Storage path for Trello credentials
function getCredentialsPath(accountEmail: string): string {
  const userDataPath = app.getPath('userData')
  const trelloDir = join(userDataPath, 'trello')
  if (!existsSync(trelloDir)) {
    mkdirSync(trelloDir, { recursive: true })
  }
  return join(trelloDir, `${accountEmail.replace(/[^a-zA-Z0-9]/g, '_')}_credentials.json`)
}

/**
 * Save Trello credentials for an account
 */
export function saveTrelloCredentials(
  accountEmail: string,
  credentials: TrelloCredentials
): boolean {
  try {
    const path = getCredentialsPath(accountEmail)
    writeFileSync(path, JSON.stringify(credentials, null, 2), 'utf-8')
    return true
  } catch (error) {
    console.error('Failed to save Trello credentials:', error)
    return false
  }
}

/**
 * Get Trello credentials for an account
 */
export function getTrelloCredentials(accountEmail: string): TrelloCredentials | null {
  try {
    const path = getCredentialsPath(accountEmail)
    if (!existsSync(path)) {
      return null
    }
    const data = readFileSync(path, 'utf-8')
    return JSON.parse(data) as TrelloCredentials
  } catch (error) {
    console.error('Failed to get Trello credentials:', error)
    return null
  }
}

/**
 * Delete Trello credentials for an account
 */
export function deleteTrelloCredentials(accountEmail: string): boolean {
  try {
    const path = getCredentialsPath(accountEmail)
    if (existsSync(path)) {
      const { unlinkSync } = require('fs')
      unlinkSync(path)
    }
    return true
  } catch (error) {
    console.error('Failed to delete Trello credentials:', error)
    return false
  }
}

/**
 * Validate Trello credentials by making a test API call
 */
export async function validateTrelloCredentials(
  apiKey: string,
  token: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch(`${TRELLO_API_BASE}/members/me?key=${apiKey}&token=${token}`)

    if (response.ok) {
      return { success: true }
    } else if (response.status === 401) {
      return { success: false, error: 'Invalid API Key or Token' }
    } else {
      return { success: false, error: `API error: ${response.status}` }
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Network error'
    }
  }
}

/**
 * Get all boards for the authenticated user
 */
export async function getTrelloBoards(
  apiKey: string,
  token: string
): Promise<{ success: boolean; boards?: TrelloBoard[]; error?: string }> {
  try {
    const response = await fetch(
      `${TRELLO_API_BASE}/members/me/boards?filter=open&key=${apiKey}&token=${token}`
    )

    if (!response.ok) {
      return { success: false, error: `Failed to fetch boards: ${response.status}` }
    }

    const boards = (await response.json()) as TrelloBoard[]
    return { success: true, boards }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch boards'
    }
  }
}

/**
 * Get all lists for a board
 */
export async function getTrelloLists(
  apiKey: string,
  token: string,
  boardId: string
): Promise<{ success: boolean; lists?: TrelloList[]; error?: string }> {
  try {
    const response = await fetch(
      `${TRELLO_API_BASE}/boards/${boardId}/lists?filter=open&key=${apiKey}&token=${token}`
    )

    if (!response.ok) {
      return { success: false, error: `Failed to fetch lists: ${response.status}` }
    }

    const lists = (await response.json()) as TrelloList[]
    return { success: true, lists }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch lists'
    }
  }
}

/**
 * Create a new Trello card
 */
export async function createTrelloCard(
  apiKey: string,
  token: string,
  options: TrelloCardOptions
): Promise<{ success: boolean; card?: TrelloCard; error?: string }> {
  try {
    const params = new URLSearchParams({
      key: apiKey,
      token: token,
      idList: options.idList,
      name: options.name,
      pos: options.pos?.toString() || 'top'
    })

    if (options.desc) {
      params.append('desc', options.desc)
    }
    if (options.due) {
      params.append('due', options.due)
    }
    if (options.urlSource) {
      params.append('urlSource', options.urlSource)
    }

    const response = await fetch(`${TRELLO_API_BASE}/cards?${params.toString()}`, {
      method: 'POST'
    })

    if (!response.ok) {
      const errorText = await response.text()
      return { success: false, error: `Failed to create card: ${errorText}` }
    }

    const card = (await response.json()) as TrelloCard
    return { success: true, card }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create card'
    }
  }
}
