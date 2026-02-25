/**
 * Skills Service - Manages skill CRUD, parsing, import/export
 *
 * Follows the project's functional service pattern.
 * Skills are stored as directories containing SKILL.md files.
 * Supports user-level and project-level skills.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, statSync, rmSync, renameSync, copyFileSync, mkdtempSync } from 'fs'
import { join, basename, relative, dirname } from 'path'
import { app } from 'electron'
import { execFileSync } from 'child_process'
import { tmpdir } from 'os'
import { getHaloDir } from './config.service'
import { getSpace } from './space.service'
import type {
  Skill,
  SkillFrontmatter,
  SkillSource,
  SkillArgumentContext,
  DynamicContext,
  CreateSkillRequest,
  UpdateSkillRequest,
  ImportGithubRequest,
  ImportUrlRequest,
  ImportFileRequest,
  ImportSkillResult,
  SkillsListResponse,
  SkillValidationResult,
  GithubDiscoveredSkill,
  GithubDiscoverResult,
  BatchImportResult
} from '../../shared/types/skill'

// ============================================================================
// Path Management
// ============================================================================

function getUserSkillsDir(): string {
  // MUST match CLAUDE_CONFIG_DIR used by SDK (see sdk-config.ts buildSdkEnv)
  // so that CLI's --setting-sources user can discover skills from the same path
  const dir = join(app.getPath('userData'), 'claude-config', 'skills')
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }

  // Migrate skills from old path (~/.halo/claude-config/skills/) if they exist
  migrateOldSkills(dir)

  return dir
}

/**
 * One-time migration: copy skills from old ~/.halo/claude-config/skills/ to new path
 */
let migrationDone = false
function migrateOldSkills(newDir: string): void {
  if (migrationDone) return
  migrationDone = true

  try {
    const oldDir = join(getHaloDir(), 'claude-config', 'skills')
    if (!existsSync(oldDir) || oldDir === newDir) return

    const entries = readdirSync(oldDir, { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const newPath = join(newDir, entry.name)
      if (!existsSync(newPath)) {
        copyDirRecursive(join(oldDir, entry.name), newPath)
        console.log(`[Skills] Migrated skill "${entry.name}" from old path`)
      }
    }
  } catch (error) {
    console.warn('[Skills] Migration from old path failed:', error)
  }
}

function getProjectSkillsDir(spaceId: string): string {
  const spacePath = getSpacePath(spaceId)
  if (!spacePath) return ''
  return join(spacePath, '.claude', 'skills')
}

function getSpacePath(spaceId: string): string {
  const space = getSpace(spaceId)
  if (!space) return ''
  return space.workingDir || space.path
}

// ============================================================================
// SKILL.md Parsing & Generation
// ============================================================================

function parseSkillMd(content: string): { frontmatter: SkillFrontmatter; body: string } {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/)

  if (!match) {
    return { frontmatter: {}, body: content.trim() }
  }

  try {
    const frontmatter = parseYamlFrontmatter(match[1])
    return { frontmatter, body: match[2].trim() }
  } catch (error) {
    console.error('[SkillsService] Failed to parse frontmatter:', error)
    return { frontmatter: {}, body: content.trim() }
  }
}

/**
 * Simple YAML frontmatter parser (avoids js-yaml dependency)
 * Supports: string, boolean, number, string arrays, nested objects (1-level)
 */
function parseYamlFrontmatter(yaml: string): SkillFrontmatter {
  const result: Record<string, unknown> = {}
  const lines = yaml.split('\n')
  let currentKey = ''
  let currentArray: string[] | null = null

  for (const line of lines) {
    // Array item
    if (line.match(/^\s+-\s+/) && currentKey) {
      const value = line.replace(/^\s+-\s+/, '').trim()
      if (currentArray) {
        currentArray.push(unquote(value))
      }
      continue
    }

    // Save previous array
    if (currentArray && currentKey) {
      result[currentKey] = currentArray
      currentArray = null
    }

    // Key-value pair
    const kvMatch = line.match(/^([\w-]+):\s*(.*)$/)
    if (kvMatch) {
      currentKey = kvMatch[1]
      const value = kvMatch[2].trim()

      if (value === '') {
        // Could be a nested object or array - peek ahead
        currentArray = []
        continue
      }

      result[currentKey] = parseYamlValue(value)
      currentArray = null
    }
  }

  // Save last array
  if (currentArray && currentKey) {
    result[currentKey] = currentArray
  }

  return result as SkillFrontmatter
}

function parseYamlValue(value: string): unknown {
  if (value === 'true') return true
  if (value === 'false') return false
  if (value === 'null' || value === '~') return undefined
  if (/^-?\d+$/.test(value)) return parseInt(value, 10)
  if (/^-?\d+\.\d+$/.test(value)) return parseFloat(value)
  return unquote(value)
}

function unquote(s: string): string {
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    return s.slice(1, -1)
  }
  return s
}

