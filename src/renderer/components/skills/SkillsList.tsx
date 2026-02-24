/**
 * SkillsList - Skills panel for ArtifactRail sidebar
 * Shows user/project/compat skills with create/import actions
 */

import { useState, useEffect, useCallback } from 'react'
import { Plus, Download, RefreshCw, Wand2, Loader2, Check, Github } from 'lucide-react'
import { api } from '../../api'
import { useSpaceStore } from '../../stores/space.store'
import { SkillCard } from './SkillCard'
import { useTranslation } from '../../i18n'
import type { Skill, SkillsListResponse, SkillSource, CreateSkillRequest, UpdateSkillRequest, GithubDiscoveredSkill } from '../../../shared/types/skill'

export function SkillsList() {
  const { t } = useTranslation()
  const currentSpace = useSpaceStore(state => state.currentSpace)

  const [skills, setSkills] = useState<SkillsListResponse | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [showImportDialog, setShowImportDialog] = useState(false)
  const [editingSkill, setEditingSkill] = useState<Skill | null>(null)

  const loadSkills = useCallback(async () => {
    setIsLoading(true)
    try {
      const result = await api.listSkills(currentSpace?.id)
      if (result.success && result.data) {
        setSkills(result.data)
      }
    } catch (error) {
      console.error('[SkillsList] Failed to load skills:', error)
    } finally {
      setIsLoading(false)
    }
  }, [currentSpace?.id])

  useEffect(() => {
    loadSkills()
  }, [loadSkills])

  const handleDelete = async (skill: Skill) => {
    if (!confirm(t('Are you sure you want to delete this skill?'))) return
    try {
      await api.deleteSkill(skill.id, skill.source, currentSpace?.id)
      loadSkills()
    } catch (error) {
      console.error('[SkillsList] Failed to delete skill:', error)
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const totalSkills = (skills?.userSkills.length || 0) + (skills?.projectSkills.length || 0)

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex-shrink-0 p-2 border-b border-border">
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            {totalSkills} {t('skills')}
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={loadSkills}
              className="p-1.5 hover:bg-secondary rounded transition-colors"
              title={t('Refresh')}
            >
              <RefreshCw className="w-3.5 h-3.5 text-muted-foreground" />
            </button>
            <button
              onClick={() => setShowImportDialog(true)}
              className="p-1.5 hover:bg-secondary rounded transition-colors"
              title={t('Import Skill')}
            >
              <Download className="w-3.5 h-3.5 text-muted-foreground" />
            </button>
            <button
              onClick={() => setShowCreateDialog(true)}
              className="p-1.5 hover:bg-secondary rounded transition-colors"
              title={t('Create Skill')}
            >
              <Plus className="w-3.5 h-3.5 text-muted-foreground" />
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-2">
        {/* User Skills */}
        {skills?.userSkills && skills.userSkills.length > 0 && (
          <div className="mb-3">
            <h3 className="text-xs font-medium text-muted-foreground mb-2 px-1 uppercase tracking-wider">
              {t('User Skills')}
            </h3>
            <div className="space-y-1.5">
              {skills.userSkills.map(skill => (
                <SkillCard
                  key={`user-${skill.id}`}
                  skill={skill}
                  onDelete={() => handleDelete(skill)}
                  onUpdate={loadSkills}
                  onEdit={(s) => setEditingSkill(s)}
                />
              ))}
            </div>
          </div>
        )}

        {/* Project Skills */}
        {skills?.projectSkills && skills.projectSkills.length > 0 && (
          <div className="mb-3">
            <h3 className="text-xs font-medium text-muted-foreground mb-2 px-1 uppercase tracking-wider">
              {t('Project Skills')}
            </h3>
            <div className="space-y-1.5">
              {skills.projectSkills.map(skill => (
                <SkillCard
                  key={`project-${skill.id}`}
                  skill={skill}
                  onDelete={() => handleDelete(skill)}
                  onUpdate={loadSkills}
                  onEdit={(s) => setEditingSkill(s)}
                />
              ))}
            </div>
          </div>
        )}

        {/* Compat Skills */}
        {skills?.compatSkills && skills.compatSkills.length > 0 && (
          <div className="mb-3">
            <h3 className="text-xs font-medium text-muted-foreground mb-2 px-1 uppercase tracking-wider">
              {t('Detected Rules')}
            </h3>
            <div className="space-y-1.5">
              {skills.compatSkills.map(skill => (
                <SkillCard
                  key={`compat-${skill.id}`}
                  skill={skill}
                  onDelete={() => handleDelete(skill)}
                  onUpdate={loadSkills}
                  onEdit={(s) => setEditingSkill(s)}
                />
              ))}
            </div>
          </div>
        )}

        {/* Empty State */}
        {totalSkills === 0 && (!skills?.compatSkills || skills.compatSkills.length === 0) && (
          <div className="flex flex-col items-center justify-center h-full text-center px-4">
            <div className="w-12 h-12 rounded-full border-2 border-dashed border-muted-foreground/30 flex items-center justify-center mb-3">
              <Wand2 className="w-6 h-6 text-muted-foreground/50" />
            </div>
            <p className="text-xs text-muted-foreground mb-2">
              {t('No skills yet')}
            </p>
            <p className="text-xs text-muted-foreground/60">
              {t('Create or import skills to extend AI capabilities')}
            </p>
          </div>
        )}
      </div>

      {/* Create Dialog */}
      {showCreateDialog && (
        <SkillCreateDialog
          spaceId={currentSpace?.id}
          onClose={() => setShowCreateDialog(false)}
          onComplete={() => {
            setShowCreateDialog(false)
            loadSkills()
          }}
        />
      )}

      {/* Edit Dialog */}
      {editingSkill && (
        <SkillEditDialog
          skill={editingSkill}
          spaceId={currentSpace?.id}
          onClose={() => setEditingSkill(null)}
          onComplete={() => {
            setEditingSkill(null)
            loadSkills()
          }}
        />
      )}

      {/* Import Dialog */}
      {showImportDialog && (
        <SkillImportDialog
          spaceId={currentSpace?.id}
          onClose={() => setShowImportDialog(false)}
          onComplete={() => {
            setShowImportDialog(false)
            loadSkills()
          }}
        />
      )}
    </div>
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

// ============================================================================
// Create Dialog (compact sidebar version)
// ============================================================================

interface SkillCreateDialogProps {
  spaceId?: string
  onClose: () => void
  onComplete: () => void
}

function SkillCreateDialog({ spaceId, onClose, onComplete }: SkillCreateDialogProps) {
  const { t } = useTranslation()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [content, setContent] = useState('')
  const [source, setSource] = useState<SkillSource>('user')
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
        userInvocable: true,
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
            <label className="text-sm font-medium mb-1 block">{t('Skill Name')}</label>
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

          <div>
            <label className="text-sm font-medium mb-1 block">{t('Content (Markdown)')}</label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder={t('Enter skill prompt content...')}
              rows={8}
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
// Edit Dialog
// ============================================================================

interface SkillEditDialogProps {
  skill: Skill
  spaceId?: string
  onClose: () => void
  onComplete: () => void
}

function SkillEditDialog({ skill, spaceId, onClose, onComplete }: SkillEditDialogProps) {
  const { t } = useTranslation()
  const [name, setName] = useState(skill.name)
  const [description, setDescription] = useState(skill.description)
  const [content, setContent] = useState(skill.content)
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
            <label className="text-sm font-medium mb-1 block">{t('Skill Name')}</label>
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
// Import Dialog
// ============================================================================

interface SkillImportDialogProps {
  spaceId?: string
  onClose: () => void
  onComplete: () => void
}

function SkillImportDialog({ spaceId, onClose, onComplete }: SkillImportDialogProps) {
  const { t } = useTranslation()
  const [importMode, setImportMode] = useState<'github' | 'url' | 'folder'>('github')
  const [url, setUrl] = useState('')
  const [name, setName] = useState('')
  const [folderPath, setFolderPath] = useState('')
  const [githubUrl, setGithubUrl] = useState('')
  const [source, setSource] = useState<SkillSource>('user')
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // GitHub discover state
  const [discovering, setDiscovering] = useState(false)
  const [discoveredSkills, setDiscoveredSkills] = useState<GithubDiscoveredSkill[]>([])
  const [selectedSkills, setSelectedSkills] = useState<Set<string>>(new Set())
  const [hasDiscovered, setHasDiscovered] = useState(false)

  const handleSelectFolder = async () => {
    try {
      const result = await api.selectFolder()
      if (result.success && result.data) {
        setFolderPath(result.data as string)
      }
    } catch (err) {
      console.error('[SkillImportDialog] Failed to select folder:', err)
    }
  }

  const handleDiscover = async () => {
    if (!githubUrl.trim()) {
      setError(t('Please enter a GitHub URL'))
      return
    }

    setDiscovering(true)
    setError(null)
    setDiscoveredSkills([])
    setSelectedSkills(new Set())
    setHasDiscovered(false)

    try {
      const result = await api.discoverGithubSkills(githubUrl.trim())
      if (result.success && result.data) {
        const skills = result.data.skills || []
        setDiscoveredSkills(skills)
        setSelectedSkills(new Set(skills.map(s => s.name)))
        setHasDiscovered(true)
        if (skills.length === 0) {
          setError(t('No skills found in this repository'))
        }
      } else {
        setError(result.error || 'Failed to discover skills')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to discover skills')
    } finally {
      setDiscovering(false)
    }
  }

  const toggleSkillSelection = (skillName: string) => {
    setSelectedSkills(prev => {
      const next = new Set(prev)
      if (next.has(skillName)) {
        next.delete(skillName)
      } else {
        next.add(skillName)
      }
      return next
    })
  }

  const toggleSelectAll = () => {
    if (selectedSkills.size === discoveredSkills.length) {
      setSelectedSkills(new Set())
    } else {
      setSelectedSkills(new Set(discoveredSkills.map(s => s.name)))
    }
  }

  const handleImport = async () => {
    if (importMode === 'github') {
      if (!hasDiscovered || selectedSkills.size === 0) return

      setImporting(true)
      setError(null)
      try {
        const result = await api.importFromGithub({
          url: githubUrl.trim(),
          targetLevel: source,
          spaceId: source === 'project' ? spaceId : undefined,
          selectedSkills: Array.from(selectedSkills),
        })
        if (result.success) {
          const data = result.data
          if (data && data.failed && data.failed.length > 0) {
            const importedCount = data.imported?.length || 0
            if (importedCount > 0) {
              onComplete()
            } else {
              setError(data.failed.map((f: { name: string; error: string }) => `${f.name}: ${f.error}`).join('\n'))
            }
          } else {
            onComplete()
          }
        } else {
          setError(result.error || 'Failed to import skills')
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to import skills')
      } finally {
        setImporting(false)
      }
      return
    }

    if (importMode === 'url') {
      if (!url.trim() || !name.trim()) {
        setError(t('URL and name are required'))
        return
      }
    } else {
      if (!folderPath.trim()) {
        setError(t('Please select a folder'))
        return
      }
    }

    setImporting(true)
    setError(null)

    try {
      let result
      if (importMode === 'url') {
        result = await api.importSkillFromUrl({
          url: url.trim(),
          name: name.trim(),
          targetLevel: source,
          spaceId: source === 'project' ? spaceId : undefined,
        })
      } else {
        result = await api.importSkillFromLocal({
          localPath: folderPath.trim(),
          targetLevel: source,
          spaceId: source === 'project' ? spaceId : undefined,
          copyFiles: true,
        })
      }

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

  const isImportDisabled = importing || (
    importMode === 'github'
      ? (!hasDiscovered || selectedSkills.size === 0)
      : importMode === 'url'
        ? (!url.trim() || !name.trim())
        : !folderPath.trim()
  )

  return (
    <DialogOverlay onClose={onClose}>
      <div className="bg-card rounded-xl border border-border shadow-xl w-full max-w-lg max-h-[85vh] flex flex-col">
        <div className="p-4 border-b border-border flex items-center justify-between flex-shrink-0">
          <h3 className="font-medium">{t('Import Skill')}</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">✕</button>
        </div>

        <div className="p-4 space-y-4 overflow-auto flex-1">
          {error && (
            <div className="text-sm text-destructive p-2 bg-destructive/10 rounded-md whitespace-pre-line">{error}</div>
          )}

          {/* Import mode switcher */}
          <div className="flex gap-1 p-1 bg-secondary/50 rounded-lg">
            <button
              onClick={() => setImportMode('github')}
              className={`flex-1 px-2 py-1.5 text-xs font-medium rounded-md transition-colors ${
                importMode === 'github'
                  ? 'bg-card text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              GitHub
            </button>
            <button
              onClick={() => setImportMode('url')}
              className={`flex-1 px-2 py-1.5 text-xs font-medium rounded-md transition-colors ${
                importMode === 'url'
                  ? 'bg-card text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              URL
            </button>
            <button
              onClick={() => setImportMode('folder')}
              className={`flex-1 px-2 py-1.5 text-xs font-medium rounded-md transition-colors ${
                importMode === 'folder'
                  ? 'bg-card text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {t('Folder')}
            </button>
          </div>

          {importMode === 'github' ? (
            <>
              <div>
                <label className="text-sm font-medium mb-1 block">{t('GitHub Repository')}</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={githubUrl}
                    onChange={(e) => {
                      setGithubUrl(e.target.value)
                      setHasDiscovered(false)
                      setDiscoveredSkills([])
                    }}
                    placeholder="e.g. vercel-labs/skills"
                    className="flex-1 px-3 py-2 text-sm rounded-md border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                    onKeyDown={(e) => { if (e.key === 'Enter') handleDiscover() }}
                  />
                  <button
                    onClick={handleDiscover}
                    disabled={discovering || !githubUrl.trim()}
                    className="px-3 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center gap-1.5 whitespace-nowrap"
                  >
                    {discovering ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Github className="w-3.5 h-3.5" />}
                    {t('Discover')}
                  </button>
                </div>
                <p className="text-xs text-muted-foreground mt-1.5">
                  {t('Supports owner/repo shorthand or full GitHub URL')}
                </p>
              </div>

              {/* Discovered skills list */}
              {hasDiscovered && discoveredSkills.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-sm font-medium">
                      {t('Found {{count}} skills', { count: discoveredSkills.length })}
                    </label>
                    <button
                      onClick={toggleSelectAll}
                      className="text-xs text-primary hover:text-primary/80 transition-colors"
                    >
                      {selectedSkills.size === discoveredSkills.length ? t('Deselect all') : t('Select all')}
                    </button>
                  </div>
                  <div className="border border-border rounded-lg max-h-48 overflow-auto">
                    {discoveredSkills.map((skill) => (
                      <div
                        key={skill.name}
                        onClick={() => toggleSkillSelection(skill.name)}
                        className="flex items-start gap-3 p-2.5 hover:bg-secondary/50 cursor-pointer border-b border-border last:border-b-0 transition-colors"
                      >
                        <div className="pt-0.5">
                          <div
                            className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${
                              selectedSkills.has(skill.name)
                                ? 'bg-primary border-primary text-primary-foreground'
                                : 'border-muted-foreground/40 hover:border-primary'
                            }`}
                          >
                            {selectedSkills.has(skill.name) && <Check className="w-3 h-3" />}
                          </div>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate">{skill.name}</div>
                          {skill.description && (
                            <div className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{skill.description}</div>
                          )}
                          <div className="text-xs text-muted-foreground/60 mt-0.5 truncate">{skill.path}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : importMode === 'url' ? (
            <>
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
            </>
          ) : (
            <div>
              <label className="text-sm font-medium mb-1 block">{t('Skill Folder')}</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={folderPath}
                  readOnly
                  placeholder={t('Select a folder containing SKILL.md')}
                  className="flex-1 px-3 py-2 text-sm rounded-md border border-border bg-background text-muted-foreground"
                />
                <button
                  onClick={handleSelectFolder}
                  className="px-3 py-2 text-sm rounded-md border border-border hover:bg-secondary transition-colors whitespace-nowrap"
                >
                  {t('Browse')}
                </button>
              </div>
              <p className="text-xs text-muted-foreground mt-1.5">
                {t('The folder should contain a SKILL.md file')}
              </p>
            </div>
          )}

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

        <div className="p-4 border-t border-border flex justify-end gap-2 flex-shrink-0">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-sm rounded-md border border-border hover:bg-secondary transition-colors"
          >
            {t('Cancel')}
          </button>
          <button
            onClick={handleImport}
            disabled={isImportDisabled}
            className="px-3 py-1.5 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center gap-1.5"
          >
            {importing && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {importMode === 'github' && selectedSkills.size > 0
              ? t('Import {{count}} skills', { count: selectedSkills.size })
              : t('Import')}
          </button>
        </div>
      </div>
    </DialogOverlay>
  )
}
