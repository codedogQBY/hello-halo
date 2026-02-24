/**
 * Skills Section Component
 * Manages skills listing, creation, editing, and import
 */

import { useState, useEffect, useCallback } from 'react'
import {
  Plus, Trash2, Edit3, ToggleLeft, ToggleRight,
  FileText, Globe, FolderOpen, ChevronDown, ChevronRight,
  Loader2, AlertCircle, Check, Wand
} from 'lucide-react'
import { useTranslation } from '../../i18n'
import { api } from '../../api'
import { useChatStore } from '../../stores/chat.store'
import { SkillPermissionsPanel } from '../skills/SkillPermissionsPanel'
import type { Skill, SkillSource, SkillsListResponse, CreateSkillRequest, UpdateSkillRequest } from '../../../shared/types/skill'

// ============================================================================
// Main Component
// ============================================================================

export function SkillsSection() {
  const { t } = useTranslation()
  const currentSpaceId = useChatStore((state) => state.currentSpaceId)

  const [skillsData, setSkillsData] = useState<SkillsListResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Dialog states
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [editingSkill, setEditingSkill] = useState<Skill | null>(null)
  const [showImportDialog, setShowImportDialog] = useState(false)

  // Section collapse states
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    user: true,
    project: true,
    compat: false,
  })

  const loadSkills = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await api.listSkills(currentSpaceId || undefined)
      if (result.success && result.data) {
        setSkillsData(result.data)
      } else {
        setError(result.error || 'Failed to load skills')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load skills')
    } finally {
      setLoading(false)
    }
  }, [currentSpaceId])

  useEffect(() => {
    loadSkills()
  }, [loadSkills])

  const handleToggle = async (skill: Skill) => {
    const newEnabled = !skill.enabled
    try {
      await api.toggleSkill(skill.id, newEnabled)
      await loadSkills()
    } catch (err) {
      console.error('[SkillsSection] Toggle error:', err)
    }
  }

  const handleDelete = async (skill: Skill) => {
    if (!confirm(t('Are you sure you want to delete this skill?'))) return
    try {
      await api.deleteSkill(skill.id, skill.source, currentSpaceId || undefined)
      await loadSkills()
    } catch (err) {
      console.error('[SkillsSection] Delete error:', err)
    }
  }

  const handleCreateComplete = async () => {
    setShowCreateDialog(false)
    await loadSkills()
  }

  const handleEditComplete = async () => {
    setEditingSkill(null)
    await loadSkills()
  }

  const handleImportComplete = async () => {
    setShowImportDialog(false)
    await loadSkills()
  }

  const toggleSection = (key: string) => {
    setExpandedSections(prev => ({ ...prev, [key]: !prev[key] }))
  }

  const renderSkillCard = (skill: Skill) => {
    const isCompat = !!skill.compatSource
    const isReadOnly = isCompat

    return (
      <div
        key={skill.id}
        className={`flex items-center justify-between p-3 rounded-lg border transition-colors ${
          skill.enabled
            ? 'border-border bg-background hover:bg-secondary/50'
            : 'border-border/50 bg-muted/30 opacity-60'
        }`}
      >
        <div className="flex-1 min-w-0 mr-3">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm truncate">{skill.name}</span>
            {skill.userInvocable && (
              <span className="text-[10px] px-1.5 py-0.5 bg-primary/10 text-primary rounded-full">
                /{skill.id}
              </span>
            )}
            {isCompat && (
              <span className="text-[10px] px-1.5 py-0.5 bg-amber-500/10 text-amber-600 dark:text-amber-400 rounded-full">
                {skill.compatSource}
              </span>
            )}
            {skill.alwaysApply && (
              <span className="text-[10px] px-1.5 py-0.5 bg-green-500/10 text-green-600 dark:text-green-400 rounded-full">
                {t('always')}
              </span>
            )}
          </div>
          {skill.description && (
            <p className="text-xs text-muted-foreground mt-0.5 truncate">{skill.description}</p>
          )}
          {skill.globs && skill.globs.length > 0 && (
            <p className="text-[10px] text-muted-foreground/70 mt-0.5 truncate">
              globs: {skill.globs.join(', ')}
            </p>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {!isReadOnly && (
            <button
              onClick={() => setEditingSkill(skill)}
              className="p-1.5 hover:bg-secondary rounded-md transition-colors"
              title={t('Edit')}
            >
              <Edit3 className="w-3.5 h-3.5 text-muted-foreground" />
            </button>
          )}
          {!isReadOnly && (
            <button
              onClick={() => handleDelete(skill)}
              className="p-1.5 hover:bg-destructive/10 rounded-md transition-colors"
              title={t('Delete')}
            >
              <Trash2 className="w-3.5 h-3.5 text-muted-foreground hover:text-destructive" />
            </button>
          )}
          <button
            onClick={() => handleToggle(skill)}
            className="p-1.5 hover:bg-secondary rounded-md transition-colors"
            title={skill.enabled ? t('Disable') : t('Enable')}
          >
            {skill.enabled ? (
              <ToggleRight className="w-4 h-4 text-primary" />
            ) : (
              <ToggleLeft className="w-4 h-4 text-muted-foreground" />
            )}
          </button>
        </div>
      </div>
    )
  }

  const renderSection = (title: string, key: string, skills: Skill[], showEmpty = true) => {
    if (!showEmpty && skills.length === 0) return null

    const isExpanded = expandedSections[key]

    return (
      <div key={key} className="mb-3">
        <button
          onClick={() => toggleSection(key)}
          className="flex items-center gap-1.5 w-full text-left mb-2"
        >
          {isExpanded ? (
            <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
          )}
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            {title}
          </span>
          <span className="text-xs text-muted-foreground/60">({skills.length})</span>
        </button>

        {isExpanded && (
          <div className="space-y-1.5">
            {skills.length === 0 ? (
              <p className="text-xs text-muted-foreground/60 pl-5 py-2">
                {t('No skills yet')}
              </p>
            ) : (
              skills.map(renderSkillCard)
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <section id="skills" className="bg-card rounded-xl border border-border p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Wand className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-medium">{t('Skills')}</h2>
          {skillsData && (
            <span className="text-xs text-muted-foreground">({skillsData.totalCount})</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowImportDialog(true)}
            className="text-xs px-2.5 py-1.5 rounded-md border border-border hover:bg-secondary transition-colors"
          >
            {t('Import')}
          </button>
          <button
            onClick={() => setShowCreateDialog(true)}
            className="text-xs px-2.5 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors flex items-center gap-1"
          >
            <Plus className="w-3.5 h-3.5" />
            {t('New Skill')}
          </button>
        </div>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 text-sm text-destructive p-3 bg-destructive/10 rounded-lg">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {!loading && !error && skillsData && (
        <div>
          {renderSection(t('User Skills'), 'user', skillsData.userSkills)}
          {renderSection(t('Project Skills'), 'project', skillsData.projectSkills)}
          {renderSection(t('Detected Rules'), 'compat', skillsData.compatSkills, false)}
        </div>
      )}

      {/* Permissions Panel */}
      {!loading && !error && skillsData && (
        <div className="mt-4 pt-4 border-t border-border">
          <SkillPermissionsPanel
            skills={[
              ...(skillsData.userSkills || []),
              ...(skillsData.projectSkills || []),
              ...(skillsData.compatSkills || [])
            ]}
          />
        </div>
      )}

      {/* Help text */}
      <div className="mt-4 pt-4 border-t border-border">
        <p className="text-xs text-muted-foreground">
          {t('Skills are reusable prompt templates. Use /skill-name to invoke them in chat.')}
        </p>
      </div>

      {/* Create Dialog */}
      {showCreateDialog && (
        <CreateSkillDialog
          spaceId={currentSpaceId || undefined}
          onClose={() => setShowCreateDialog(false)}
          onComplete={handleCreateComplete}
        />
      )}

      {/* Edit Dialog */}
      {editingSkill && (
        <EditSkillDialog
          skill={editingSkill}
          spaceId={currentSpaceId || undefined}
          onClose={() => setEditingSkill(null)}
          onComplete={handleEditComplete}
        />
      )}

      {/* Import Dialog */}
      {showImportDialog && (
        <ImportSkillDialog
          spaceId={currentSpaceId || undefined}
          onClose={() => setShowImportDialog(false)}
          onComplete={handleImportComplete}
        />
      )}
    </section>
  )
}

// ============================================================================
// Create Skill Dialog
// ============================================================================

interface CreateSkillDialogProps {
  spaceId?: string
  onClose: () => void
  onComplete: () => void
}

function CreateSkillDialog({ spaceId, onClose, onComplete }: CreateSkillDialogProps) {
  const { t } = useTranslation()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [content, setContent] = useState('')
  const [source, setSource] = useState<SkillSource>('user')
  const [userInvocable, setUserInvocable] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSave = async () => {
    if (!name.trim() || !content.trim()) {
      setError(t('Name and content are required'))
      return
    }

    setSaving(true)
    setError(null)

    try {
      const request: CreateSkillRequest = {
        name: name.trim(),
        description: description.trim() || undefined,
        content: content.trim(),
        source,
        userInvocable,
        spaceId: source === 'project' ? spaceId : undefined,
      }

      const result = await api.createSkill(request)
      if (result.success) {
        onComplete()
      } else {
        setError(result.error || 'Failed to create skill')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create skill')
    } finally {
      setSaving(false)
    }
  }

  return (
    <DialogOverlay onClose={onClose}>
      <div className="bg-card rounded-xl border border-border shadow-xl w-full max-w-lg max-h-[80vh] flex flex-col">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <h3 className="font-medium">{t('Create Skill')}</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">✕</button>
        </div>

        <div className="p-4 overflow-auto flex-1 space-y-4">
          {error && (
            <div className="text-sm text-destructive p-2 bg-destructive/10 rounded-md">{error}</div>
          )}

          <div>
            <label className="text-sm font-medium mb-1 block">{t('Name')}</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. code-commit"
              className="w-full px-3 py-2 text-sm rounded-md border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          <div>
            <label className="text-sm font-medium mb-1 block">{t('Description')}</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('Optional description')}
              className="w-full px-3 py-2 text-sm rounded-md border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          <div>
            <label className="text-sm font-medium mb-1 block">{t('Scope')}</label>
            <div className="flex gap-2">
              <button
                onClick={() => setSource('user')}
                className={`flex-1 px-3 py-2 text-sm rounded-md border transition-colors ${
                  source === 'user'
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border hover:bg-secondary'
                }`}
              >
                {t('User (Global)')}
              </button>
              <button
                onClick={() => setSource('project')}
                disabled={!spaceId}
                className={`flex-1 px-3 py-2 text-sm rounded-md border transition-colors ${
                  source === 'project'
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border hover:bg-secondary'
                } ${!spaceId ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                {t('Project')}
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <label className="text-sm font-medium">{t('User invocable (/skill-name)')}</label>
            <button
              onClick={() => setUserInvocable(!userInvocable)}
              className="p-1"
            >
              {userInvocable ? (
                <ToggleRight className="w-5 h-5 text-primary" />
              ) : (
                <ToggleLeft className="w-5 h-5 text-muted-foreground" />
              )}
            </button>
          </div>

          <div>
            <label className="text-sm font-medium mb-1 block">{t('Content (Markdown)')}</label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder={t('Enter skill prompt content...')}
              rows={10}
              className="w-full px-3 py-2 text-sm rounded-md border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary font-mono resize-y"
            />
          </div>
        </div>

        <div className="p-4 border-t border-border flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-sm rounded-md border border-border hover:bg-secondary transition-colors"
          >
            {t('Cancel')}
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !name.trim() || !content.trim()}
            className="px-3 py-1.5 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center gap-1.5"
          >
            {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {t('Create')}
          </button>
        </div>
      </div>
    </DialogOverlay>
  )
}

// ============================================================================
// Edit Skill Dialog
// ============================================================================

interface EditSkillDialogProps {
  skill: Skill
  spaceId?: string
  onClose: () => void
  onComplete: () => void
}

function EditSkillDialog({ skill, spaceId, onClose, onComplete }: EditSkillDialogProps) {
  const { t } = useTranslation()
  const [name, setName] = useState(skill.name)
  const [description, setDescription] = useState(skill.description)
  const [content, setContent] = useState(skill.content)
  const [userInvocable, setUserInvocable] = useState(skill.userInvocable)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSave = async () => {
    setSaving(true)
    setError(null)

    try {
      const request: UpdateSkillRequest = {
        name: name.trim() || undefined,
        description: description.trim() || undefined,
        content: content.trim() || undefined,
        userInvocable,
        source: skill.source,
        spaceId: skill.source === 'project' ? spaceId : undefined,
      }

      const result = await api.updateSkill(skill.id, request)
      if (result.success) {
        onComplete()
      } else {
        setError(result.error || 'Failed to update skill')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update skill')
    } finally {
      setSaving(false)
    }
  }

  return (
    <DialogOverlay onClose={onClose}>
      <div className="bg-card rounded-xl border border-border shadow-xl w-full max-w-lg max-h-[80vh] flex flex-col">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <h3 className="font-medium">{t('Edit Skill')}: {skill.name}</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">✕</button>
        </div>

        <div className="p-4 overflow-auto flex-1 space-y-4">
          {error && (
            <div className="text-sm text-destructive p-2 bg-destructive/10 rounded-md">{error}</div>
          )}

          <div>
            <label className="text-sm font-medium mb-1 block">{t('Name')}</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-md border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          <div>
            <label className="text-sm font-medium mb-1 block">{t('Description')}</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-md border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          <div className="flex items-center justify-between">
            <label className="text-sm font-medium">{t('User invocable (/skill-name)')}</label>
            <button
              onClick={() => setUserInvocable(!userInvocable)}
              className="p-1"
            >
              {userInvocable ? (
                <ToggleRight className="w-5 h-5 text-primary" />
              ) : (
                <ToggleLeft className="w-5 h-5 text-muted-foreground" />
              )}
            </button>
          </div>

          <div>
            <label className="text-sm font-medium mb-1 block">{t('Content (Markdown)')}</label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={12}
              className="w-full px-3 py-2 text-sm rounded-md border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary font-mono resize-y"
            />
          </div>
        </div>

        <div className="p-4 border-t border-border flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-sm rounded-md border border-border hover:bg-secondary transition-colors"
          >
            {t('Cancel')}
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-3 py-1.5 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center gap-1.5"
          >
            {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {t('Save')}
          </button>
        </div>
      </div>
    </DialogOverlay>
  )
}

// ============================================================================
// Import Skill Dialog
// ============================================================================

interface ImportSkillDialogProps {
  spaceId?: string
  onClose: () => void
  onComplete: () => void
}

function ImportSkillDialog({ spaceId, onClose, onComplete }: ImportSkillDialogProps) {
  const { t } = useTranslation()
  const [mode, setMode] = useState<'url'>('url')
  const [url, setUrl] = useState('')
  const [name, setName] = useState('')
  const [source, setSource] = useState<SkillSource>('user')
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleImport = async () => {
    if (!url.trim() || !name.trim()) {
      setError(t('URL and name are required'))
      return
    }

    setImporting(true)
    setError(null)

    try {
      const result = await api.importSkillFromUrl({
        url: url.trim(),
        name: name.trim(),
        targetLevel: source,
        spaceId: source === 'project' ? spaceId : undefined,
      })

      if (result.success) {
        onComplete()
      } else {
        setError(result.error || 'Failed to import skill')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to import skill')
    } finally {
      setImporting(false)
    }
  }

  return (
    <DialogOverlay onClose={onClose}>
      <div className="bg-card rounded-xl border border-border shadow-xl w-full max-w-lg">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <h3 className="font-medium">{t('Import Skill')}</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">✕</button>
        </div>

        <div className="p-4 space-y-4">
          {error && (
            <div className="text-sm text-destructive p-2 bg-destructive/10 rounded-md">{error}</div>
          )}

          <div>
            <label className="text-sm font-medium mb-1 block">{t('URL')}</label>
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://raw.githubusercontent.com/.../SKILL.md"
              className="w-full px-3 py-2 text-sm rounded-md border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          <div>
            <label className="text-sm font-medium mb-1 block">{t('Skill Name')}</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. imported-skill"
              className="w-full px-3 py-2 text-sm rounded-md border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          <div>
            <label className="text-sm font-medium mb-1 block">{t('Import to')}</label>
            <div className="flex gap-2">
              <button
                onClick={() => setSource('user')}
                className={`flex-1 px-3 py-2 text-sm rounded-md border transition-colors ${
                  source === 'user'
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border hover:bg-secondary'
                }`}
              >
                {t('User (Global)')}
              </button>
              <button
                onClick={() => setSource('project')}
                disabled={!spaceId}
                className={`flex-1 px-3 py-2 text-sm rounded-md border transition-colors ${
                  source === 'project'
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border hover:bg-secondary'
                } ${!spaceId ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                {t('Project')}
              </button>
            </div>
          </div>
        </div>

        <div className="p-4 border-t border-border flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-sm rounded-md border border-border hover:bg-secondary transition-colors"
          >
            {t('Cancel')}
          </button>
          <button
            onClick={handleImport}
            disabled={importing || !url.trim() || !name.trim()}
            className="px-3 py-1.5 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center gap-1.5"
          >
            {importing && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {t('Import')}
          </button>
        </div>
      </div>
    </DialogOverlay>
  )
}

// ============================================================================
// Dialog Overlay
// ============================================================================

function DialogOverlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      {children}
    </div>
  )
}