function generateSkillMd(skill: Partial<Skill>): string {
  const lines: string[] = []

  const addField = (key: string, value: unknown) => {
    if (value === undefined || value === null) return
    if (typeof value === 'boolean') {
      lines.push(`${key}: ${value}`)
    } else if (Array.isArray(value) && value.length > 0) {
      lines.push(`${key}:`)
      for (const item of value) {
        lines.push(`  - ${item}`)
      }
    } else if (typeof value === 'string' && value) {
      lines.push(`${key}: ${value}`)
    }
  }

  addField('name', skill.name)
  addField('description', skill.description)
  if (skill.userInvocable === false) addField('user-invocable', false)
  if (skill.disableModelInvocation) addField('disable-model-invocation', true)
  addField('argument-hint', skill.argumentHint)
  addField('allowed-tools', skill.allowedTools)
  addField('model', skill.model)
  addField('context', skill.context)
  addField('agent', skill.agent)
  addField('when-to-use', skill.whenToUse)
  addField('globs', skill.globs)
  if (skill.alwaysApply) addField('always-apply', true)

  const hasFrontmatter = lines.length > 0
  const frontmatterStr = hasFrontmatter
    ? `---\n${lines.join('\n')}\n---\n\n`
    : ''

  return frontmatterStr + (skill.content || '')
}

// ============================================================================
// Skill Loading
// ============================================================================

function loadSkill(skillPath: string, source: SkillSource): Skill | null {
  const skillFile = join(skillPath, 'SKILL.md')

  if (!existsSync(skillFile)) {
    return null
  }

  try {
    const content = readFileSync(skillFile, 'utf-8')
    const { frontmatter, body } = parseSkillMd(content)
    const stats = statSync(skillPath)
    const fileStats = statSync(skillFile)
    const supportingFiles = getSupportingFiles(skillPath)
    const id = basename(skillPath)

    return {
      id,
      name: frontmatter.name || id,
      description: frontmatter.description || extractDescription(body),
      userInvocable: frontmatter['user-invocable'] !== false,
      disableModelInvocation: frontmatter['disable-model-invocation'] || false,
      argumentHint: frontmatter['argument-hint'],
      allowedTools: frontmatter['allowed-tools'],
      model: frontmatter.model,
      context: frontmatter.context,
      agent: frontmatter.agent,
      hooks: frontmatter.hooks,
      whenToUse: frontmatter['when-to-use'],
      globs: normalizeGlobs(frontmatter.globs),
      alwaysApply: frontmatter['always-apply'],
      content: body,
      source,
      path: skillPath,
      enabled: true,
      hasSupportingFiles: supportingFiles.length > 0,
      supportingFiles: supportingFiles.length > 0 ? supportingFiles : undefined,
      createdAt: stats.birthtime.toISOString(),
      updatedAt: fileStats.mtime.toISOString()
    }
  } catch (error) {
    console.error(`[SkillsService] Failed to load skill: ${skillPath}`, error)
    return null
  }
}

function loadSkillsFromDir(dir: string, source: SkillSource): Skill[] {
  if (!existsSync(dir)) {
    return []
  }

  const skills: Skill[] = []
  const entries = readdirSync(dir, { withFileTypes: true })

  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    if (entry.name.startsWith('.')) continue

    const skillPath = join(dir, entry.name)
    const skill = loadSkill(skillPath, source)
    if (skill) {
      skills.push(skill)
    }
  }

  return skills.sort((a, b) => a.name.localeCompare(b.name))
}

function getSupportingFiles(skillPath: string): string[] {
  const files: string[] = []
  try {
    const entries = readdirSync(skillPath, { withFileTypes: true })
    for (const entry of entries) {
      if (entry.name === 'SKILL.md') continue
      if (entry.isFile()) {
        files.push(entry.name)
      } else if (entry.isDirectory()) {
        const subDir = join(skillPath, entry.name)
        const subEntries = readdirSync(subDir, { withFileTypes: true })
        for (const sub of subEntries) {
          if (sub.isFile()) {
            files.push(join(entry.name, sub.name))
          }
        }
      }
    }
  } catch {
    // ignore errors
  }
  return files
}

function extractDescription(body: string): string {
  const firstParagraph = body.split('\n\n')[0]
  if (firstParagraph && !firstParagraph.startsWith('#')) {
    return firstParagraph.slice(0, 200)
  }
  return ''
}

function normalizeGlobs(globs: unknown): string[] | undefined {
  if (typeof globs === 'string') return [globs]
  if (Array.isArray(globs)) return globs.filter(g => typeof g === 'string')
  return undefined
}

function sanitizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

// ============================================================================
// Enabled/Disabled State
// ============================================================================

function getEnabledConfigPath(): string {
  return join(getHaloDir(), 'skills-enabled.json')
}

function getEnabledConfig(): Record<string, boolean> {
  const configPath = getEnabledConfigPath()
  if (!existsSync(configPath)) return {}
  try {
    return JSON.parse(readFileSync(configPath, 'utf-8'))
  } catch {
    return {}
  }
}

function saveEnabledConfig(config: Record<string, boolean>): void {
  const configPath = getEnabledConfigPath()
  writeFileSync(configPath, JSON.stringify(config, null, 2))
}

function applyEnabledState(skills: Skill[]): void {
  const enabledConfig = getEnabledConfig()
  for (const skill of skills) {
    if (skill.compatSource) {
      skill.enabled = true
    } else {
      skill.enabled = enabledConfig[skill.id] !== false
    }
  }
}

