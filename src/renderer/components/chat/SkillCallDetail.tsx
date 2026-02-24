/**
 * SkillCallDetail - Expandable detail view for Skill invocations in chat
 * Shows skill name, arguments, and optionally the skill instructions content
 */

import { Sparkles, ChevronDown, ChevronUp } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from '../../i18n'

interface SkillCallDetailProps {
  skillId: string
  args?: string
  skillContent?: string
}

export function SkillCallDetail({ skillId, args, skillContent }: SkillCallDetailProps) {
  const [expanded, setExpanded] = useState(false)
  const { t } = useTranslation()

  return (
    <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg overflow-hidden mt-2">
      {/* Header */}
      <div
        className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-yellow-500/10 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <Sparkles className="w-4 h-4 text-yellow-500 shrink-0" />
        <span className="text-sm font-medium">/{skillId}</span>
        {args && (
          <span className="text-xs text-muted-foreground truncate flex-1">
            {args}
          </span>
        )}
        {skillContent && (
          expanded ? (
            <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" />
          ) : (
            <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
          )
        )}
      </div>

      {/* Expanded content */}
      {expanded && skillContent && (
        <div className="px-3 py-2 border-t border-yellow-500/20 bg-background/50">
          <p className="text-xs text-muted-foreground mb-2">{t('Skill instructions')}:</p>
          <div className="text-xs text-foreground/80 whitespace-pre-wrap break-words max-h-[200px] overflow-auto">
            {skillContent}
          </div>
        </div>
      )}
    </div>
  )
}
