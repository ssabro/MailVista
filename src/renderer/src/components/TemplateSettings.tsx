import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Textarea } from './ui/textarea'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from './ui/dialog'
import { Plus, Pencil, Trash2, FileText, Save, Loader2 } from 'lucide-react'

interface EmailTemplate {
  id: string
  name: string
  subject: string
  content: string
  createdAt: number
  updatedAt: number
}

export function TemplateSettings() {
  const { t } = useTranslation()
  const [templates, setTemplates] = useState<EmailTemplate[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)

  // Dialog state
  const [showDialog, setShowDialog] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState<EmailTemplate | null>(null)
  const [formData, setFormData] = useState({
    name: '',
    subject: '',
    content: ''
  })
  const [formError, setFormError] = useState<string | null>(null)

  // Load templates
  useEffect(() => {
    loadTemplates()
  }, [])

  const loadTemplates = async () => {
    setIsLoading(true)
    try {
      const result = await window.electron.ipcRenderer.invoke('template-get-all')
      setTemplates(result || [])
    } catch (error) {
      console.error('Failed to load templates:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleOpenCreate = () => {
    setEditingTemplate(null)
    setFormData({ name: '', subject: '', content: '' })
    setFormError(null)
    setShowDialog(true)
  }

  const handleOpenEdit = (template: EmailTemplate) => {
    setEditingTemplate(template)
    setFormData({
      name: template.name,
      subject: template.subject,
      content: template.content
    })
    setFormError(null)
    setShowDialog(true)
  }

  const handleCloseDialog = () => {
    setShowDialog(false)
    setEditingTemplate(null)
    setFormData({ name: '', subject: '', content: '' })
    setFormError(null)
  }

  const handleSave = async () => {
    if (!formData.name.trim()) {
      setFormError(t('template.errors.nameRequired'))
      return
    }

    setIsSaving(true)
    setFormError(null)

    try {
      let result
      if (editingTemplate) {
        // Update existing template
        result = await window.electron.ipcRenderer.invoke('template-update', editingTemplate.id, {
          name: formData.name,
          subject: formData.subject,
          content: formData.content
        })
      } else {
        // Create new template
        result = await window.electron.ipcRenderer.invoke(
          'template-create',
          formData.name,
          formData.subject,
          formData.content
        )
      }

      if (result.success) {
        await loadTemplates()
        handleCloseDialog()
      } else {
        setFormError(result.error || t('template.errors.saveFailed'))
      }
    } catch (error) {
      setFormError(t('template.errors.saveFailed'))
    } finally {
      setIsSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm(t('template.deleteConfirm'))) return

    try {
      const result = await window.electron.ipcRenderer.invoke('template-delete', id)
      if (result.success) {
        await loadTemplates()
      } else {
        alert(result.error || t('template.errors.deleteFailed'))
      }
    } catch (error) {
      alert(t('template.errors.deleteFailed'))
    }
  }

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-muted-foreground">{t('settings.loadingSettings')}</p>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-1 flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-4 py-3">
        <h2 className="text-lg font-semibold">{t('template.title')}</h2>
        <Button size="sm" onClick={handleOpenCreate}>
          <Plus className="mr-2 h-4 w-4" />
          {t('template.create')}
        </Button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        {templates.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <FileText className="h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-muted-foreground text-center">{t('template.empty')}</p>
              <Button variant="outline" className="mt-4" onClick={handleOpenCreate}>
                <Plus className="mr-2 h-4 w-4" />
                {t('template.createFirst')}
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {templates.map((template) => (
              <Card key={template.id} className="hover:bg-muted/50 transition-colors">
                <CardHeader className="py-3 px-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <CardTitle className="text-base font-medium truncate">
                        {template.name}
                      </CardTitle>
                      {template.subject && (
                        <CardDescription className="truncate mt-1">
                          {t('template.subject')}: {template.subject}
                        </CardDescription>
                      )}
                    </div>
                    <div className="flex items-center gap-1 ml-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleOpenEdit(template)}
                        className="h-8 w-8 p-0"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(template.id)}
                        className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                {template.content && (
                  <CardContent className="py-0 pb-3 px-4">
                    <p className="text-sm text-muted-foreground line-clamp-2">{template.content}</p>
                  </CardContent>
                )}
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Create/Edit Dialog */}
      <Dialog open={showDialog} onOpenChange={(open) => !open && handleCloseDialog()}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingTemplate ? t('template.edit') : t('template.create')}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Template Name */}
            <div className="space-y-2">
              <Label htmlFor="template-name">{t('template.name')} *</Label>
              <Input
                id="template-name"
                value={formData.name}
                onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                placeholder={t('template.namePlaceholder')}
              />
            </div>

            {/* Subject */}
            <div className="space-y-2">
              <Label htmlFor="template-subject">{t('template.subject')}</Label>
              <Input
                id="template-subject"
                value={formData.subject}
                onChange={(e) => setFormData((prev) => ({ ...prev, subject: e.target.value }))}
                placeholder={t('template.subjectPlaceholder')}
              />
            </div>

            {/* Content */}
            <div className="space-y-2">
              <Label htmlFor="template-content">{t('template.content')}</Label>
              <Textarea
                id="template-content"
                value={formData.content}
                onChange={(e) => setFormData((prev) => ({ ...prev, content: e.target.value }))}
                placeholder={t('template.contentPlaceholder')}
                rows={10}
                className="resize-none font-mono text-sm"
              />
            </div>

            {formError && <p className="text-sm text-destructive">{formError}</p>}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={handleCloseDialog} disabled={isSaving}>
              {t('common.cancel')}
            </Button>
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t('common.saving')}
                </>
              ) : (
                <>
                  <Save className="mr-2 h-4 w-4" />
                  {t('common.save')}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