// ============================================================================
// Compat Format Discovery
// ============================================================================

function discoverCompatSkills(projectRoot: string): Skill[] {
  if (!projectRoot || !existsSync(projectRoot)) return []

  const skills: Skill[] = []

  const compatFiles: Array<{
    file: string
    source: Skill['compatSource']
  }> = [
    { file: '.cursorrules', source: 'cursorrules' },
    { file: '.windsurfrules', source: 'windsurfrules' },
    { file: 'AGENTS.md', source: 'agents-md' },
  ]

  for (const { file, source } of compatFiles) {
    const filePath = join(projectRoot, file)
    if (existsSync(filePath)) {
      try {
        const content = readFileSync(filePath, 'utf-8')
        if (content.trim()) {
          const stats = statSync(filePath)
          skills.push({
            id: `compat-${source}`,
            name: file,
            description: `Auto-detected from ${file}`,
            userInvocable: false,
            disableModelInvocation: false,
            alwaysApply: true,
            content,
            source: 'project',
            path: filePath,
            enabled: true,
            hasSupportingFiles: false,
            createdAt: stats.birthtime.toISOString(),
            updatedAt: stats.mtime.toISOString(),
            compatSource: source,
          })
        }
      } catch {
        // ignore read errors
      }
    }
  }

  // Check .cursor/rules/*.mdc files
  const cursorRulesDir = join(projectRoot, '.cursor', 'rules')
  if (existsSync(cursorRulesDir)) {
    try {
      const mdcFiles = readdirSync(cursorRulesDir).filter(f => f.endsWith('.mdc'))
      for (const mdcFile of mdcFiles) {
        const filePath = join(cursorRulesDir, mdcFile)
        const content = readFileSync(filePath, 'utf-8')
        const { frontmatter, body } = parseSkillMd(content)
        const stats = statSync(filePath)
        const baseName = basename(mdcFile, '.mdc')

        skills.push({
          id: `compat-cursor-${baseName}`,
          name: baseName,
          description: frontmatter.description || `Cursor rule from ${mdcFile}`,
          userInvocable: false,
          disableModelInvocation: false,
          alwaysApply: (frontmatter as Record<string, unknown>).alwaysApply === true,
          globs: normalizeGlobs((frontmatter as Record<string, unknown>).globs),
          content: body,
          source: 'project',
          path: filePath,
          enabled: true,
          hasSupportingFiles: false,
          createdAt: stats.birthtime.toISOString(),
          updatedAt: stats.mtime.toISOString(),
          compatSource: 'cursorrules',
        })
      }
    } catch {
      // ignore errors
    }
  }

  return skills
}

// ============================================================================
// Monorepo Discovery
// ============================================================================

function discoverMonorepoSkills(projectRoot: string, maxDepth = 4): Skill[] {
  if (!projectRoot || !existsSync(projectRoot)) return []

  const skills: Skill[] = []
  const ignoreDirs = new Set(['node_modules', '.git', 'dist', 'build', 'out', '.next', '.nuxt'])

  function walk(dir: string, depth: number): void {
    if (depth > maxDepth) return
    if (!existsSync(dir)) return

    let entries
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }

    for (const entry of entries) {
      if (!entry.isDirectory() || ignoreDirs.has(entry.name)) continue

      const subPath = join(dir, entry.name)

      if (entry.name === '.claude') {
        const skillsDir = join(subPath, 'skills')
        // Skip root .claude/skills/ (already handled in main flow)
        if (dir !== projectRoot && existsSync(skillsDir)) {
          const subSkills = loadSkillsFromDir(skillsDir, 'project')
          const relativePath = relative(projectRoot, dir)
          for (const skill of subSkills) {
            skill.id = `${relativePath}/${skill.id}`
            skills.push(skill)
          }
        }
      } else {
        walk(subPath, depth + 1)
      }
    }
  }

  walk(projectRoot, 0)
  return skills
}

// ============================================================================
// Remote Metadata
// ============================================================================

function getRemoteMetadataPath(): string {
  return join(getHaloDir(), 'skills-remotes.json')
}

function getRemoteMetadata(skillId: string): Record<string, string> | null {
  const metaPath = getRemoteMetadataPath()
  if (!existsSync(metaPath)) return null
  try {
    const all = JSON.parse(readFileSync(metaPath, 'utf-8'))
    return all[skillId] || null
  } catch {
    return null
  }
}

function saveRemoteMetadata(skillId: string, metadata: Record<string, string>): void {
  const metaPath = getRemoteMetadataPath()
  let all: Record<string, unknown> = {}
  if (existsSync(metaPath)) {
    try { all = JSON.parse(readFileSync(metaPath, 'utf-8')) } catch { /* ignore */ }
  }
  all[skillId] = metadata
  writeFileSync(metaPath, JSON.stringify(all, null, 2))
}

// ============================================================================
// Content Resolution (Arguments + Dynamic Context)
// ============================================================================

/**
 * Resolve argument variables: $ARGUMENTS, $0, $1, ...
 */
export function resolveArguments(content: string, args: SkillArgumentContext): string {
  let resolved = content
  resolved = resolved.replace(/\$ARGUMENTS/g, args.raw)

  for (let i = 0; i < 100; i++) {
    const pattern = new RegExp(`\\$${i}\\b`, 'g')
    resolved = resolved.replace(pattern, args.args[i] || '')
  }

  return resolved
}

