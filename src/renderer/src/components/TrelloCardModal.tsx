import { useState, useEffect, useCallback } from 'react'
import { Loader2, ExternalLink, Key, CheckCircle2, AlertCircle } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from './ui/dialog'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Textarea } from './ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger } from './ui/select'

interface TrelloBoard {
  id: string
  name: string
  closed: boolean
}

interface TrelloList {
  id: string
  name: string
  idBoard: string
  closed: boolean
}

interface TrelloCredentials {
  apiKey: string
  token: string
}

interface EmailData {
  subject: string
  body: string
  from: string
  date: string
}

interface TrelloCardModalProps {
  isOpen: boolean
  onClose: () => void
  accountEmail: string
  emailData: EmailData | null
}

export function TrelloCardModal({
  isOpen,
  onClose,
  accountEmail,
  emailData
}: TrelloCardModalProps) {
  // Credentials state
  const [credentials, setCredentials] = useState<TrelloCredentials | null>(null)
  const [apiKey, setApiKey] = useState('')
  const [token, setToken] = useState('')
  const [isValidating, setIsValidating] = useState(false)
  const [validationError, setValidationError] = useState<string | null>(null)

  // Board and list state
  const [boards, setBoards] = useState<TrelloBoard[]>([])
  const [lists, setLists] = useState<TrelloList[]>([])
  const [selectedBoardId, setSelectedBoardId] = useState<string>('')
  const [selectedListId, setSelectedListId] = useState<string>('')
  const [isLoadingBoards, setIsLoadingBoards] = useState(false)
  const [isLoadingLists, setIsLoadingLists] = useState(false)

  // Card form state
  const [cardTitle, setCardTitle] = useState('')
  const [cardDescription, setCardDescription] = useState('')

  // Submission state
  const [isCreating, setIsCreating] = useState(false)
  const [createResult, setCreateResult] = useState<{
    success: boolean
    message: string
    cardUrl?: string
  } | null>(null)

  // Load saved credentials on mount
  useEffect(() => {
    if (isOpen && accountEmail) {
      loadCredentials()
    }
  }, [isOpen, accountEmail])

  // Set default values from email data
  useEffect(() => {
    if (emailData) {
      setCardTitle(emailData.subject || '')
      // Create a brief summary for the card description
      const bodyPreview = emailData.body.substring(0, 500)
      const description = `**From:** ${emailData.from}\n**Date:** ${emailData.date}\n\n---\n\n${bodyPreview}${emailData.body.length > 500 ? '...' : ''}`
      setCardDescription(description)
    }
  }, [emailData])

  // Load boards when credentials are available
  useEffect(() => {
    if (credentials) {
      loadBoards()
    }
  }, [credentials])

  // Load lists when board is selected
  useEffect(() => {
    if (selectedBoardId && credentials) {
      loadLists(selectedBoardId)
    } else {
      setLists([])
      setSelectedListId('')
    }
  }, [selectedBoardId, credentials])

  const loadCredentials = async () => {
    try {
      const saved = await window.electron.ipcRenderer.invoke('trello-get-credentials', accountEmail)
      if (saved) {
        setCredentials(saved)
        setApiKey(saved.apiKey)
        setToken(saved.token)
      }
    } catch (error) {
      console.error('Failed to load Trello credentials:', error)
    }
  }

  const validateAndSaveCredentials = async () => {
    if (!apiKey.trim() || !token.trim()) {
      setValidationError('API Key and Token are required')
      return
    }

    setIsValidating(true)
    setValidationError(null)

    try {
      const result = await window.electron.ipcRenderer.invoke(
        'trello-validate-credentials',
        apiKey.trim(),
        token.trim()
      )

      if (result.success) {
        const creds = { apiKey: apiKey.trim(), token: token.trim() }
        await window.electron.ipcRenderer.invoke('trello-save-credentials', accountEmail, creds)
        setCredentials(creds)
      } else {
        setValidationError(result.error || 'Invalid credentials')
      }
    } catch (error) {
      setValidationError(error instanceof Error ? error.message : 'Validation failed')
    } finally {
      setIsValidating(false)
    }
  }

  const loadBoards = async () => {
    if (!credentials) return

    setIsLoadingBoards(true)
    try {
      const result = await window.electron.ipcRenderer.invoke(
        'trello-get-boards',
        credentials.apiKey,
        credentials.token
      )

      if (result.success && result.boards) {
        setBoards(result.boards)
      }
    } catch (error) {
      console.error('Failed to load boards:', error)
    } finally {
      setIsLoadingBoards(false)
    }
  }

  const loadLists = async (boardId: string) => {
    if (!credentials) return

    setIsLoadingLists(true)
    try {
      const result = await window.electron.ipcRenderer.invoke(
        'trello-get-lists',
        credentials.apiKey,
        credentials.token,
        boardId
      )

      if (result.success && result.lists) {
        setLists(result.lists)
      }
    } catch (error) {
      console.error('Failed to load lists:', error)
    } finally {
      setIsLoadingLists(false)
    }
  }

  const handleCreateCard = async () => {
    if (!credentials || !selectedListId || !cardTitle.trim()) {
      return
    }

    setIsCreating(true)
    setCreateResult(null)

    try {
      const result = await window.electron.ipcRenderer.invoke(
        'trello-create-card',
        credentials.apiKey,
        credentials.token,
        {
          name: cardTitle.trim(),
          desc: cardDescription,
          idList: selectedListId,
          pos: 'top'
        }
      )

      if (result.success && result.card) {
        setCreateResult({
          success: true,
          message: 'Trello card created successfully!',
          cardUrl: result.card.shortUrl || result.card.url
        })
      } else {
        setCreateResult({
          success: false,
          message: result.error || 'Failed to create card'
        })
      }
    } catch (error) {
      setCreateResult({
        success: false,
        message: error instanceof Error ? error.message : 'Failed to create card'
      })
    } finally {
      setIsCreating(false)
    }
  }

  const handleClose = useCallback(() => {
    setCreateResult(null)
    setSelectedBoardId('')
    setSelectedListId('')
    onClose()
  }, [onClose])

  const resetCredentials = () => {
    setCredentials(null)
    setApiKey('')
    setToken('')
    setBoards([])
    setLists([])
    setSelectedBoardId('')
    setSelectedListId('')
    window.electron.ipcRenderer.invoke('trello-delete-credentials', accountEmail)
  }

  // Credentials setup view
  const renderCredentialsForm = () => (
    <div className="space-y-4">
      <DialogDescription>
        Trello API Key and Token are required to create cards. You can get them from{' '}
        <a
          href="https://trello.com/power-ups/admin"
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary hover:underline inline-flex items-center gap-1"
          onClick={(e) => {
            e.preventDefault()
            window.electron.ipcRenderer.send('open-external', 'https://trello.com/power-ups/admin')
          }}
        >
          Trello Developer Portal
          <ExternalLink className="h-3 w-3" />
        </a>
      </DialogDescription>

      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="apiKey">API Key</Label>
          <Input
            id="apiKey"
            type="text"
            placeholder="Enter your Trello API Key"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="token">Token</Label>
          <Input
            id="token"
            type="password"
            placeholder="Enter your Trello Token"
            value={token}
            onChange={(e) => setToken(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Generate a token from the API Key page with read/write permissions.
          </p>
        </div>

        {validationError && (
          <div className="flex items-center gap-2 text-sm text-red-500">
            <AlertCircle className="h-4 w-4" />
            {validationError}
          </div>
        )}
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={handleClose}>
          Cancel
        </Button>
        <Button onClick={validateAndSaveCredentials} disabled={isValidating}>
          {isValidating ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Validating...
            </>
          ) : (
            <>
              <Key className="h-4 w-4 mr-2" />
              Connect to Trello
            </>
          )}
        </Button>
      </DialogFooter>
    </div>
  )

  // Card creation form view
  const renderCardForm = () => (
    <div className="space-y-4">
      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label>Board</Label>
          <Select value={selectedBoardId} onValueChange={setSelectedBoardId}>
            <SelectTrigger>
              {isLoadingBoards ? (
                <span className="flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading boards...
                </span>
              ) : (
                <span>
                  {selectedBoardId
                    ? boards.find((b) => b.id === selectedBoardId)?.name || 'Select a board'
                    : 'Select a board'}
                </span>
              )}
            </SelectTrigger>
            <SelectContent>
              {boards.map((board) => (
                <SelectItem key={board.id} value={board.id}>
                  {board.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label>List</Label>
          {selectedBoardId ? (
            <Select value={selectedListId} onValueChange={setSelectedListId}>
              <SelectTrigger>
                {isLoadingLists ? (
                  <span className="flex items-center gap-2 text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading lists...
                  </span>
                ) : (
                  <span>
                    {selectedListId
                      ? lists.find((l) => l.id === selectedListId)?.name || 'Select a list'
                      : 'Select a list'}
                  </span>
                )}
              </SelectTrigger>
              <SelectContent>
                {lists.map((list) => (
                  <SelectItem key={list.id} value={list.id}>
                    {list.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <div className="flex h-9 w-full items-center rounded-md border border-input bg-muted px-3 py-2 text-sm text-muted-foreground">
              Select a board first
            </div>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="title">Card Title</Label>
          <Input
            id="title"
            type="text"
            placeholder="Enter card title"
            value={cardTitle}
            onChange={(e) => setCardTitle(e.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="description">Description</Label>
          <Textarea
            id="description"
            placeholder="Enter card description"
            value={cardDescription}
            onChange={(e) => setCardDescription(e.target.value)}
            rows={6}
            className="resize-none"
          />
        </div>
      </div>

      {createResult && (
        <div
          className={`flex items-center gap-2 p-3 rounded-md text-sm ${
            createResult.success
              ? 'bg-green-50 text-green-700 border border-green-200'
              : 'bg-red-50 text-red-700 border border-red-200'
          }`}
        >
          {createResult.success ? (
            <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
          ) : (
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
          )}
          <span className="flex-1">{createResult.message}</span>
          {createResult.cardUrl && (
            <a
              href={createResult.cardUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline inline-flex items-center gap-1"
              onClick={(e) => {
                e.preventDefault()
                window.electron.ipcRenderer.send('open-external', createResult.cardUrl)
              }}
            >
              Open Card
              <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
      )}

      <DialogFooter className="flex-col sm:flex-row gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={resetCredentials}
          className="text-muted-foreground"
        >
          Change Account
        </Button>
        <div className="flex-1" />
        <Button variant="outline" onClick={handleClose}>
          {createResult?.success ? 'Close' : 'Cancel'}
        </Button>
        {!createResult?.success && (
          <Button
            onClick={handleCreateCard}
            disabled={isCreating || !selectedListId || !cardTitle.trim()}
          >
            {isCreating ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Creating...
              </>
            ) : (
              'Create Card'
            )}
          </Button>
        )}
      </DialogFooter>
    </div>
  )

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Create Trello Card</DialogTitle>
        </DialogHeader>
        {credentials ? renderCardForm() : renderCredentialsForm()}
      </DialogContent>
    </Dialog>
  )
}
