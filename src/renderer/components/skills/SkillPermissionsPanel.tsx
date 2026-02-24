/**
 * SkillPermissionsPanel - Manage skill permissions (allow/deny)
 * Reference: Claude Code /permissions functionality
 */

import { useState, useEffect } from 'react'
import { api } from '../../api'
import { Shield, ShieldCheck, ShieldX, Plus, Trash2, Loader2 } from 'lucide-react'
import { useTranslation } from '../../i18n'
import type { SkillPermission, Skill } from '../../../../shared/types/skill'

interface SkillPermissionsPanelProps {
  skills: Skill[]
}

export function SkillPermissionsPanel({ skills }: SkillPermissionsPanelProps) {
  const { t } = useTranslation()
  const [permissions, setPermissions] = useState<SkillPermission[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [showAddForm, setShowAddForm] = useState(false)
  const [selectedSkillId, setSelectedSkillId] = useState('')
  const [selectedAction, setSelectedAction] = useState<'allow' | 'deny'>('allow')
  const [selectedScope, setSelectedScope] = useState<'all' | 'invocation-only'>('invocation-only')

  const loadPermissions = async () => {
    setIsLoading(true)
    try {
      const result = await api.getSkillPermissions()
      if (result.success && result.data) {
        setPermissions(result.data)
      }
    } catch (error) {
      console.error('[SkillPermissionsPanel] Failed to load permissions:', error)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadPermissions()
  }, [])

  const handleAdd = async () => {
    if (!selectedSkillId) return
    try {
      await api.setSkillPermission({
        skillId: selectedSkillId,
        action: selectedAction,
        scope: selectedScope
      })
      setShowAddForm(false)
      setSelectedSkillId('')
      loadPermissions()
    } catch (error) {
      console.error('[SkillPermissionsPanel] Failed to set permission:', error)
    }
  }

  const handleRemove = async (skillId: string, scope: 'all' | 'invocation-only') => {
    try {
      await api.removeSkillPermission(skillId, scope)
      loadPermissions()
    } catch (error) {
      console.error('[SkillPermissionsPanel] Failed to remove permission:', error)
    }
  }

  const handleToggleAction = async (perm: SkillPermission) => {
    const newAction = perm.action === 'allow' ? 'deny' : 'allow'
    try {
      await api.setSkillPermission({
        ...perm,
        action: newAction
      })
      loadPermissions()
    } catch (error) {
      console.error('[SkillPermissionsPanel] Failed to toggle permission:', error)
    }
  }

  // Skills not yet in permissions list
  const availableSkills = skills.filter(
    s => !permissions.some(p => p.skillId === s.id)
  )

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Shield className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-medium">{t('Permissions')}</h3>
        </div>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="flex items-center gap-1 px-2 py-1 text-xs bg-secondary hover:bg-secondary/80 rounded-lg transition-colors"
        >
          <Plus className="w-3 h-3" />
          {t('Add')}
        </button>
      </div>

      {/* Add Form */}
      {showAddForm && (
        <div className="p-3 bg-secondary/30 rounded-lg border border-border space-y-3">
          {/* Skill select */}
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">{t('Select skill')}</label>
            <select
              value={selectedSkillId}
              onChange={e => setSelectedSkillId(e.target.value)}
              className="w-full px-3 py-1.5 bg-secondary/50 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            >
              <option value="">--</option>
              {availableSkills.map(s => (
                <option key={s.id} value={s.id}>{s.name} ({s.source})</option>
              ))}
            </select>
          </div>

          {/* Action */}
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">{t('Action')}</label>
            <div className="flex gap-2">
              <button
                onClick={() => setSelectedAction('allow')}
                className={`flex-1 px-3 py-1.5 rounded-lg text-xs border transition-colors ${
                  selectedAction === 'allow'
                    ? 'border-green-500 bg-green-500/10 text-green-600'
                    : 'border-border hover:bg-secondary'
                }`}
              >
                {t('Allow')}
              </button>
              <button
                onClick={() => setSelectedAction('deny')}
                className={`flex-1 px-3 py-1.5 rounded-lg text-xs border transition-colors ${
                  selectedAction === 'deny'
                    ? 'border-red-500 bg-red-500/10 text-red-600'
                    : 'border-border hover:bg-secondary'
                }`}
              >
                {t('Deny')}
              </button>
            </div>
          </div>

          {/* Scope */}
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">{t('Scope')}</label>
            <div className="flex gap-2">
              <button
                onClick={() => setSelectedScope('invocation-only')}
                className={`flex-1 px-3 py-1.5 rounded-lg text-xs border transition-colors ${
                  selectedScope === 'invocation-only'
                    ? 'border-primary bg-primary/10'
                    : 'border-border hover:bg-secondary'
                }`}
              >
                Skill({selectedSkillId || 'name'})
              </button>
              <button
                onClick={() => setSelectedScope('all')}
                className={`flex-1 px-3 py-1.5 rounded-lg text-xs border transition-colors ${
                  selectedScope === 'all'
                    ? 'border-primary bg-primary/10'
                    : 'border-border hover:bg-secondary'
                }`}
              >
                Skill({selectedSkillId || 'name'} *)
              </button>
            </div>
            <p className="text-[10px] text-muted-foreground mt-1">
              {selectedScope === 'all'
                ? t('Controls skill invocation and all tool calls within the skill')
                : t('Controls skill invocation only')}
            </p>
          </div>

          {/* Submit */}
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setShowAddForm(false)}
              className="px-3 py-1.5 text-xs hover:bg-secondary rounded-lg"
            >
              {t('Cancel')}
            </button>
            <button
              onClick={handleAdd}
              disabled={!selectedSkillId}
              className="px-3 py-1.5 text-xs bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50"
            >
              {t('Save')}
            </button>
          </div>
        </div>
      )}

      {/* Permissions List */}
      {permissions.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-4">
          {t('No permission rules configured. All skills are allowed by default.')}
        </p>
      ) : (
        <div className="space-y-1">
          {permissions.map((perm, idx) => (
            <div
              key={`${perm.skillId}-${perm.scope}-${idx}`}
              className="flex items-center gap-2 px-3 py-2 bg-secondary/30 rounded-lg group"
            >
              {/* Icon */}
              <button
                onClick={() => handleToggleAction(perm)}
                className="shrink-0"
                title={perm.action === 'allow' ? t('Click to deny') : t('Click to allow')}
              >
                {perm.action === 'allow' ? (
                  <ShieldCheck className="w-4 h-4 text-green-500" />
                ) : (
                  <ShieldX className="w-4 h-4 text-red-500" />
                )}
              </button>

              {/* Expression */}
              <div className="flex-1 min-w-0">
                <span className="text-sm font-mono">
                  Skill({perm.skillId}{perm.scope === 'all' ? ' *' : ''})
                </span>
              </div>

              {/* Action badge */}
              <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                perm.action === 'allow'
                  ? 'bg-green-500/20 text-green-600'
                  : 'bg-red-500/20 text-red-600'
              }`}>
                {perm.action === 'allow' ? t('Allow') : t('Deny')}
              </span>

              {/* Remove */}
              <button
                onClick={() => handleRemove(perm.skillId, perm.scope)}
                className="p-1 hover:bg-secondary rounded opacity-0 group-hover:opacity-100 transition-opacity"
                title={t('Remove')}
              >
                <Trash2 className="w-3 h-3 text-muted-foreground" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