/**
 * Execute dynamic context injection: !`command` syntax
 */
export function resolveDynamicContext(content: string, cwd: string): { resolved: string; contexts: DynamicContext[] } {
  const { execSync } = require('child_process')
  const contexts: DynamicContext[] = []
  const pattern = /!`([^`]+)`/g
  let resolved = content
  let match: RegExpExecArray | null

  while ((match = pattern.exec(content)) !== null) {
    const command = match[1]
    const dc: DynamicContext = { command, placeholder: match[0] }

    try {
      const output = execSync(command, {
        cwd,
        timeout: 10000,
        encoding: 'utf-8',
        maxBuffer: 1024 * 1024,
      }).trim()
      dc.output = output
      resolved = resolved.replace(match[0], output)
    } catch (error) {
      dc.error = error instanceof Error ? error.message : String(error)
      resolved = resolved.replace(match[0], `[Error executing: ${command}]`)
    }

    contexts.push(dc)
  }

  return { resolved, contexts }
}

/**
 * Full content resolution pipeline
 */
export function resolveSkillContent(
  skill: Skill,
  args?: SkillArgumentContext,
  cwd?: string,
  charBudget?: number
): string {
  let content = skill.content

  if (args) {
    content = resolveArguments(content, args)
  }

  if (cwd && content.includes('!`')) {
    const { resolved } = resolveDynamicContext(content, cwd)
    content = resolved
  }

  const budget = charBudget || getDefaultCharBudget()
  if (content.length > budget) {
    content = content.slice(0, budget) + '\n\n[truncated due to character budget]'
  }

  return content
}

function getDefaultCharBudget(): number {
  const envBudget = process.env.SLASH_COMMAND_TOOL_CHAR_BUDGET
  if (envBudget) return parseInt(envBudget, 10)
  return Math.max(16000, 16000)
}

// ============================================================================
// Validation
// ============================================================================

export function validateSkill(content: string): SkillValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  if (!content || !content.trim()) {
    errors.push('Content is empty')
    return { valid: false, errors, warnings }
  }

  const { frontmatter, body } = parseSkillMd(content)

  // Name validation
  if (frontmatter.name && !/^[a-zA-Z0-9_-]+$/.test(frontmatter.name)) {
    warnings.push('Name should only contain alphanumeric characters, hyphens, and underscores')
  }

  // Body must not be empty
  if (!body.trim()) {
    warnings.push('Skill body content is empty')
  }

  // allowed-tools validation
  if (frontmatter['allowed-tools']) {
    for (const tool of frontmatter['allowed-tools']) {
      if (typeof tool !== 'string') {
        errors.push(`Invalid tool entry: ${tool}`)
      }
    }
  }

  return { valid: errors.length === 0, errors, warnings }
}

// ============================================================================
// Public API (exported functions)
// ============================================================================

/**
 * List all skills across all sources
 */
export function listAllSkills(spaceId?: string): SkillsListResponse {
  const userSkills = loadSkillsFromDir(getUserSkillsDir(), 'user')

  let projectSkills: Skill[] = []
  let compatSkills: Skill[] = []

  if (spaceId) {
    const spacePath = getSpacePath(spaceId)

    if (spacePath) {
      // Load root project skills
      const projectDir = getProjectSkillsDir(spaceId)
      if (projectDir && existsSync(projectDir)) {
        projectSkills = loadSkillsFromDir(projectDir, 'project')
      }

      // Monorepo auto-discovery
      const nestedSkills = discoverMonorepoSkills(spacePath)
      projectSkills = [...projectSkills, ...nestedSkills]

      // Compat format discovery
      compatSkills = discoverCompatSkills(spacePath)
    }
  }

  // Apply enabled/disabled state
  const allSkills = [...userSkills, ...projectSkills, ...compatSkills]
  applyEnabledState(allSkills)

  return {
    userSkills,
    projectSkills,
    compatSkills,
    totalCount: allSkills.length
  }
}

/**
 * Get a single skill by ID
 */
export function getSkill(skillId: string, source: SkillSource, spaceId?: string): Skill | null {
  const dir = source === 'user'
    ? getUserSkillsDir()
    : getProjectSkillsDir(spaceId!)
  if (!dir) return null

  const skillPath = join(dir, skillId)
  return loadSkill(skillPath, source)
}

/**
 * Check if skill name exists
 */
export function skillExists(name: string, source: SkillSource, spaceId?: string): boolean {
  const dir = source === 'user'
    ? getUserSkillsDir()
    : getProjectSkillsDir(spaceId!)
  if (!dir) return false

  const skillPath = join(dir, sanitizeName(name))
  return existsSync(skillPath)
}

/**
 * Create a new skill
 */
