/**
 * SkillCard - Individual skill card in sidebar panel
 * Shows skill name, tags, actions (edit/delete/sync)
 */

import { useState } from 'react'
import { Trash2, Edit, RefreshCw, MoreVertical, Zap, Lock, FileText, ToggleLeft, ToggleRight } from 'lucide-react'
import { useTranslation } from '../../i18n'
import { api } from '../../api'
import type { Skill } from '../../../shared/types/skill'

interface SkillCardProps {
  skill: Skill
  onDelete: () => void
  onUpdate: () => void
  onEdit: (skill: Skill) => void
}

export function SkillCard({ skill, onDelete, onUpdate, onEdit }: SkillCardProps) {
  const { t } = useTranslation()
  const [showMenu, setShowMenu] = useState(false)
  const [isTogglingEnabled, setIsTogglingEnabled] = useState(false)

  const handleToggleEnabled = async () => {
    setIsTogglingEnabled(true)
    try {
      await api.toggleSkill(skill.id, !skill.enabled)
      onUpdate()
    } catch (error) {
      console.error('[SkillCard] Failed to toggle:', error)
    } finally {
      setIsTogglingEnabled(false)
    }
  }

  const isCompat = !!skill.compatSource

  return (
    <div className={`group relative rounded-lg p-2 transition-colors ${
      skill.enabled
        ? 'bg-secondary/30 hover:bg-secondary/50'
        : 'bg-secondary/10 opacity-60'
    }`}>
      {/* Header */}
      <div className="flex items-start justify-between mb-1">
        <div className="flex items-center gap-1.5 min-w-0">
          <Zap className="w-3.5 h-3.5 text-yellow-500 flex-shrink-0" />
          <span className="text-sm font-medium truncate">
            {skill.name}
          </span>
          {!skill.userInvocable && (
            <Lock className="w-3 h-3 text-muted-foreground/50" title={t('Not user-invocable')} />
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          {/* Toggle enabled */}
          <button
            onClick={handleToggleEnabled}
            disabled={isTogglingEnabled}
            className="p-1 hover:bg-secondary rounded"
            title={skill.enabled ? t('Disable') : t('Enable')}
          >
            {skill.enabled ? (
              <ToggleRight className="w-3.5 h-3.5 text-primary" />
            ) : (
              <ToggleLeft className="w-3.5 h-3.5 text-muted-foreground" />
            )}
          </button>

          {!isCompat && (
            <button
              onClick={() => onEdit(skill)}
              className="p-1 hover:bg-secondary rounded"
              title={t('Edit')}
            >
              <Edit className="w-3 h-3" />
            </button>
          )}

          {!isCompat && (
            <div className="relative">
              <button
                onClick={() => setShowMenu(!showMenu)}
                className="p-1 hover:bg-secondary rounded"
              >
                <MoreVertical className="w-3 h-3" />
              </button>

              {showMenu && (
                <div className="absolute right-0 top-full mt-1 bg-popover border border-border rounded-lg shadow-lg py-1 z-10 min-w-[120px]">
                  <button
                    onClick={() => {
                      onDelete()
                      setShowMenu(false)
                    }}
                    className="w-full px-3 py-1.5 text-xs text-left hover:bg-secondary text-destructive flex items-center gap-2"
                  >
                    <Trash2 className="w-3 h-3" />
                    {t('Delete')}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Description */}
      {skill.description && (
        <p className="text-xs text-muted-foreground line-clamp-2 mb-1.5">
          {skill.description}
        </p>
      )}

      {/* Tags */}
      <div className="flex items-center gap-1 flex-wrap">
        <span className={`text-[10px] px-1.5 py-0.5 rounded ${
          skill.source === 'user'
            ? 'bg-blue-500/20 text-blue-400'
            : 'bg-green-500/20 text-green-400'
        }`}>
          {skill.source === 'user' ? t('User') : t('Project')}
        </span>

        {skill.userInvocable && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-secondary text-muted-foreground">
            /{skill.id}
          </span>
        )}

        {isCompat && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400">
            {skill.compatSource}
          </span>
        )}

        {skill.alwaysApply && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-500/10 text-green-600 dark:text-green-400">
            {t('always')}
          </span>
        )}

        {skill.hasSupportingFiles && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-secondary text-muted-foreground flex items-center gap-0.5">
            <FileText className="w-2.5 h-2.5" />
            {skill.supportingFiles?.length}
          </span>
        )}
      </div>
    </div>
  )
}
