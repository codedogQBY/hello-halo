/**
 * Skill Types - Shared type definitions for Skills management
 *
 * Compatible with Claude Code SKILL.md specification.
 * Extended with features from Cursor Rules, Roo Code, Windsurf Rules, and Cline Rules.
 */

// ============================================================================
// Frontmatter Types (SKILL.md YAML header)
// ============================================================================

/**
 * Skill metadata (SKILL.md frontmatter)
 * Fully compatible with Claude Code official standard, with extensions
 */
export interface SkillFrontmatter {
  name?: string
  description?: string
  'user-invocable'?: boolean
  'disable-model-invocation'?: boolean
  'argument-hint'?: string
  'allowed-tools'?: string[]
  model?: string
  context?: 'fork'
  agent?: string

  // Claude Code hooks
  hooks?: SkillHooks

  // Extensions (from other clients)
  'when-to-use'?: string
  globs?: string | string[]
  'always-apply'?: boolean
}

/**
 * Skill lifecycle hooks (Claude Code feature)
 */
export interface SkillHooks {
  'pre-invoke'?: HookConfig[]
  'post-invoke'?: HookConfig[]
}

export interface HookConfig {
  command: string
  timeout?: number
}

// ============================================================================
// Core Types
// ============================================================================

/**
 * Skill source priority level
 * Enterprise > User > Project > Extension
 */
export type SkillSource = 'enterprise' | 'user' | 'project' | 'extension'

/**
 * Complete skill object
 */
export interface Skill {
  id: string
  name: string
  description: string
  userInvocable: boolean
  disableModelInvocation: boolean
  argumentHint?: string
  allowedTools?: string[]
  model?: string
  context?: 'fork'
  agent?: string
  hooks?: SkillHooks
  whenToUse?: string
  globs?: string[]
  alwaysApply?: boolean
  content: string
  resolvedContent?: string
  source: SkillSource
  path: string
  enabled: boolean
  hasSupportingFiles: boolean
  supportingFiles?: string[]
  createdAt: string
  updatedAt: string
  remoteUrl?: string
  compatSource?: 'cursorrules' | 'windsurfrules' | 'agents-md'
}

// ============================================================================
// Request/Response Types
// ============================================================================

/**
 * Create skill request
 */
export interface CreateSkillRequest {
  name: string
  description?: string
  userInvocable?: boolean
  disableModelInvocation?: boolean
  argumentHint?: string
  allowedTools?: string[]
  model?: string
  whenToUse?: string
  globs?: string[]
  alwaysApply?: boolean
  hooks?: SkillHooks
  content: string
  source: SkillSource
  spaceId?: string
}

/**
 * Update skill request
 */
export interface UpdateSkillRequest {
  name?: string
  description?: string
  userInvocable?: boolean
  disableModelInvocation?: boolean
  argumentHint?: string
  allowedTools?: string[]
  model?: string
  whenToUse?: string
  globs?: string[]
  alwaysApply?: boolean
  hooks?: SkillHooks
  content?: string
  source: SkillSource
  spaceId?: string
}

/**
 * GitHub import request
 */
export interface ImportGithubRequest {
  url: string
  targetLevel: SkillSource
  spaceId?: string
  customName?: string
  /** Specific skills to import (by name). If empty, imports all discovered. */
  selectedSkills?: string[]
}

/**
 * Discovered skill from GitHub repository
 */
export interface GithubDiscoveredSkill {
  name: string
  description: string
  path: string
  downloadUrl: string
}

/**
 * GitHub discover response
 */
export interface GithubDiscoverResult {
  success: boolean
  repoUrl: string
  skills: GithubDiscoveredSkill[]
  error?: string
}

/**
 * URL import request
 */
export interface ImportUrlRequest {
  url: string
  targetLevel: SkillSource
  spaceId?: string
  name: string
}

/**
 * Local folder import request
 */
export interface ImportFileRequest {
  localPath: string
  targetLevel: SkillSource
  spaceId?: string
  copyFiles: boolean
}

/**
 * Import result
 */
export interface ImportSkillResult {
  success: boolean
  skill?: Skill
  error?: string
  warnings?: string[]
}

/**
 * Batch import result (for GitHub repo imports)
 */
export interface BatchImportResult {
  success: boolean
  imported: { name: string; skill?: Skill }[]
  failed: { name: string; error: string }[]
  totalDiscovered: number
}

/**
 * Skills list response
 */
export interface SkillsListResponse {
  userSkills: Skill[]
  projectSkills: Skill[]
  compatSkills: Skill[]
  totalCount: number
}

/**
 * Skill validation result
 */
export interface SkillValidationResult {
  valid: boolean
  errors: string[]
  warnings: string[]
}

/**
 * Argument context for variable substitution
 */
export interface SkillArgumentContext {
  raw: string
  args: string[]
}

/**
 * Dynamic context fragment (!`command` syntax)
 */
export interface DynamicContext {
  command: string
  placeholder: string
  output?: string
  error?: string
}

// ============================================================================
// Permission Types
// ============================================================================

/**
 * Skill permission entry
 * Reference: Claude Code /permissions functionality
 */
export interface SkillPermission {
  skillId: string
  action: 'allow' | 'deny'
  scope: 'all' | 'invocation-only'
}

/**
 * Character budget configuration
 * Reference: Claude Code - 2% of context window (minimum 16,000 chars)
 */
export interface SkillCharBudget {
  maxChars: number
  currentUsage: number
  canExpand: boolean
}