export function createSkill(request: CreateSkillRequest): Skill {
  const dir = request.source === 'user'
    ? getUserSkillsDir()
    : getProjectSkillsDir(request.spaceId!)

  if (!dir) {
    throw new Error('Cannot determine skills directory')
  }

  const id = sanitizeName(request.name)
  const skillPath = join(dir, id)

  if (existsSync(skillPath)) {
    throw new Error(`Skill "${id}" already exists`)
  }

  // Ensure parent directory exists
  mkdirSync(skillPath, { recursive: true })

  const skillMd = generateSkillMd({
    name: request.name,
    description: request.description,
    userInvocable: request.userInvocable,
    disableModelInvocation: request.disableModelInvocation,
    argumentHint: request.argumentHint,
    allowedTools: request.allowedTools,
    model: request.model,
    hooks: request.hooks,
    whenToUse: request.whenToUse,
    globs: request.globs,
    alwaysApply: request.alwaysApply,
    content: request.content
  })

  writeFileSync(join(skillPath, 'SKILL.md'), skillMd)

  const skill = loadSkill(skillPath, request.source)
  if (!skill) {
    throw new Error('Failed to load created skill')
  }
  return skill
}

/**
 * Update an existing skill
 */
export function updateSkill(skillId: string, request: UpdateSkillRequest): Skill {
  const dir = request.source === 'user'
    ? getUserSkillsDir()
    : getProjectSkillsDir(request.spaceId!)

  if (!dir) {
    throw new Error('Cannot determine skills directory')
  }

  const skillPath = join(dir, skillId)

  if (!existsSync(skillPath)) {
    throw new Error(`Skill "${skillId}" not found`)
  }

  const existing = loadSkill(skillPath, request.source)
  if (!existing) {
    throw new Error(`Failed to load existing skill "${skillId}"`)
  }

  const updated: Partial<Skill> = {
    ...existing,
    ...request,
    userInvocable: request.userInvocable ?? existing.userInvocable,
    disableModelInvocation: request.disableModelInvocation ?? existing.disableModelInvocation,
  }

  const skillMd = generateSkillMd(updated)
  writeFileSync(join(skillPath, 'SKILL.md'), skillMd)

  const skill = loadSkill(skillPath, request.source)
  if (!skill) {
    throw new Error('Failed to reload updated skill')
  }
  return skill
}

/**
 * Delete a skill
 */
export function deleteSkill(skillId: string, source: SkillSource, spaceId?: string): void {
  const dir = source === 'user'
    ? getUserSkillsDir()
    : getProjectSkillsDir(spaceId!)

  if (!dir) {
    throw new Error('Cannot determine skills directory')
  }

  const skillPath = join(dir, skillId)

  if (!existsSync(skillPath)) {
    throw new Error(`Skill "${skillId}" not found`)
  }

  rmSync(skillPath, { recursive: true, force: true })
}

/**
 * Rename a skill
 */
export function renameSkill(
  oldId: string,
  newId: string,
  source: SkillSource,
  spaceId?: string
): Skill {
  const dir = source === 'user'
    ? getUserSkillsDir()
    : getProjectSkillsDir(spaceId!)

  if (!dir) {
    throw new Error('Cannot determine skills directory')
  }

  const oldPath = join(dir, oldId)
  const newName = sanitizeName(newId)
  const newPath = join(dir, newName)

  if (!existsSync(oldPath)) {
    throw new Error(`Skill "${oldId}" not found`)
  }

  if (existsSync(newPath)) {
    throw new Error(`Skill "${newId}" already exists`)
  }

  renameSync(oldPath, newPath)

  const skill = loadSkill(newPath, source)
  if (!skill) {
    throw new Error('Failed to load renamed skill')
  }
  return skill
}

/**
 * Toggle skill enabled/disabled
 */
export function toggleSkill(skillId: string, enabled: boolean): void {
  const config = getEnabledConfig()
  config[skillId] = enabled
  saveEnabledConfig(config)
}

/**
 * Import from URL
 */
export async function importFromUrl(request: ImportUrlRequest): Promise<ImportSkillResult> {
  const dir = request.targetLevel === 'user'
    ? getUserSkillsDir()
    : getProjectSkillsDir(request.spaceId!)

  if (!dir) {
    return { success: false, error: 'Cannot determine skills directory' }
  }

  const id = sanitizeName(request.name)
  const skillPath = join(dir, id)

  if (existsSync(skillPath)) {
    return { success: false, error: `Skill "${id}" already exists` }
  }

  try {
    const response = await fetch(request.url)
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }

    const content = await response.text()
    const validation = validateSkill(content)
    if (!validation.valid) {
      return { success: false, error: `Invalid SKILL.md: ${validation.errors.join(', ')}` }
    }

    mkdirSync(skillPath, { recursive: true })
    writeFileSync(join(skillPath, 'SKILL.md'), content)

    const skill = loadSkill(skillPath, request.targetLevel)
    return {
      success: true,
      skill: skill || undefined,
      warnings: validation.warnings
    }
  } catch (error) {
    // Cleanup on failure
    if (existsSync(skillPath)) {
      rmSync(skillPath, { recursive: true, force: true })
    }
    return {
      success: false,
      error: `Failed to import: ${error instanceof Error ? error.message : String(error)}`
    }
  }
}

/**
 * Import from local folder
 */
export function importFromLocal(request: ImportFileRequest): ImportSkillResult {
  const dir = request.targetLevel === 'user'
    ? getUserSkillsDir()
    : getProjectSkillsDir(request.spaceId!)

  if (!dir) {
    return { success: false, error: 'Cannot determine skills directory' }
  }

  const sourcePath = request.localPath
  const id = sanitizeName(basename(sourcePath))
  const targetPath = join(dir, id)

  if (!existsSync(sourcePath)) {
    return { success: false, error: 'Source directory not found' }
  }

  if (!statSync(sourcePath).isDirectory()) {
    return { success: false, error: 'Source path is not a directory' }
  }

  if (existsSync(targetPath)) {
    return { success: false, error: `Skill "${id}" already exists` }
  }

  const sourceSkillFile = join(sourcePath, 'SKILL.md')
  if (!existsSync(sourceSkillFile)) {
    return { success: false, error: 'No SKILL.md found in source directory' }
  }

  const content = readFileSync(sourceSkillFile, 'utf-8')
  const validation = validateSkill(content)
  if (!validation.valid) {
    return { success: false, error: `Invalid SKILL.md: ${validation.errors.join(', ')}` }
  }

  try {
    // Copy directory recursively
    copyDirRecursive(sourcePath, targetPath)

    const skill = loadSkill(targetPath, request.targetLevel)
    return {
      success: true,
      skill: skill || undefined,
      warnings: validation.warnings
    }
  } catch (error) {
    return {
      success: false,
      error: `Failed to import: ${error instanceof Error ? error.message : String(error)}`
    }
  }
}

function copyDirRecursive(src: string, dest: string): void {
  mkdirSync(dest, { recursive: true })
  const entries = readdirSync(src, { withFileTypes: true })
  for (const entry of entries) {
    const srcPath = join(src, entry.name)
    const destPath = join(dest, entry.name)
    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath)
    } else {
      copyFileSync(srcPath, destPath)
    }
  }
}

// ============================================================================
// GitHub Repository Import (using git clone to avoid API rate limits)
// ============================================================================

/**
 * Parse GitHub URL into owner/repo and optional path
 * Supports formats:
 *   https://github.com/owner/repo
 *   https://github.com/owner/repo/tree/branch/path
 *   owner/repo
 */
function parseGithubUrl(url: string): { owner: string; repo: string; branch?: string; subpath?: string } | null {
  // Try shorthand: owner/repo
  const shorthand = url.match(/^([^/]+)\/([^/]+)$/)
  if (shorthand) {
    return { owner: shorthand[1], repo: shorthand[2] }
  }

  // Try full URL
  const fullUrl = url.match(/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?(?:\/tree\/([^/]+)(?:\/(.+))?)?$/)
  if (fullUrl) {
    return {
      owner: fullUrl[1],
      repo: fullUrl[2],
      branch: fullUrl[3] || undefined,
      subpath: fullUrl[4] || undefined
    }
  }

  return null
}

/**
 * Clone a GitHub repo to a temp directory using git clone --depth 1
 * This avoids GitHub API rate limits entirely
 */
function cloneGithubRepo(owner: string, repo: string, branch?: string): { success: boolean; path?: string; error?: string } {
  const tempDir = mkdtempSync(join(tmpdir(), `halo-skill-${repo}-`))
  const gitUrl = `https://github.com/${owner}/${repo}.git`

  try {
    // Use --depth 1 for shallow clone (faster, less data)
    // Use execFileSync with args array to prevent shell injection
    const args = ['clone', '--depth', '1']
    if (branch) {
      args.push('--branch', branch)
    }
    args.push(gitUrl, tempDir)
    execFileSync('git', args, {
      encoding: 'utf-8',
      timeout: 60000, // 60 seconds timeout
      stdio: ['pipe', 'pipe', 'pipe']
    })
    console.log(`[Skills] Cloned ${owner}/${repo} to ${tempDir}`)
    return { success: true, path: tempDir }
  } catch (error) {
    // Clean up on failure
    try {
      rmSync(tempDir, { recursive: true, force: true })
    } catch { /* ignore */ }

    const errorMsg = error instanceof Error ? error.message : String(error)
    console.error(`[Skills] Failed to clone ${gitUrl}:`, errorMsg)

    if (errorMsg.includes('Repository not found') || errorMsg.includes('404')) {
      return { success: false, error: `Repository not found: ${owner}/${repo}` }
    }
    if (errorMsg.includes('Could not resolve host') || errorMsg.includes('network')) {
      return { success: false, error: 'Network error. Please check your internet connection.' }
    }
    if (errorMsg.includes('Authentication failed')) {
      return { success: false, error: 'Authentication failed. The repository may be private.' }
    }

    return { success: false, error: `Failed to clone repository: ${errorMsg}` }
  }
}

/**
 * Recursively find SKILL.md files in a local directory
 */
function findSkillMdFilesLocal(
  basePath: string,
  currentPath: string,
  depth = 0
): Array<{ name: string; relativePath: string; absolutePath: string }> {
  const results: Array<{ name: string; relativePath: string; absolutePath: string }> = []

  // Limit recursion depth
  if (depth > 5) return results

  // Skip common non-skill directories
  const skipDirs = ['node_modules', '.git', 'dist', 'build', 'out', 'bin', 'tests', 'test', '__tests__', '.github', '.vscode', '.idea']

  try {
    const entries = readdirSync(currentPath, { withFileTypes: true })

    for (const entry of entries) {
      const entryPath = join(currentPath, entry.name)

      if (entry.isDirectory()) {
        if (!skipDirs.includes(entry.name)) {
          const subResults = findSkillMdFilesLocal(basePath, entryPath, depth + 1)
          results.push(...subResults)
        }
      } else if (entry.isFile() && entry.name === 'SKILL.md') {
        // Skill name is the parent directory name
        const relativePath = relative(basePath, currentPath) || '.'
        const skillName = currentPath === basePath ? basename(basePath) : basename(currentPath)
        results.push({
          name: skillName,
          relativePath,
          absolutePath: entryPath
        })
      }
    }
  } catch (error) {
    console.error(`[Skills] Error scanning ${currentPath}:`, error)
  }

  return results
}

/**
 * Discover skills in a GitHub repository using git clone
 * This avoids GitHub API rate limits by cloning the repo locally
 */
export async function discoverGithubSkills(url: string): Promise<GithubDiscoverResult> {
  const parsed = parseGithubUrl(url)
  if (!parsed) {
    return { success: false, repoUrl: url, skills: [], error: 'Invalid GitHub URL format' }
  }

  const { owner, repo, branch, subpath } = parsed

  // Clone the repo
  const cloneResult = cloneGithubRepo(owner, repo, branch)
  if (!cloneResult.success || !cloneResult.path) {
    return {
      success: false,
      repoUrl: url,
      skills: [],
      error: cloneResult.error || 'Failed to clone repository'
    }
  }

  try {
    const repoPath = cloneResult.path

    // Determine search paths
    const searchPaths = subpath
      ? [join(repoPath, subpath)]
      : [
          join(repoPath, 'skills'),
          join(repoPath, '.claude', 'skills'),
          join(repoPath, '.cursor', 'skills'),
          repoPath // Root as fallback
        ]

    const allSkills: GithubDiscoveredSkill[] = []
    const seenNames = new Set<string>()

    for (const searchPath of searchPaths) {
      if (!existsSync(searchPath)) continue

      const found = findSkillMdFilesLocal(searchPath, searchPath)

      for (const item of found) {
        if (!seenNames.has(item.name)) {
          seenNames.add(item.name)

          // Read content to get description from frontmatter
          let description = ''
          try {
            const content = readFileSync(item.absolutePath, 'utf-8')
            const fm = parseSkillMd(content)
            description = fm.frontmatter.description || ''
          } catch {
            // Ignore read errors
          }

          // Build the relative path from repo root
          const relativeFromRepo = relative(repoPath, dirname(item.absolutePath))

          allSkills.push({
            name: item.name,
            description,
            path: relativeFromRepo,
            // For downloadUrl, we'll use a special marker to indicate it's from local clone
            downloadUrl: `local://${owner}/${repo}/${relativeFromRepo}/SKILL.md`
          })
        }
      }
    }

    // Clean up the temp directory
    try {
      rmSync(repoPath, { recursive: true, force: true })
    } catch { /* ignore */ }

    return {
      success: true,
      repoUrl: url,
      skills: allSkills,
    }
  } catch (error) {
    // Clean up on error
    try {
      rmSync(cloneResult.path, { recursive: true, force: true })
    } catch { /* ignore */ }

    return {
      success: false,
      repoUrl: url,
      skills: [],
      error: `Failed to discover skills: ${error instanceof Error ? error.message : String(error)}`
    }
  }
}

/**
 * Import selected skills from a GitHub repository
 * Uses git clone to avoid GitHub API rate limits
 */
export async function importFromGithub(request: ImportGithubRequest): Promise<BatchImportResult> {
  const parsed = parseGithubUrl(request.url)
  if (!parsed) {
    return {
      success: false,
      imported: [],
      failed: [{ name: request.url, error: 'Invalid GitHub URL format' }],
      totalDiscovered: 0
    }
  }

  const { owner, repo, branch } = parsed

  // Clone the repo
  const cloneResult = cloneGithubRepo(owner, repo, branch)
  if (!cloneResult.success || !cloneResult.path) {
    return {
      success: false,
      imported: [],
      failed: [{ name: request.url, error: cloneResult.error || 'Failed to clone repository' }],
      totalDiscovered: 0
    }
  }

  const repoPath = cloneResult.path

  try {
    // Determine search paths
    const subpath = parsed.subpath
    const searchPaths = subpath
      ? [join(repoPath, subpath)]
      : [
          join(repoPath, 'skills'),
          join(repoPath, '.claude', 'skills'),
          join(repoPath, '.cursor', 'skills'),
          repoPath
        ]

    // Find all skills
    const allFound: Array<{ name: string; absolutePath: string }> = []
    const seenNames = new Set<string>()

    for (const searchPath of searchPaths) {
      if (!existsSync(searchPath)) continue

      const found = findSkillMdFilesLocal(searchPath, searchPath)
      for (const item of found) {
        if (!seenNames.has(item.name)) {
          seenNames.add(item.name)
          allFound.push({
            name: item.name,
            absolutePath: item.absolutePath
          })
        }
      }
    }

    if (allFound.length === 0) {
      rmSync(repoPath, { recursive: true, force: true })
      return {
        success: false,
        imported: [],
        failed: [{ name: request.url, error: 'No skills found in repository' }],
        totalDiscovered: 0
      }
    }

    // Filter by selected skills if specified
    const skillsToImport = request.selectedSkills && request.selectedSkills.length > 0
      ? allFound.filter(s => request.selectedSkills!.includes(s.name))
      : allFound

    const dir = request.targetLevel === 'user'
      ? getUserSkillsDir()
      : getProjectSkillsDir(request.spaceId!)

    if (!dir) {
      rmSync(repoPath, { recursive: true, force: true })
      return {
        success: false,
        imported: [],
        failed: [{ name: 'all', error: 'Cannot determine skills directory' }],
        totalDiscovered: allFound.length
      }
    }

    const imported: { name: string; skill?: Skill }[] = []
    const failed: { name: string; error: string }[] = []

    for (const foundSkill of skillsToImport) {
      const id = sanitizeName(request.customName && skillsToImport.length === 1 ? request.customName : foundSkill.name)
      const skillPath = join(dir, id)

      if (existsSync(skillPath)) {
        failed.push({ name: foundSkill.name, error: `Skill "${id}" already exists` })
        continue
      }

      try {
        // Read SKILL.md from local clone
        const skillMdPath = foundSkill.absolutePath
        const content = readFileSync(skillMdPath, 'utf-8')

        const validation = validateSkill(content)
        if (!validation.valid) {
          failed.push({ name: foundSkill.name, error: `Invalid: ${validation.errors.join(', ')}` })
          continue
        }

        mkdirSync(skillPath, { recursive: true })
        writeFileSync(join(skillPath, 'SKILL.md'), content)

        // Copy supporting files from the skill directory
        const skillDir = dirname(skillMdPath)
        const entries = readdirSync(skillDir, { withFileTypes: true })
        for (const entry of entries) {
          if (entry.name === 'SKILL.md') continue

          const srcPath = join(skillDir, entry.name)
          const destPath = join(skillPath, entry.name)

          try {
            if (entry.isDirectory()) {
              copyDirRecursive(srcPath, destPath)
            } else if (entry.isFile()) {
              copyFileSync(srcPath, destPath)
            }
          } catch {
            // Skip individual file copy failures
          }
        }

        const skill = loadSkill(skillPath, request.targetLevel)
        imported.push({ name: foundSkill.name, skill: skill || undefined })
      } catch (error) {
        if (existsSync(skillPath)) {
          rmSync(skillPath, { recursive: true, force: true })
        }
        failed.push({
          name: foundSkill.name,
          error: error instanceof Error ? error.message : String(error)
        })
      }
    }

    // Clean up temp directory
    try {
      rmSync(repoPath, { recursive: true, force: true })
    } catch { /* ignore */ }

    return {
      success: imported.length > 0,
      imported,
      failed,
      totalDiscovered: allFound.length
    }
  } catch (error) {
    // Clean up on error
    try {
      rmSync(repoPath, { recursive: true, force: true })
    } catch { /* ignore */ }

    return {
      success: false,
      imported: [],
      failed: [{ name: request.url, error: `Failed to import: ${error instanceof Error ? error.message : String(error)}` }],
      totalDiscovered: 0
    }
  }
}

/**
 * Export a skill to a chosen directory
 */
export function exportSkill(skillId: string, source: SkillSource, spaceId?: string): { path: string } | null {
  const skill = getSkill(skillId, source, spaceId)
  if (!skill) return null
  return { path: skill.path }
}

// ============================================================================
// Permission Management
// ============================================================================

import type { SkillPermission } from '../../shared/types/skill'

function getPermissionsConfigPath(): string {
  return join(getHaloDir(), 'skills-permissions.json')
}

/**
 * Get all skill permissions
 */
export function getSkillPermissions(): SkillPermission[] {
  const configPath = getPermissionsConfigPath()
  if (!existsSync(configPath)) return []
  try {
    const data = JSON.parse(readFileSync(configPath, 'utf-8'))
    return Array.isArray(data) ? data : []
  } catch {
    return []
  }
}

/**
 * Set a skill permission
 */
export function setSkillPermission(permission: SkillPermission): void {
  const permissions = getSkillPermissions()
  const idx = permissions.findIndex(p => p.skillId === permission.skillId && p.scope === permission.scope)
  if (idx >= 0) {
    permissions[idx] = permission
  } else {
    permissions.push(permission)
  }
  const configPath = getPermissionsConfigPath()
  writeFileSync(configPath, JSON.stringify(permissions, null, 2))
}

/**
 * Remove a skill permission
 */
export function removeSkillPermission(skillId: string, scope?: 'all' | 'invocation-only'): void {
  let permissions = getSkillPermissions()
  if (scope) {
    permissions = permissions.filter(p => !(p.skillId === skillId && p.scope === scope))
  } else {
    permissions = permissions.filter(p => p.skillId !== skillId)
  }
  const configPath = getPermissionsConfigPath()
  writeFileSync(configPath, JSON.stringify(permissions, null, 2))
}

/**
 * Check if a skill is allowed
 */
export function isSkillAllowed(skillId: string): boolean {
  const permissions = getSkillPermissions()
  const deny = permissions.find(p => p.skillId === skillId && p.action === 'deny')
  if (deny) return false
  return true
}
