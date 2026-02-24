# Halo Skills 接入方案

> **参考标准**: Claude Code Skills 官方规范、Cursor Rules、Roo Code Custom Modes、Windsurf Rules、Cline Rules
>
> **最后更新**: 2026-02-24

## 一、整体架构

```
┌────────────────────────────────────────────────────────────────────────────────┐
│                                  Renderer Layer                                 │
├────────────────────────────────────────────────────────────────────────────────┤
│  ArtifactRail (修改)                                                            │
│  ├── FilesTab (原有)                                                            │
│  └── SkillsTab (新增)                                                           │
│       ├── SkillsList              → 技能列表                                    │
│       ├── SkillCard               → 技能卡片（含启用/禁用开关）                  │
│       ├── SkillEditorDialog       → 编辑对话框                                  │
│       ├── ImportSkillDialog       → 导入对话框                                  │
│       └── SkillQuickActions       → 快捷操作 (删除、导出等)                     │
│                                                                                 │
│  ChatInput (修改)                                                               │
│  └── SkillAutocomplete           → `/` 触发的自动补全（含参数提示）             │
│                                                                                 │
│  SkillPermissions (新增)                                                        │
│  └── 权限管理面板                  → 允许/拒绝特定技能                          │
└────────────────────────────────────────────────────────────────────────────────┘
                                      │ IPC
┌────────────────────────────────────────────────────────────────────────────────┐
│                                   Main Layer                                    │
├────────────────────────────────────────────────────────────────────────────────┤
│  IPC Handlers (新增)                                                            │
│  ├── skills:list                 → 列出所有技能                                │
│  ├── skills:get                  → 获取单个技能详情                            │
│  ├── skills:create               → 创建技能                                    │
│  ├── skills:update               → 更新技能                                    │
│  ├── skills:delete               → 删除技能                                    │
│  ├── skills:import:github        → 从 GitHub 导入                              │
│  ├── skills:import:url           → 从 URL 导入                                 │
│  ├── skills:import:file          → 从本地文件夹导入                             │
│  ├── skills:export               → 导出技能                                    │
│  ├── skills:validate             → 验证技能格式                                │
│  ├── skills:toggle               → 启用/禁用技能                              │
│  └── skills:permissions          → 权限管理（允许/拒绝）                       │
│                                                                                 │
│  SkillsService (新增)                                                           │
│  ├── 文件系统 CRUD                                                              │
│  ├── SKILL.md 解析/生成（含动态上下文注入、参数变量替换）                       │
│  ├── GitHub Clone                                                               │
│  ├── 远程同步检查                                                               │
│  ├── 条件规则/Glob 匹配引擎                                                    │
│  ├── Monorepo 自动发现                                                          │
│  └── 兼容格式识别（.cursorrules, .windsurfrules, AGENTS.md）                    │
│                                                                                 │
│  SDK Config (现有，无需修改)                                                     │
│  └── settingSources: ['user', 'project'] → 自动加载 Skills                     │
└────────────────────────────────────────────────────────────────────────────────┘
```

---

## 二、数据结构定义

### 文件位置: `src/shared/types/skill.ts`

```typescript
/**
 * 技能元数据 (SKILL.md 的 frontmatter)
 * 完全兼容 Claude Code 官方标准，并扩展了部分字段
 */
export interface SkillFrontmatter {
  name?: string
  description?: string
  'user-invocable'?: boolean
  'disable-model-invocation'?: boolean
  'argument-hint'?: string
  'allowed-tools'?: string[]         // 支持通配符，如 "Edit(*.md)" 限制文件范围
  model?: string
  context?: 'fork'
  agent?: string                     // 子代理类型: 'Explore' | 'Plan' | 自定义

  // --- Claude Code 官方支持的高级字段 ---
  hooks?: SkillHooks                 // 技能生命周期钩子（Claude Code 新特性）

  // --- 扩展字段（借鉴其他客户端） ---
  'when-to-use'?: string             // 使用场景描述（借鉴 Roo Code）
  globs?: string | string[]          // 条件触发 glob 模式（借鉴 Cursor Rules）
  'always-apply'?: boolean           // 始终应用（借鉴 Cursor alwaysApply）
}

/**
 * 技能生命周期钩子
 * 参考 Claude Code hooks 特性
 */
export interface SkillHooks {
  'pre-invoke'?: HookConfig[]        // 技能调用前执行
  'post-invoke'?: HookConfig[]       // 技能调用后执行
}

export interface HookConfig {
  command: string                    // 要执行的 shell 命令
  timeout?: number                   // 超时时间（毫秒）
}

/**
 * 技能来源级别
 * 参考 Claude Code 四层优先级: enterprise > user > project > extension
 */
export type SkillSource = 'enterprise' | 'user' | 'project' | 'extension'

/**
 * 完整的技能对象
 */
export interface Skill {
  id: string                         // 目录名，作为唯一标识
  name: string                       // 显示名称
  description: string                // 描述
  userInvocable: boolean             // 是否可通过 /skill-name 调用
  disableModelInvocation: boolean    // 是否禁止 AI 自动调用
  argumentHint?: string              // 参数提示，如 "<commit message>"
  allowedTools?: string[]            // 允许的工具（支持通配符限制文件范围）
  model?: string                     // 指定模型
  context?: 'fork'                   // 是否在子代理执行
  agent?: string                     // 子代理类型
  hooks?: SkillHooks                 // 生命周期钩子
  whenToUse?: string                 // 使用场景描述
  globs?: string[]                   // 条件触发 glob 模式
  alwaysApply?: boolean              // 始终应用
  content: string                    // SKILL.md 正文内容（原始 Markdown）
  resolvedContent?: string           // 解析后的内容（动态上下文注入后的结果）
  source: SkillSource                // 来源级别
  path: string                       // 文件系统路径
  enabled: boolean                   // 启用/禁用状态（借鉴 Cline）
  hasSupportingFiles: boolean        // 是否有支持文件
  supportingFiles?: string[]         // 支持文件列表
  createdAt: string
  updatedAt: string
  remoteUrl?: string                 // 远程来源 URL (用于同步)

  // 兼容格式来源
  compatSource?: 'cursorrules' | 'windsurfrules' | 'agents-md'
}

/**
 * 参数变量上下文
 * Claude Code 支持 $ARGUMENTS, $0, $1 等变量替换
 */
export interface SkillArgumentContext {
  raw: string                        // 原始输入字符串
  args: string[]                     // 按空格分割的参数数组
  // $ARGUMENTS => raw
  // $0 => args[0], $1 => args[1], ...
}

/**
 * 动态上下文片段
 * SKILL.md 中 !`command` 语法，发送前执行 shell 命令并注入输出
 */
export interface DynamicContext {
  command: string                    // 要执行的 shell 命令
  placeholder: string                // 原始占位符文本
  output?: string                    // 执行结果
  error?: string                     // 执行错误
}

/**
 * 字符预算配置
 * 参考 Claude Code: 上下文窗口的 2%（最低 16,000 字符）
 */
export interface SkillCharBudget {
  maxChars: number                   // 最大字符数
  currentUsage: number               // 当前使用量
  canExpand: boolean                 // 是否可以扩展
}

/**
 * 技能权限
 * 参考 Claude Code /permissions 功能
 */
export interface SkillPermission {
  skillId: string
  action: 'allow' | 'deny'
  scope: 'all' | 'invocation-only'   // 'all' = Skill(name *), 'invocation-only' = Skill(name)
}

/**
 * 创建技能请求
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
  spaceId?: string                   // project 级别时必需
}

/**
 * 更新技能请求
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
 * GitHub 导入请求
 */
export interface ImportGithubRequest {
  url: string                        // GitHub URL (支持多种格式)
  targetLevel: SkillSource
  spaceId?: string                   // project 级别时必需
  customName?: string                // 自定义名称
}

/**
 * URL 导入请求 (Raw file)
 */
export interface ImportUrlRequest {
  url: string                        // Raw file URL
  targetLevel: SkillSource
  spaceId?: string
  name: string                       // 必需指定名称
}

/**
 * 本地文件夹导入请求
 */
export interface ImportFileRequest {
  localPath: string                  // 本地文件夹路径
  targetLevel: SkillSource
  spaceId?: string
  copyFiles: boolean                 // 是否复制文件 (vs 移动)
}

/**
 * 导入结果
 */
export interface ImportSkillResult {
  success: boolean
  skill?: Skill
  error?: string
  warnings?: string[]
}

/**
 * 技能列表响应
 */
export interface SkillsListResponse {
  enterpriseSkills: Skill[]          // 企业级（由管理员配置，只读）
  userSkills: Skill[]                // 用户级（全局）
  projectSkills: Skill[]             // 项目级（当前 Space）
  extensionSkills: Skill[]           // 插件级（MCP 等扩展提供）
  compatSkills: Skill[]              // 兼容格式自动发现的规则
  totalCount: number
}

/**
 * 技能验证结果
 */
export interface SkillValidationResult {
  valid: boolean
  errors: string[]
  warnings: string[]
}
```

---

## 三、文件存储设计

### 存储路径（四层优先级）

参考 Claude Code 官方优先级: **Enterprise > User > Project > Extension**

```
Enterprise Skills (企业级，管理员配置，只读):
├── macOS:   ~/Library/Application Support/halo/enterprise-config/skills/
├── Windows: %APPDATA%/halo/enterprise-config/skills/
└── Linux:   ~/.config/halo/enterprise-config/skills/

User Skills (用户级，全局):
├── macOS:   ~/Library/Application Support/halo/claude-config/skills/
├── Windows: %APPDATA%/halo/claude-config/skills/
└── Linux:   ~/.config/halo/claude-config/skills/

Project Skills (项目级，当前 Space):
└── <space-path>/.claude/skills/

Extension Skills (插件级，MCP 等扩展提供):
└── 由各插件在运行时注入，不持久化存储
```

### Monorepo 自动发现

对于 Monorepo 项目，自动搜索嵌套的 `.claude/skills/` 目录：

```
project-root/
├── .claude/skills/                  # 根项目级 Skills
│   └── root-skill/
│       └── SKILL.md
├── packages/
│   ├── frontend/.claude/skills/     # 子项目级 Skills (自动发现)
│   │   └── frontend-skill/
│   │       └── SKILL.md
│   └── backend/.claude/skills/      # 子项目级 Skills (自动发现)
│       └── api-skill/
│           └── SKILL.md
└── apps/
    └── web/.claude/skills/          # 子项目级 Skills (自动发现)
```

**发现规则**：
- 递归搜索项目目录下所有 `.claude/skills/` 路径（最大深度 4 层）
- 忽略 `node_modules`, `.git`, `dist`, `build` 等目录
- 子项目 Skills 与根项目 Skills 合并展示，标注来源子路径

### 兼容格式自动识别

自动识别以下文件并转换为等效 Skill（借鉴 Cline）：

| 文件 | 转换规则 |
|------|---------|
| `.cursorrules` | 整个文件作为 always-apply 规则，name 为 "cursorrules" |
| `.cursor/rules/*.mdc` | 解析 frontmatter 中的 `globs` 和 `alwaysApply`，转换为 Skill |
| `.windsurfrules` | 整个文件作为 always-apply 规则 |
| `AGENTS.md` | 整个文件作为 always-apply 规则 |
| `.clinerules` / `.clinerules/*.md` | 解析 frontmatter 中的 `paths` glob，转换为条件 Skill |

兼容格式的 Skill 标记为只读（`compatSource` 字段），不允许在 Halo 中编辑。

### 每个 Skill 的目录结构

```
skills/
├── code-commit/
│   ├── SKILL.md              # 必需 - 主文件
│   ├── templates/            # 可选 - 模板文件
│   │   └── commit-template.md
│   ├── examples/             # 可选 - 示例文件
│   │   └── sample.md
│   └── scripts/              # 可选 - 脚本文件
│       └── validate.sh
└── another-skill/
    └── SKILL.md
```

### SKILL.md 格式详细说明

```markdown
---
name: code-commit
description: Generate standardized commit messages
user-invocable: true
argument-hint: "<commit message description>"
allowed-tools:
  - Bash
  - Edit(*.md)              # 工具+文件范围限制
  - Read
context: fork
agent: Plan
globs:                        # 条件触发（可选）
  - "**/*.ts"
  - "**/*.tsx"
hooks:                        # 生命周期钩子（可选）
  pre-invoke:
    - command: "git status"
      timeout: 5000
---

You are a commit message generator.

## Dynamic Context

Current git diff:
!`git diff --cached`

Current branch:
!`git branch --show-current`

## Arguments

The user wants to commit: $ARGUMENTS

Individual args: $0 $1 $2

## Instructions

1. Analyze the staged changes
2. Generate a conventional commit message
3. Apply using git commit
```

### 参数变量替换规则

| 变量 | 说明 | 示例输入 `/code-commit fix auth bug` |
|------|------|------|
| `$ARGUMENTS` | 完整参数字符串 | `"fix auth bug"` |
| `$0` | 第一个参数 | `"fix"` |
| `$1` | 第二个参数 | `"auth"` |
| `$2` | 第三个参数 | `"bug"` |
| `$N` | 第 N 个参数 | 超出范围则替换为空字符串 |

### 动态上下文注入（!`command` 语法）

SKILL.md 正文中使用 `` !`command` `` 语法可以在发送给 AI 之前执行 shell 命令，并将输出注入到内容中。

**执行时机**：技能被调用时、发送 prompt 之前
**超时控制**：默认 10 秒，超时则注入错误信息
**安全限制**：命令在项目根目录执行，受沙箱限制

### 字符预算

参考 Claude Code 官方规范：
- **默认预算**：上下文窗口的 **2%**（最低 16,000 字符）
- **环境变量覆盖**：`SLASH_COMMAND_TOOL_CHAR_BUDGET=32000`
- **超预算处理**：按优先级截断，enterprise > user > project > extension
- **大文件策略**：超过预算的 Skill 内容自动截断，并在末尾标注 `[truncated]`

### 权限管理

参考 Claude Code `/permissions` 功能：

| 权限表达式 | 含义 |
|-----------|------|
| `Skill(code-commit)` | 允许/拒绝调用 `code-commit` 技能 |
| `Skill(code-commit *)` | 允许/拒绝 `code-commit` 技能的所有工具调用 |

权限存储在用户配置中，UI 提供权限管理面板。

### 远程同步元数据 (存储在 config 中)

```json
{
  "skillsRemotes": {
    "code-commit": {
      "url": "https://github.com/user/skill-code-commit",
      "lastSync": "2025-02-24T10:00:00Z",
      "branch": "main"
    }
  }
}
```

### 启用/禁用状态 (存储在 config 中)

```json
{
  "skillsEnabled": {
    "code-commit": true,
    "lint-fixer": false
  }
}
```

---

## 四、IPC 接口定义

### 文件位置: `src/main/ipc/skills.ipc.ts`

```typescript
import { ipcMain } from 'electron'
import { skillsService } from '../services/skills.service'

export function registerSkillsIpc() {
  // ========== 查询接口 ==========

  // 列出所有技能
  ipcMain.handle('skills:list', async (_, spaceId?: string) => {
    return skillsService.listAll(spaceId)
  })

  // 获取单个技能详情
  ipcMain.handle('skills:get', async (_, skillId: string, source: 'user' | 'project', spaceId?: string) => {
    return skillsService.get(skillId, source, spaceId)
  })

  // 检查技能名称是否已存在
  ipcMain.handle('skills:exists', async (_, name: string, source: 'user' | 'project', spaceId?: string) => {
    return skillsService.exists(name, source, spaceId)
  })

  // ========== 创建/更新/删除 ==========

  // 创建技能
  ipcMain.handle('skills:create', async (_, request: CreateSkillRequest) => {
    return skillsService.create(request)
  })

  // 更新技能
  ipcMain.handle('skills:update', async (_, skillId: string, request: UpdateSkillRequest) => {
    return skillsService.update(skillId, request)
  })

  // 删除技能
  ipcMain.handle('skills:delete', async (_, skillId: string, source: 'user' | 'project', spaceId?: string) => {
    return skillsService.delete(skillId, source, spaceId)
  })

  // 重命名技能
  ipcMain.handle('skills:rename', async (_, oldId: string, newId: string, source: 'user' | 'project', spaceId?: string) => {
    return skillsService.rename(oldId, newId, source, spaceId)
  })

  // ========== 导入接口 ==========

  // 从 GitHub 导入
  ipcMain.handle('skills:import:github', async (_, request: ImportGithubRequest) => {
    return skillsService.importFromGithub(request)
  })

  // 从 URL 导入
  ipcMain.handle('skills:import:url', async (_, request: ImportUrlRequest) => {
    return skillsService.importFromUrl(request)
  })

  // 从本地文件夹导入
  ipcMain.handle('skills:import:file', async (_, request: ImportFileRequest) => {
    return skillsService.importFromLocal(request)
  })

  // ========== 导出/同步 ==========

  // 导出技能为文件
  ipcMain.handle('skills:export', async (_, skillId: string, source: 'user' | 'project', spaceId?: string) => {
    return skillsService.exportSkill(skillId, source, spaceId)
  })

  // 同步远程技能
  ipcMain.handle('skills:sync', async (_, skillId: string, source: 'user' | 'project', spaceId?: string) => {
    return skillsService.syncFromRemote(skillId, source, spaceId)
  })

  // ========== 验证 ==========

  // 验证技能格式
  ipcMain.handle('skills:validate', async (_, content: string) => {
    return skillsService.validate(content)
  })
}
```

---

## 五、SkillsService 核心实现

### 文件位置: `src/main/services/skills.service.ts`

```typescript
import { app, dialog } from 'electron'
import * as fs from 'fs-extra'
import * as path from 'path'
import simpleGit from 'simple-git'
import yaml from 'js-yaml'
import { minimatch } from 'minimatch'
import { execSync } from 'child_process'
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
  SkillValidationResult
} from '../../shared/types/skill'

export class SkillsService {

  // ========================================
  // 路径管理
  // ========================================

  private getUserSkillsDir(): string {
    const configDir = path.join(app.getPath('userData'), 'claude-config')
    return path.join(configDir, 'skills')
  }

  private getEnterpriseSkillsDir(): string {
    const configDir = path.join(app.getPath('userData'), 'enterprise-config')
    return path.join(configDir, 'skills')
  }

  private getProjectSkillsDir(spaceId: string): string {
    const spacePath = this.getSpacePath(spaceId)
    return path.join(spacePath, '.claude', 'skills')
  }

  private getSpacePath(spaceId: string): string {
    // TODO [P0-阻塞]: 从 SpaceStore 或数据库获取
    // 需要对接现有的 Space 管理，这是基础能力的前提
    const spaceStore = useSpaceStore.getState()
    const space = spaceStore.spaces.find(s => s.id === spaceId) || spaceStore.haloSpace
    return space?.path || ''
  }

  // ========================================
  // 列表查询（含 Monorepo 发现 + 兼容格式）
  // ========================================

  async listAll(spaceId?: string): Promise<SkillsListResponse> {
    const enterpriseSkills = await this.loadSkillsFromDir(this.getEnterpriseSkillsDir(), 'enterprise')
    const userSkills = await this.loadSkillsFromDir(this.getUserSkillsDir(), 'user')

    let projectSkills: Skill[] = []
    let compatSkills: Skill[] = []

    if (spaceId) {
      const spacePath = this.getSpacePath(spaceId)

      // 加载根项目 Skills
      const projectDir = this.getProjectSkillsDir(spaceId)
      projectSkills = await this.loadSkillsFromDir(projectDir, 'project')

      // Monorepo 自动发现
      const nestedSkills = await this.discoverMonorepoSkills(spacePath)
      projectSkills = [...projectSkills, ...nestedSkills]

      // 兼容格式自动识别
      compatSkills = await this.discoverCompatSkills(spacePath)
    }

    // 加载启用/禁用状态
    const allSkills = [...enterpriseSkills, ...userSkills, ...projectSkills, ...compatSkills]
    await this.applyEnabledState(allSkills)

    return {
      enterpriseSkills,
      userSkills,
      projectSkills,
      extensionSkills: [], // 由插件系统在运行时注入
      compatSkills,
      totalCount: allSkills.length
    }
  }

  /**
   * Monorepo 自动发现嵌套的 .claude/skills/ 目录
   */
  private async discoverMonorepoSkills(projectRoot: string, maxDepth = 4): Promise<Skill[]> {
    const skills: Skill[] = []
    const ignoreDirs = new Set(['node_modules', '.git', 'dist', 'build', 'out', '.next', '.nuxt'])

    const walk = async (dir: string, depth: number) => {
      if (depth > maxDepth) return
      if (!await fs.pathExists(dir)) return

      const entries = await fs.readdir(dir, { withFileTypes: true })

      for (const entry of entries) {
        if (!entry.isDirectory() || ignoreDirs.has(entry.name)) continue

        const subPath = path.join(dir, entry.name)

        // 检查是否有 .claude/skills/ 目录
        if (entry.name === '.claude') {
          const skillsDir = path.join(subPath, 'skills')
          // 跳过根目录的 .claude/skills/（已在主流程中处理）
          if (dir !== projectRoot && await fs.pathExists(skillsDir)) {
            const subSkills = await this.loadSkillsFromDir(skillsDir, 'project')
            const relativePath = path.relative(projectRoot, dir)
            for (const skill of subSkills) {
              skill.id = `${relativePath}/${skill.id}` // 加上子路径前缀
              skills.push(skill)
            }
          }
        } else {
          await walk(subPath, depth + 1)
        }
      }
    }

    await walk(projectRoot, 0)
    return skills
  }

  /**
   * 兼容格式自动识别（.cursorrules, .windsurfrules, AGENTS.md 等）
   */
  private async discoverCompatSkills(projectRoot: string): Promise<Skill[]> {
    const skills: Skill[] = []

    const compatFiles: Array<{
      file: string
      source: Skill['compatSource']
      globs?: string[]
    }> = [
      { file: '.cursorrules', source: 'cursorrules' },
      { file: '.windsurfrules', source: 'windsurfrules' },
      { file: 'AGENTS.md', source: 'agents-md' },
    ]

    for (const { file, source, globs } of compatFiles) {
      const filePath = path.join(projectRoot, file)
      if (await fs.pathExists(filePath)) {
        const content = await fs.readFile(filePath, 'utf-8')
        if (content.trim()) {
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
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            compatSource: source,
          })
        }
      }
    }

    // 检查 .cursor/rules/*.mdc 文件
    const cursorRulesDir = path.join(projectRoot, '.cursor', 'rules')
    if (await fs.pathExists(cursorRulesDir)) {
      const mdcFiles = (await fs.readdir(cursorRulesDir)).filter(f => f.endsWith('.mdc'))
      for (const mdcFile of mdcFiles) {
        const content = await fs.readFile(path.join(cursorRulesDir, mdcFile), 'utf-8')
        const { frontmatter, body } = this.parseSkillMd(content)
        skills.push({
          id: `compat-cursor-${path.basename(mdcFile, '.mdc')}`,
          name: path.basename(mdcFile, '.mdc'),
          description: frontmatter.description || `Cursor rule from ${mdcFile}`,
          userInvocable: false,
          disableModelInvocation: false,
          alwaysApply: (frontmatter as any).alwaysApply ?? false,
          globs: this.normalizeGlobs((frontmatter as any).globs),
          content: body,
          source: 'project',
          path: path.join(cursorRulesDir, mdcFile),
          enabled: true,
          hasSupportingFiles: false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          compatSource: 'cursorrules',
        })
      }
    }

    return skills
  }

  private normalizeGlobs(globs: unknown): string[] | undefined {
    if (typeof globs === 'string') return [globs]
    if (Array.isArray(globs)) return globs.filter(g => typeof g === 'string')
    return undefined
  }

  private async applyEnabledState(skills: Skill[]): Promise<void> {
    const enabledConfig = await this.getEnabledConfig()
    for (const skill of skills) {
      if (skill.compatSource) {
        skill.enabled = true // 兼容格式始终启用
      } else {
        skill.enabled = enabledConfig[skill.id] !== false // 默认启用
      }
    }
  }

  private async getEnabledConfig(): Promise<Record<string, boolean>> {
    // TODO [P1-非阻塞]: 从配置文件读取启用状态
    return {}
  }

  // ========================================
  // 条件规则匹配
  // ========================================

  /**
   * 根据当前操作的文件路径匹配条件 Skills
   */
  matchSkillsByFilePaths(skills: Skill[], filePaths: string[]): Skill[] {
    return skills.filter(skill => {
      if (!skill.enabled) return false
      if (skill.alwaysApply) return true
      if (!skill.globs || skill.globs.length === 0) return true // 无 glob 条件则始终匹配

      return filePaths.some(fp =>
        skill.globs!.some(glob => minimatch(fp, glob))
      )
    })
  }

  // ========================================
  // 参数变量替换 + 动态上下文注入
  // ========================================

  /**
   * 解析参数变量: $ARGUMENTS, $0, $1, ...
   */
  resolveArguments(content: string, args: SkillArgumentContext): string {
    let resolved = content
    resolved = resolved.replace(/\$ARGUMENTS/g, args.raw)

    // 替换 $0, $1, $2, ... (最多支持 $99)
    for (let i = 0; i < 100; i++) {
      const pattern = new RegExp(`\\$${i}\\b`, 'g')
      resolved = resolved.replace(pattern, args.args[i] || '')
    }

    return resolved
  }

  /**
   * 执行动态上下文注入: !`command` 语法
   * 在发送给 AI 之前执行 shell 命令并替换
   */
  async resolveDynamicContext(content: string, cwd: string): Promise<{ resolved: string; contexts: DynamicContext[] }> {
    const contexts: DynamicContext[] = []
    const pattern = /!`([^`]+)`/g
    let resolved = content

    const matches = [...content.matchAll(pattern)]
    for (const match of matches) {
      const command = match[1]
      const dc: DynamicContext = {
        command,
        placeholder: match[0],
      }

      try {
        const output = execSync(command, {
          cwd,
          timeout: 10000,
          encoding: 'utf-8',
          maxBuffer: 1024 * 1024, // 1MB
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
   * 完整的内容解析流程：参数替换 → 动态上下文注入 → 字符预算截断
   */
  async resolveSkillContent(
    skill: Skill,
    args?: SkillArgumentContext,
    cwd?: string,
    charBudget?: number
  ): Promise<string> {
    let content = skill.content

    // 1. 参数变量替换
    if (args) {
      content = this.resolveArguments(content, args)
    }

    // 2. 动态上下文注入
    if (cwd && content.includes('!`')) {
      const { resolved } = await this.resolveDynamicContext(content, cwd)
      content = resolved
    }

    // 3. 字符预算截断
    const budget = charBudget || this.getDefaultCharBudget()
    if (content.length > budget) {
      content = content.slice(0, budget) + '\n\n[truncated due to character budget]'
    }

    return content
  }

  private getDefaultCharBudget(): number {
    const envBudget = process.env.SLASH_COMMAND_TOOL_CHAR_BUDGET
    if (envBudget) return parseInt(envBudget, 10)
    return Math.max(16000, /* contextWindowSize * 0.02 */ 16000)
  }

  private async loadSkillsFromDir(dir: string, source: SkillSource): Promise<Skill[]> {
    if (!await fs.pathExists(dir)) {
      return []
    }

    const skills: Skill[] = []
    const entries = await fs.readdir(dir, { withFileTypes: true })

    for (const entry of entries) {
      if (!entry.isDirectory()) continue

      const skillPath = path.join(dir, entry.name)
      const skill = await this.loadSkill(skillPath, source)
      if (skill) {
        skills.push(skill)
      }
    }

    return skills.sort((a, b) => a.name.localeCompare(b.name))
  }

  private async loadSkill(skillPath: string, source: SkillSource): Promise<Skill | null> {
    const skillFile = path.join(skillPath, 'SKILL.md')

    if (!await fs.pathExists(skillFile)) {
      return null
    }

    try {
      const content = await fs.readFile(skillFile, 'utf-8')
      const { frontmatter, body } = this.parseSkillMd(content)
      const stats = await fs.stat(skillPath)
      const fileStats = await fs.stat(skillFile)

      const supportingFiles = await this.getSupportingFiles(skillPath)
      const id = path.basename(skillPath)

      return {
        id,
        name: frontmatter.name || id,
        description: frontmatter.description || this.extractDescription(body),
        userInvocable: frontmatter['user-invocable'] !== false,
        disableModelInvocation: frontmatter['disable-model-invocation'] || false,
        argumentHint: frontmatter['argument-hint'],
        allowedTools: frontmatter['allowed-tools'],
        model: frontmatter.model,
        context: frontmatter.context,
        agent: frontmatter.agent,
        hooks: frontmatter.hooks,
        whenToUse: frontmatter['when-to-use'],
        globs: this.normalizeGlobs(frontmatter.globs),
        alwaysApply: frontmatter['always-apply'],
        content: body,
        source,
        path: skillPath,
        enabled: true, // 默认启用，后续由 applyEnabledState 覆盖
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

  private async getSupportingFiles(skillPath: string): Promise<string[]> {
    const files: string[] = []
    const entries = await fs.readdir(skillPath, { withFileTypes: true })

    for (const entry of entries) {
      if (entry.name === 'SKILL.md') continue
      if (entry.isFile()) {
        files.push(entry.name)
      } else if (entry.isDirectory()) {
        const subFiles = await this.getSupportingFilesRecursively(path.join(skillPath, entry.name))
        files.push(...subFiles.map(f => path.join(entry.name, f)))
      }
    }

    return files
  }

  private async getSupportingFilesRecursively(dir: string): Promise<string[]> {
    const files: string[] = []
    const entries = await fs.readdir(dir, { withFileTypes: true })

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name)
      if (entry.isFile()) {
        files.push(entry.name)
      } else if (entry.isDirectory()) {
        const subFiles = await this.getSupportingFilesRecursively(fullPath)
        files.push(...subFiles.map(f => path.join(entry.name, f)))
      }
    }

    return files
  }

  // ========================================
  // 解析/生成
  // ========================================

  private parseSkillMd(content: string): { frontmatter: SkillFrontmatter; body: string } {
    const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/)

    if (!match) {
      return { frontmatter: {}, body: content.trim() }
    }

    try {
      const frontmatter = yaml.load(match[1]) as SkillFrontmatter || {}
      return { frontmatter, body: match[2].trim() }
    } catch (error) {
      console.error('[SkillsService] Failed to parse frontmatter:', error)
      return { frontmatter: {}, body: content.trim() }
    }
  }

  private generateSkillMd(skill: Partial<Skill>): string {
    const frontmatter: Record<string, unknown> = {}

    if (skill.name) frontmatter.name = skill.name
    if (skill.description) frontmatter.description = skill.description
    if (skill.userInvocable === false) frontmatter['user-invocable'] = false
    if (skill.disableModelInvocation) frontmatter['disable-model-invocation'] = true
    if (skill.argumentHint) frontmatter['argument-hint'] = skill.argumentHint
    if (skill.allowedTools?.length) frontmatter['allowed-tools'] = skill.allowedTools
    if (skill.model) frontmatter.model = skill.model
    if (skill.context) frontmatter.context = skill.context
    if (skill.agent) frontmatter.agent = skill.agent
    if (skill.hooks) frontmatter.hooks = skill.hooks
    if (skill.whenToUse) frontmatter['when-to-use'] = skill.whenToUse
    if (skill.globs?.length) frontmatter.globs = skill.globs
    if (skill.alwaysApply) frontmatter['always-apply'] = true

    const frontmatterStr = Object.keys(frontmatter).length > 0
      ? `---\n${yaml.dump(frontmatter, { lineWidth: -1 })}---\n\n`
      : ''

    return frontmatterStr + (skill.content || '')
  }

  private extractDescription(body: string): string {
    const firstParagraph = body.split('\n\n')[0]
    if (firstParagraph && !firstParagraph.startsWith('#')) {
      return firstParagraph.slice(0, 200)
    }
    return ''
  }

  // ========================================
  // CRUD 操作
  // ========================================

  async get(skillId: string, source: SkillSource, spaceId?: string): Promise<Skill | null> {
    const dir = source === 'user'
      ? this.getUserSkillsDir()
      : source === 'enterprise'
        ? this.getEnterpriseSkillsDir()
        : this.getProjectSkillsDir(spaceId!)
    const skillPath = path.join(dir, skillId)
    return this.loadSkill(skillPath, source)
  }

  async exists(name: string, source: SkillSource, spaceId?: string): Promise<boolean> {
    const dir = source === 'user'
      ? this.getUserSkillsDir()
      : this.getProjectSkillsDir(spaceId!)
    const skillPath = path.join(dir, this.sanitizeName(name))
    return fs.pathExists(skillPath)
  }

  async create(request: CreateSkillRequest): Promise<Skill> {
    const dir = request.source === 'user'
      ? this.getUserSkillsDir()
      : this.getProjectSkillsDir(request.spaceId!)

    const id = this.sanitizeName(request.name)
    const skillPath = path.join(dir, id)

    if (await fs.pathExists(skillPath)) {
      throw new Error(`Skill "${id}" already exists`)
    }

    await fs.ensureDir(skillPath)

    const skillMd = this.generateSkillMd({
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

    await fs.writeFile(path.join(skillPath, 'SKILL.md'), skillMd)

    return this.loadSkill(skillPath, request.source) as Promise<Skill>
  }

  async update(skillId: string, request: UpdateSkillRequest): Promise<Skill> {
    const dir = request.source === 'user'
      ? this.getUserSkillsDir()
      : this.getProjectSkillsDir(request.spaceId!)
    const skillPath = path.join(dir, skillId)

    if (!await fs.pathExists(skillPath)) {
      throw new Error(`Skill "${skillId}" not found`)
    }

    const existing = await this.loadSkill(skillPath, request.source)
    if (!existing) {
      throw new Error(`Failed to load existing skill "${skillId}"`)
    }

    const updated: Partial<Skill> = {
      ...existing,
      ...request,
      userInvocable: request.userInvocable ?? existing.userInvocable,
      disableModelInvocation: request.disableModelInvocation ?? existing.disableModelInvocation,
    }

    const skillMd = this.generateSkillMd(updated)
    await fs.writeFile(path.join(skillPath, 'SKILL.md'), skillMd)

    return this.loadSkill(skillPath, request.source) as Promise<Skill>
  }

  async delete(skillId: string, source: SkillSource, spaceId?: string): Promise<void> {
    const dir = source === 'user'
      ? this.getUserSkillsDir()
      : this.getProjectSkillsDir(spaceId!)
    const skillPath = path.join(dir, skillId)

    if (!await fs.pathExists(skillPath)) {
      throw new Error(`Skill "${skillId}" not found`)
    }

    await fs.remove(skillPath)
  }

  async rename(oldId: string, newId: string, source: SkillSource, spaceId?: string): Promise<Skill> {
    const dir = source === 'user'
      ? this.getUserSkillsDir()
      : this.getProjectSkillsDir(spaceId!)
    const oldPath = path.join(dir, oldId)
    const newPath = path.join(dir, this.sanitizeName(newId))

    if (!await fs.pathExists(oldPath)) {
      throw new Error(`Skill "${oldId}" not found`)
    }

    if (await fs.pathExists(newPath)) {
      throw new Error(`Skill "${newId}" already exists`)
    }

    await fs.move(oldPath, newPath)

    const skill = await this.loadSkill(newPath, source)
    if (skill && skill.name !== newId) {
      await this.update(this.sanitizeName(newId), {
        name: newId,
        source,
        spaceId
      })
    }

    return this.loadSkill(newPath, source) as Promise<Skill>
  }

  /**
   * 启用/禁用技能（借鉴 Cline）
   */
  async toggleSkill(skillId: string, enabled: boolean): Promise<void> {
    // TODO [P1-非阻塞]: 保存到配置文件
    const config = await this.getEnabledConfig()
    config[skillId] = enabled
    // await this.saveEnabledConfig(config)
  }

  // ========================================
  // GitHub 导入
  // ========================================

  async importFromGithub(request: ImportGithubRequest): Promise<ImportSkillResult> {
    const parsed = this.parseGithubUrl(request.url)
    if (!parsed) {
      return { success: false, error: 'Invalid GitHub URL format' }
    }

    const dir = request.targetLevel === 'user'
      ? this.getUserSkillsDir()
      : this.getProjectSkillsDir(request.spaceId!)

    const id = this.sanitizeName(request.customName || parsed.repo)
    const skillPath = path.join(dir, id)

    if (await fs.pathExists(skillPath)) {
      return { success: false, error: `Skill "${id}" already exists. Use sync to update.` }
    }

    try {
      const git = simpleGit()
      await git.clone(parsed.cloneUrl, skillPath, ['--depth', '1', '--branch', parsed.branch])

      await fs.remove(path.join(skillPath, '.git'))

      const skillFile = path.join(skillPath, 'SKILL.md')
      if (!await fs.pathExists(skillFile)) {
        await fs.remove(skillPath)
        return { success: false, error: 'No SKILL.md found in repository' }
      }

      const content = await fs.readFile(skillFile, 'utf-8')
      const validation = this.validate(content)
      if (!validation.valid) {
        await fs.remove(skillPath)
        return { success: false, error: `Invalid SKILL.md: ${validation.errors.join(', ')}` }
      }

      const skill = await this.loadSkill(skillPath, request.targetLevel)

      await this.saveRemoteMetadata(id, request.targetLevel, request.spaceId, {
        url: request.url,
        cloneUrl: parsed.cloneUrl,
        branch: parsed.branch,
        lastSync: new Date().toISOString()
      })

      return {
        success: true,
        skill,
        warnings: validation.warnings
      }
    } catch (error) {
      await fs.remove(skillPath).catch(() => {})
      return {
        success: false,
        error: `Failed to import: ${error instanceof Error ? error.message : String(error)}`
      }
    }
  }

  private parseGithubUrl(url: string): { owner: string; repo: string; cloneUrl: string; branch: string } | null {
    // 支持的格式:
    // https://github.com/owner/repo
    // https://github.com/owner/repo/tree/branch
    // https://github.com/owner/repo.git
    // git@github.com:owner/repo.git
    // owner/repo
    // owner/repo#branch

    let match: RegExpMatchArray | null
    let owner = ''
    let repo = ''
    let branch = 'main'

    // owner/repo#branch 或 owner/repo
    if (/^[\w-]+\/[\w.-]+(#.*)?$/.test(url)) {
      const [main, branchPart] = url.split('#')
      ;[owner, repo] = main.split('/')
      if (branchPart) branch = branchPart
    }
    // https://github.com/owner/repo/tree/branch
    else if ((match = url.match(/github\.com\/([\w-]+)\/([\w.-]+)\/tree\/([\w.-]+)/))) {
      owner = match[1]
      repo = match[2]
      branch = match[3]
    }
    // https://github.com/owner/repo(.git)?
    else if ((match = url.match(/github\.com\/([\w-]+)\/([\w.-]+?)(?:\.git)?(?:\/|$)/))) {
      owner = match[1]
      repo = match[2]
    }
    // git@github.com:owner/repo.git
    else if ((match = url.match(/git@github\.com:([\w-]+)\/([\w.-]+?)(?:\.git)?$/))) {
      owner = match[1]
      repo = match[2]
    }
    else {
      return null
    }

    return {
      owner,
      repo,
      cloneUrl: `https://github.com/${owner}/${repo}.git`,
      branch
    }
  }

  // ========================================
  // URL 导入
  // ========================================

  async importFromUrl(request: ImportUrlRequest): Promise<ImportSkillResult> {
    const dir = request.targetLevel === 'user'
      ? this.getUserSkillsDir()
      : this.getProjectSkillsDir(request.spaceId!)

    const id = this.sanitizeName(request.name)
    const skillPath = path.join(dir, id)

    if (await fs.pathExists(skillPath)) {
      return { success: false, error: `Skill "${id}" already exists` }
    }

    try {
      const response = await fetch(request.url)
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const content = await response.text()

      const validation = this.validate(content)
      if (!validation.valid) {
        return { success: false, error: `Invalid SKILL.md: ${validation.errors.join(', ')}` }
      }

      await fs.ensureDir(skillPath)
      await fs.writeFile(path.join(skillPath, 'SKILL.md'), content)

      const skill = await this.loadSkill(skillPath, request.targetLevel)

      return {
        success: true,
        skill,
        warnings: validation.warnings
      }
    } catch (error) {
      await fs.remove(skillPath).catch(() => {})
      return {
        success: false,
        error: `Failed to import: ${error instanceof Error ? error.message : String(error)}`
      }
    }
  }

  // ========================================
  // 本地导入
  // ========================================

  async importFromLocal(request: ImportFileRequest): Promise<ImportSkillResult> {
    const dir = request.targetLevel === 'user'
      ? this.getUserSkillsDir()
      : this.getProjectSkillsDir(request.spaceId!)

    const sourcePath = request.localPath
    const id = this.sanitizeName(path.basename(sourcePath))
    const targetPath = path.join(dir, id)

    if (!await fs.pathExists(sourcePath)) {
      return { success: false, error: 'Source directory not found' }
    }

    if (!await fs.stat(sourcePath).then(s => s.isDirectory())) {
      return { success: false, error: 'Source path is not a directory' }
    }

    if (await fs.pathExists(targetPath)) {
      return { success: false, error: `Skill "${id}" already exists` }
    }

    const sourceSkillFile = path.join(sourcePath, 'SKILL.md')
    if (!await fs.pathExists(sourceSkillFile)) {
      return { success: false, error: 'No SKILL.md found in source directory' }
    }

    const content = await fs.readFile(sourceSkillFile, 'utf-8')
    const validation = this.validate(content)
    if (!validation.valid) {
      return { success: false, error: `Invalid SKILL.md: ${validation.errors.join(', ')}` }
    }

    try {
      if (request.copyFiles) {
        await fs.copy(sourcePath, targetPath)
      } else {
        await fs.move(sourcePath, targetPath)
      }

      const skill = await this.loadSkill(targetPath, request.targetLevel)
      return {
        success: true,
        skill,
        warnings: validation.warnings
      }
    } catch (error) {
      return {
        success: false,
        error: `Failed to import: ${error instanceof Error ? error.message : String(error)}`
      }
    }
  }

  // ========================================
  // 同步
  // ========================================

  async syncFromRemote(skillId: string, source: SkillSource, spaceId?: string): Promise<ImportSkillResult> {
    const metadata = await this.getRemoteMetadata(skillId, source, spaceId)
    if (!metadata) {
      return { success: false, error: 'No remote metadata found for this skill' }
    }

    const dir = source === 'user'
      ? this.getUserSkillsDir()
      : this.getProjectSkillsDir(spaceId!)
    const skillPath = path.join(dir, skillId)

    try {
      // 备份当前版本
      const backupPath = path.join(dir, `.${skillId}.backup`)
      await fs.copy(skillPath, backupPath)

      // 删除现有目录
      await fs.remove(skillPath)

      // 重新 clone
      const git = simpleGit()
      await git.clone(metadata.cloneUrl, skillPath, ['--depth', '1', '--branch', metadata.branch])
      await fs.remove(path.join(skillPath, '.git'))

      // 验证
      const skillFile = path.join(skillPath, 'SKILL.md')
      if (!await fs.pathExists(skillFile)) {
        await fs.remove(skillPath)
        await fs.move(backupPath, skillPath)
        return { success: false, error: 'No SKILL.md found after sync, rolled back' }
      }

      // 删除备份
      await fs.remove(backupPath)

      // 更新元数据
      await this.saveRemoteMetadata(skillId, source, spaceId, {
        ...metadata,
        lastSync: new Date().toISOString()
      })

      const skill = await this.loadSkill(skillPath, source)
      return { success: true, skill }
    } catch (error) {
      // 恢复备份
      const backupPath = path.join(dir, `.${skillId}.backup`)
      if (await fs.pathExists(backupPath)) {
        await fs.remove(skillPath).catch(() => {})
        await fs.move(backupPath, skillPath)
      }
      return {
        success: false,
        error: `Failed to sync: ${error instanceof Error ? error.message : String(error)}`
      }
    }
  }

  // ========================================
  // 导出
  // ========================================

  async exportSkill(skillId: string, source: SkillSource, spaceId?: string): Promise<string> {
    const dir = source === 'user'
      ? this.getUserSkillsDir()
      : this.getProjectSkillsDir(spaceId!)
    const skillPath = path.join(dir, skillId)

    if (!await fs.pathExists(skillPath)) {
      throw new Error(`Skill "${skillId}" not found`)
    }

    const result = await dialog.showSaveDialog({
      title: 'Export Skill',
      defaultPath: `${skillId}-skill`,
      filters: [
        { name: 'ZIP Archive', extensions: ['zip'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    })

    if (result.canceled || !result.filePath) {
      throw new Error('Export cancelled')
    }

    const archiver = require('archiver')
    const output = fs.createWriteStream(result.filePath)
    const archive = archiver('zip', { zlib: { level: 9 } })

    return new Promise((resolve, reject) => {
      output.on('close', () => resolve(result.filePath!))
      archive.on('error', reject)
      archive.pipe(output)
      archive.directory(skillPath, skillId)
      archive.finalize()
    })
  }

  // ========================================
  // 验证
  // ========================================

  validate(content: string): SkillValidationResult {
    const errors: string[] = []
    const warnings: string[] = []

    if (!content.trim()) {
      errors.push('SKILL.md cannot be empty')
      return { valid: false, errors, warnings }
    }

    const { frontmatter, body } = this.parseSkillMd(content)

    if (!frontmatter.name && !body.trim()) {
      errors.push('Either name in frontmatter or body content is required')
    }

    if (frontmatter.name) {
      if (frontmatter.name.length > 64) {
        errors.push('name must be 64 characters or less')
      }
      if (!/^[a-z0-9-]+$/.test(frontmatter.name)) {
        warnings.push('name should contain only lowercase letters, numbers, and hyphens')
      }
    }

    if (frontmatter.description && frontmatter.description.length > 500) {
      warnings.push('description should be 500 characters or less')
    }

    if (frontmatter['allowed-tools']) {
      const validToolPrefixes = ['Read', 'Write', 'Edit', 'Bash', 'Grep', 'Glob', 'WebFetch', 'WebSearch', 'LSP', 'TodoWrite', 'Task', 'NotebookEdit']
      for (const tool of frontmatter['allowed-tools']) {
        // 支持 "Edit(*.md)" 格式的工具+文件范围限制
        const toolName = tool.replace(/\(.*\)$/, '')
        if (!validToolPrefixes.includes(toolName)) {
          warnings.push(`Unknown tool: ${tool}`)
        }
      }
    }

    // 验证 hooks 格式
    if (frontmatter.hooks) {
      if (frontmatter.hooks['pre-invoke']) {
        for (const hook of frontmatter.hooks['pre-invoke']) {
          if (!hook.command) {
            errors.push('Hook pre-invoke must have a command field')
          }
        }
      }
      if (frontmatter.hooks['post-invoke']) {
        for (const hook of frontmatter.hooks['post-invoke']) {
          if (!hook.command) {
            errors.push('Hook post-invoke must have a command field')
          }
        }
      }
    }

    // 验证 globs 格式
    if (frontmatter.globs) {
      const globs = Array.isArray(frontmatter.globs) ? frontmatter.globs : [frontmatter.globs]
      for (const glob of globs) {
        if (typeof glob !== 'string') {
          errors.push('globs must be strings')
        }
      }
    }

    if (body.length > 50000) {
      warnings.push('Body content exceeds 50KB, consider splitting into supporting files')
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    }
  }

  // ========================================
  // 工具方法
  // ========================================

  private sanitizeName(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 64)
  }

  private async saveRemoteMetadata(
    skillId: string,
    source: SkillSource,
    spaceId: string | undefined,
    metadata: { url: string; cloneUrl: string; branch: string; lastSync: string }
  ): Promise<void> {
    // TODO [P1-非阻塞]: 保存到配置文件或数据库
    // 需要对接现有的配置系统
  }

  private async getRemoteMetadata(
    skillId: string,
    source: SkillSource,
    spaceId: string | undefined
  ): Promise<{ url: string; cloneUrl: string; branch: string; lastSync: string } | null> {
    // TODO [P1-非阻塞]: 从配置文件或数据库读取
    return null
  }
}

export const skillsService = new SkillsService()
```

---

## 六、UI 组件实现

### 6.1 SkillsList

文件位置: `src/renderer/components/skills/SkillsList.tsx`

```tsx
import { useState, useEffect } from 'react'
import { api } from '../../api'
import { useSpaceStore } from '../../stores/space.store'
import { SkillCard } from './SkillCard'
import { ImportSkillDialog } from './ImportSkillDialog'
import { CreateSkillDialog } from './CreateSkillDialog'
import { Plus, Download, RefreshCw, Wand2 } from 'lucide-react'
import { useTranslation } from '../../i18n'
import type { Skill, SkillsListResponse } from '../../../../shared/types/skill'

export function SkillsList() {
  const { t } = useTranslation()
  const currentSpace = useSpaceStore(state => state.currentSpace)

  const [skills, setSkills] = useState<SkillsListResponse | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [showImportDialog, setShowImportDialog] = useState(false)
  const [showCreateDialog, setShowCreateDialog] = useState(false)

  const loadSkills = async () => {
    setIsLoading(true)
    try {
      const result = await api.invoke<SkillsListResponse>('skills:list', currentSpace?.id)
      setSkills(result)
    } catch (error) {
      console.error('[SkillsList] Failed to load skills:', error)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadSkills()
  }, [currentSpace?.id])

  const handleImportSuccess = () => {
    setShowImportDialog(false)
    loadSkills()
  }

  const handleCreateSuccess = () => {
    setShowCreateDialog(false)
    loadSkills()
  }

  const handleDelete = async (skill: Skill) => {
    try {
      await api.invoke('skills:delete', skill.id, skill.source, currentSpace?.id)
      loadSkills()
    } catch (error) {
      console.error('[SkillsList] Failed to delete skill:', error)
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <RefreshCw className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const totalSkills = (skills?.userSkills.length || 0) + (skills?.projectSkills.length || 0)

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex-shrink-0 p-2 border-b border-border">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-muted-foreground">
            {totalSkills} {t('skills')}
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setShowImportDialog(true)}
              className="p-1.5 hover:bg-secondary rounded transition-colors"
              title={t('Import skill')}
            >
              <Download className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setShowCreateDialog(true)}
              className="p-1.5 hover:bg-secondary rounded transition-colors"
              title={t('Create skill')}
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-2">
        {/* User Skills */}
        {skills?.userSkills && skills.userSkills.length > 0 && (
          <div className="mb-4">
            <h3 className="text-xs font-medium text-muted-foreground mb-2 px-1">
              {t('User Skills')}
            </h3>
            <div className="space-y-2">
              {skills.userSkills.map(skill => (
                <SkillCard
                  key={`user-${skill.id}`}
                  skill={skill}
                  onDelete={() => handleDelete(skill)}
                  onUpdate={loadSkills}
                />
              ))}
            </div>
          </div>
        )}

        {/* Project Skills */}
        {skills?.projectSkills && skills.projectSkills.length > 0 && (
          <div className="mb-4">
            <h3 className="text-xs font-medium text-muted-foreground mb-2 px-1">
              {t('Project Skills')}
            </h3>
            <div className="space-y-2">
              {skills.projectSkills.map(skill => (
                <SkillCard
                  key={`project-${skill.id}`}
                  skill={skill}
                  onDelete={() => handleDelete(skill)}
                  onUpdate={loadSkills}
                />
              ))}
            </div>
          </div>
        )}

        {/* Empty State */}
        {totalSkills === 0 && (
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

      {/* Dialogs */}
      {showImportDialog && (
        <ImportSkillDialog
          spaceId={currentSpace?.id}
          onClose={() => setShowImportDialog(false)}
          onSuccess={handleImportSuccess}
        />
      )}
      {showCreateDialog && (
        <CreateSkillDialog
          spaceId={currentSpace?.id}
          onClose={() => setShowCreateDialog(false)}
          onSuccess={handleCreateSuccess}
        />
      )}
    </div>
  )
}
```

### 6.2 SkillCard

文件位置: `src/renderer/components/skills/SkillCard.tsx`

```tsx
import { useState } from 'react'
import { api } from '../../api'
import { SkillEditorDialog } from './SkillEditorDialog'
import { Trash2, Edit, RefreshCw, MoreVertical, Zap, Lock, FileText } from 'lucide-react'
import { useTranslation } from '../../i18n'
import type { Skill } from '../../../../shared/types/skill'

interface SkillCardProps {
  skill: Skill
  onDelete: () => void
  onUpdate: () => void
}

export function SkillCard({ skill, onDelete, onUpdate }: SkillCardProps) {
  const { t } = useTranslation()
  const [showEditor, setShowEditor] = useState(false)
  const [showMenu, setShowMenu] = useState(false)
  const [isSyncing, setIsSyncing] = useState(false)

  const handleSync = async () => {
    if (!skill.remoteUrl) return
    setIsSyncing(true)
    try {
      await api.invoke('skills:sync', skill.id, skill.source)
      onUpdate()
    } catch (error) {
      console.error('[SkillCard] Failed to sync:', error)
    } finally {
      setIsSyncing(false)
    }
    setShowMenu(false)
  }

  return (
    <>
      <div className="group relative bg-secondary/30 hover:bg-secondary/50 rounded-lg p-2 transition-colors">
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
            <button
              onClick={() => setShowEditor(true)}
              className="p-1 hover:bg-secondary rounded"
              title={t('Edit')}
            >
              <Edit className="w-3 h-3" />
            </button>
            <div className="relative">
              <button
                onClick={() => setShowMenu(!showMenu)}
                className="p-1 hover:bg-secondary rounded"
              >
                <MoreVertical className="w-3 h-3" />
              </button>

              {showMenu && (
                <div className="absolute right-0 top-full mt-1 bg-popover border border-border rounded-lg shadow-lg py-1 z-10 min-w-[120px]">
                  {skill.remoteUrl && (
                    <button
                      onClick={handleSync}
                      disabled={isSyncing}
                      className="w-full px-3 py-1.5 text-xs text-left hover:bg-secondary flex items-center gap-2"
                    >
                      <RefreshCw className={`w-3 h-3 ${isSyncing ? 'animate-spin' : ''}`} />
                      {t('Sync from remote')}
                    </button>
                  )}
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

          {skill.hasSupportingFiles && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-secondary text-muted-foreground flex items-center gap-0.5">
              <FileText className="w-2.5 h-2.5" />
              {skill.supportingFiles?.length}
            </span>
          )}

          {skill.allowedTools && skill.allowedTools.length > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-secondary text-muted-foreground">
              {skill.allowedTools.length} {t('tools')}
            </span>
          )}
        </div>
      </div>

      {showEditor && (
        <SkillEditorDialog
          skill={skill}
          onClose={() => setShowEditor(false)}
          onSuccess={onUpdate}
        />
      )}
    </>
  )
}
```

### 6.3 ImportSkillDialog

文件位置: `src/renderer/components/skills/ImportSkillDialog.tsx`

```tsx
import { useState } from 'react'
import { api } from '../../api'
import { X, Github, Link, FolderOpen, Loader2, Check, AlertCircle, Zap } from 'lucide-react'
import { useTranslation } from '../../i18n'
import type { ImportSkillResult, Skill } from '../../../../shared/types/skill'

type ImportSource = 'github' | 'url' | 'file'

interface ImportSkillDialogProps {
  spaceId?: string
  onClose: () => void
  onSuccess: () => void
}

export function ImportSkillDialog({ spaceId, onClose, onSuccess }: ImportSkillDialogProps) {
  const { t } = useTranslation()

  const [source, setSource] = useState<ImportSource>('github')
  const [targetLevel, setTargetLevel] = useState<'user' | 'project'>('project')
  const [url, setUrl] = useState('')
  const [localPath, setLocalPath] = useState('')
  const [customName, setCustomName] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [result, setResult] = useState<ImportSkillResult | null>(null)

  const handleImport = async () => {
    setIsLoading(true)
    setResult(null)

    try {
      let importResult: ImportSkillResult

      if (source === 'github') {
        importResult = await api.invoke<ImportSkillResult>('skills:import:github', {
          url,
          targetLevel,
          spaceId: targetLevel === 'project' ? spaceId : undefined,
          customName: customName || undefined
        })
      } else if (source === 'url') {
        importResult = await api.invoke<ImportSkillResult>('skills:import:url', {
          url,
          targetLevel,
          spaceId: targetLevel === 'project' ? spaceId : undefined,
          name: customName
        })
      } else {
        importResult = await api.invoke<ImportSkillResult>('skills:import:file', {
          localPath,
          targetLevel,
          spaceId: targetLevel === 'project' ? spaceId : undefined,
          copyFiles: true
        })
      }

      setResult(importResult)
    } catch (error) {
      setResult({
        success: false,
        error: error instanceof Error ? error.message : String(error)
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleConfirm = () => {
    onSuccess()
    onClose()
  }

  const isValid = () => {
    if (source === 'github') return url.trim().length > 0
    if (source === 'url') return url.trim().length > 0 && customName.trim().length > 0
    if (source === 'file') return localPath.trim().length > 0
    return false
  }

  const handleBrowseFolder = async () => {
    const result = await api.showOpenDialog({
      properties: ['openDirectory'],
      title: t('Select skill folder')
    })
    if (!result.canceled && result.filePaths[0]) {
      setLocalPath(result.filePaths[0])
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
      <div className="w-[500px] max-h-[80vh] bg-card border border-border rounded-xl shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="text-lg font-semibold">{t('Import Skill')}</h2>
          <button onClick={onClose} className="p-1 hover:bg-secondary rounded">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-4 space-y-4">
          {/* Source Tabs */}
          <div className="flex gap-1 p-1 bg-secondary/50 rounded-lg">
            <button
              onClick={() => setSource('github')}
              className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-md text-sm transition-colors ${
                source === 'github' ? 'bg-background shadow' : 'hover:bg-secondary'
              }`}
            >
              <Github className="w-4 h-4" />
              GitHub
            </button>
            <button
              onClick={() => setSource('url')}
              className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-md text-sm transition-colors ${
                source === 'url' ? 'bg-background shadow' : 'hover:bg-secondary'
              }`}
            >
              <Link className="w-4 h-4" />
              URL
            </button>
            <button
              onClick={() => setSource('file')}
              className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-md text-sm transition-colors ${
                source === 'file' ? 'bg-background shadow' : 'hover:bg-secondary'
              }`}
            >
              <FolderOpen className="w-4 h-4" />
              {t('Local')}
            </button>
          </div>

          {/* URL Input */}
          {(source === 'github' || source === 'url') && (
            <div>
              <label className="text-sm text-muted-foreground mb-1.5 block">
                {source === 'github' ? 'GitHub URL' : 'Raw File URL'}
              </label>
              <input
                type="text"
                value={url}
                onChange={e => setUrl(e.target.value)}
                placeholder={
                  source === 'github'
                    ? 'https://github.com/user/skill-repo or user/repo'
                    : 'https://example.com/SKILL.md'
                }
                className="w-full px-3 py-2 bg-secondary/50 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
              {source === 'github' && (
                <p className="text-xs text-muted-foreground mt-1">
                  {t('Supports: owner/repo, https URL, or SSH URL')}
                </p>
              )}
            </div>
          )}

          {/* Local Path */}
          {source === 'file' && (
            <div>
              <label className="text-sm text-muted-foreground mb-1.5 block">
                {t('Local folder')}
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={localPath}
                  onChange={e => setLocalPath(e.target.value)}
                  placeholder="/path/to/skill-folder"
                  className="flex-1 px-3 py-2 bg-secondary/50 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
                <button
                  onClick={handleBrowseFolder}
                  className="px-3 py-2 bg-secondary hover:bg-secondary/80 rounded-lg text-sm"
                >
                  {t('Browse')}
                </button>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {t('Folder must contain SKILL.md file')}
              </p>
            </div>
          )}

          {/* Custom Name */}
          <div>
            <label className="text-sm text-muted-foreground mb-1.5 block">
              {source === 'url' ? t('Skill name *') : t('Custom name (optional)')}
            </label>
            <input
              type="text"
              value={customName}
              onChange={e => setCustomName(e.target.value)}
              placeholder="my-skill"
              className="w-full px-3 py-2 bg-secondary/50 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>

          {/* Target Level */}
          <div>
            <label className="text-sm text-muted-foreground mb-1.5 block">
              {t('Import to')}
            </label>
            <div className="flex gap-2">
              <button
                onClick={() => setTargetLevel('user')}
                className={`flex-1 px-3 py-2 rounded-lg text-sm border transition-colors ${
                  targetLevel === 'user'
                    ? 'border-primary bg-primary/10'
                    : 'border-border hover:bg-secondary'
                }`}
              >
                {t('User Skills')}
                <p className="text-xs text-muted-foreground mt-0.5">{t('Available globally')}</p>
              </button>
              <button
                onClick={() => setTargetLevel('project')}
                disabled={!spaceId}
                className={`flex-1 px-3 py-2 rounded-lg text-sm border transition-colors ${
                  targetLevel === 'project'
                    ? 'border-primary bg-primary/10'
                    : 'border-border hover:bg-secondary'
                } ${!spaceId ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                {t('Project Skills')}
                <p className="text-xs text-muted-foreground mt-0.5">{t('Current space only')}</p>
              </button>
            </div>
          </div>

          {/* Result Preview */}
          {result && (
            <div className={`p-3 rounded-lg ${
              result.success ? 'bg-green-500/10 border border-green-500/30' : 'bg-destructive/10 border border-destructive/30'
            }`}>
              {result.success ? (
                <div className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-green-500 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-green-600">{t('Import successful')}</p>
                    {result.skill && (
                      <p className="text-xs text-muted-foreground mt-1">
                        {result.skill.name}: {result.skill.description}
                      </p>
                    )}
                    {result.warnings && result.warnings.length > 0 && (
                      <p className="text-xs text-yellow-600 mt-1">
                        {result.warnings.join(', ')}
                      </p>
                    )}
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-destructive mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-destructive">{t('Import failed')}</p>
                    <p className="text-xs text-muted-foreground mt-1">{result.error}</p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 p-4 border-t border-border">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm hover:bg-secondary rounded-lg transition-colors"
          >
            {t('Cancel')}
          </button>
          {result?.success ? (
            <button
              onClick={handleConfirm}
              className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
            >
              {t('Done')}
            </button>
          ) : (
            <button
              onClick={handleImport}
              disabled={!isValid() || isLoading}
              className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
              {t('Import')}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
```

---

## 七、ArtifactRail 修改

### 文件位置: `src/renderer/components/artifact/ArtifactRail.tsx`

在现有文件中进行以下修改：

```tsx
// ========================================
// 1. 新增导入
// ========================================
import { SkillsList } from '../skills/SkillsList'
import { Zap } from 'lucide-react'

// ========================================
// 2. 新增状态 (在组件内部)
// ========================================
const [activeTab, setActiveTab] = useState<'files' | 'skills'>('files')

// ========================================
// 3. 修改 Header 下方添加 Tab 切换
// 在 <div className="flex-shrink-0 px-3 h-10 ..."> 后添加:
// ========================================

{isExpanded && (
  <div className="flex border-b border-border">
    <button
      onClick={() => setActiveTab('files')}
      className={`flex-1 py-1.5 text-xs font-medium transition-colors ${
        activeTab === 'files'
          ? 'text-primary border-b-2 border-primary'
          : 'text-muted-foreground hover:text-foreground'
      }`}
    >
      {t('Files')}
    </button>
    <button
      onClick={() => setActiveTab('skills')}
      className={`flex-1 py-1.5 text-xs font-medium transition-colors ${
        activeTab === 'skills'
          ? 'text-primary border-b-2 border-primary'
          : 'text-muted-foreground hover:text-foreground'
      }`}
    >
      {t('Skills')}
    </button>
  </div>
)}

// ========================================
// 4. 修改 Content 区域
// 将 {isExpanded && renderContent()} 替换为:
// ========================================

{isExpanded && (
  activeTab === 'files' ? renderContent() : <SkillsList />
)}

// ========================================
// 5. 修改折叠状态的图标区
// 在底部添加 Skills 图标:
// ========================================

{!isExpanded && (
  <div className="flex-1 flex flex-col items-center py-4 gap-2">
    {/* 现有的 Folder 和 Browser 按钮 */}
    <button
      onClick={handleOpenFolder}
      className="p-2 hover:bg-secondary rounded-lg transition-colors"
      title={t('Open folder')}
    >
      <FolderOpen className="w-5 h-5 text-amber-500" />
    </button>
    <button
      onClick={handleOpenBrowser}
      className="p-2 hover:bg-secondary rounded-lg transition-colors"
      title={t('Open browser')}
    >
      <Globe className="w-5 h-5 text-blue-500" />
    </button>
    {/* 新增 Skills 按钮 */}
    <button
      onClick={() => {
        setActiveTab('skills')
        if (!isExpanded) {
          handleToggleExpanded()
        }
      }}
      className="p-2 hover:bg-secondary rounded-lg transition-colors"
      title={t('Skills')}
    >
      <Zap className="w-5 h-5 text-yellow-500" />
    </button>
  </div>
)}
```

---

## 八、ChatInput 集成

### 文件位置: `src/renderer/components/chat/ChatInput.tsx`

在现有文件中进行以下修改：

```tsx
// ========================================
// 1. 新增导入
// ========================================
import { useState, useEffect, useRef } from 'react'
import { api } from '../../api'
import { Zap } from 'lucide-react'
import type { Skill } from '../../../../shared/types/skill'

// ========================================
// 2. 新增状态 (在组件内部)
// ========================================
const [skillSuggestions, setSkillSuggestions] = useState<Skill[]>([])
const [showSkillSuggestions, setShowSkillSuggestions] = useState(false)
const [allSkills, setAllSkills] = useState<Skill[]>([])
const suggestionsRef = useRef<HTMLDivElement>(null)

// ========================================
// 3. 加载所有技能
// ========================================
useEffect(() => {
  api.invoke<{ userSkills: Skill[]; projectSkills: Skill[] }>('skills:list', spaceId)
    .then(result => {
      setAllSkills([...result.userSkills, ...result.projectSkills])
    })
}, [spaceId])

// ========================================
// 4. 监听输入变化 (在 handleInputChange 中添加)
// ========================================
const handleInputChange = (value: string) => {
  // 现有逻辑...

  // 检测 / 开头显示技能建议
  if (value.startsWith('/') && value.length > 1) {
    const query = value.slice(1).toLowerCase()
    const matches = allSkills.filter(s =>
      s.userInvocable &&
      (s.id.toLowerCase().includes(query) || s.name.toLowerCase().includes(query))
    )
    setSkillSuggestions(matches)
    setShowSkillSuggestions(matches.length > 0)
  } else if (value === '/') {
    // 显示所有可调用的技能
    const invocable = allSkills.filter(s => s.userInvocable)
    setSkillSuggestions(invocable)
    setShowSkillSuggestions(invocable.length > 0)
  } else {
    setShowSkillSuggestions(false)
  }
}

// ========================================
// 5. 插入技能
// ========================================
const insertSkill = (skill: Skill) => {
  const newValue = `/${skill.id} `
  setInputValue(newValue)
  setShowSkillSuggestions(false)
  textareaRef.current?.focus()
}

// ========================================
// 6. 渲染技能建议 (在输入框上方)
// ========================================
{showSkillSuggestions && (
  <div
    ref={suggestionsRef}
    className="absolute bottom-full left-0 right-0 mb-2 bg-popover border border-border rounded-lg shadow-lg max-h-60 overflow-auto z-10"
  >
    {skillSuggestions.map(skill => (
      <button
        key={skill.id}
        onClick={() => insertSkill(skill)}
        className="w-full px-3 py-2 text-left hover:bg-secondary flex items-center gap-2"
      >
        <Zap className="w-4 h-4 text-yellow-500 flex-shrink-0" />
        <div className="min-w-0">
          <span className="font-medium text-sm">/{skill.id}</span>
          <p className="text-xs text-muted-foreground truncate">
            {skill.description || t('No description')}
          </p>
        </div>
        {skill.argumentHint && (
          <span className="text-xs text-muted-foreground/60">
            {skill.argumentHint}
          </span>
        )}
      </button>
    ))}
  </div>
)}
```

---

## 九、API 层

### 文件位置: `src/renderer/api/skills.ts`

```typescript
import { api } from './index'
import type {
  Skill,
  CreateSkillRequest,
  UpdateSkillRequest,
  ImportGithubRequest,
  ImportUrlRequest,
  ImportFileRequest,
  ImportSkillResult,
  SkillsListResponse,
  SkillValidationResult
} from '../../shared/types/skill'

export const skillsApi = {
  // 查询
  list: (spaceId?: string) =>
    api.invoke<SkillsListResponse>('skills:list', spaceId),

  get: (skillId: string, source: 'user' | 'project', spaceId?: string) =>
    api.invoke<Skill>('skills:get', skillId, source, spaceId),

  exists: (name: string, source: 'user' | 'project', spaceId?: string) =>
    api.invoke<boolean>('skills:exists', name, source, spaceId),

  // CRUD
  create: (request: CreateSkillRequest) =>
    api.invoke<Skill>('skills:create', request),

  update: (skillId: string, request: UpdateSkillRequest) =>
    api.invoke<Skill>('skills:update', skillId, request),

  delete: (skillId: string, source: 'user' | 'project', spaceId?: string) =>
    api.invoke<void>('skills:delete', skillId, source, spaceId),

  rename: (oldId: string, newId: string, source: 'user' | 'project', spaceId?: string) =>
    api.invoke<Skill>('skills:rename', oldId, newId, source, spaceId),

  // 导入
  importFromGithub: (request: ImportGithubRequest) =>
    api.invoke<ImportSkillResult>('skills:import:github', request),

  importFromUrl: (request: ImportUrlRequest) =>
    api.invoke<ImportSkillResult>('skills:import:url', request),

  importFromLocal: (request: ImportFileRequest) =>
    api.invoke<ImportSkillResult>('skills:import:file', request),

  // 导出/同步
  export: (skillId: string, source: 'user' | 'project', spaceId?: string) =>
    api.invoke<string>('skills:export', skillId, source, spaceId),

  sync: (skillId: string, source: 'user' | 'project', spaceId?: string) =>
    api.invoke<ImportSkillResult>('skills:sync', skillId, source, spaceId),

  // 验证
  validate: (content: string) =>
    api.invoke<SkillValidationResult>('skills:validate', content),
}
```

---

## 十、实现计划

> 详见 **十六、更新后的实现计划** 获取完整计划（含新增特性的工作量评估）。

以下为初始基础计划概览：

| 阶段 | 内容 | 预估工作量 |
|------|------|-----------|
| **Phase 1** | 基础框架（类型 + Service + IPC） | ~4h |
| **Phase 2** | UI 组件（5 个对话框/列表） | ~9h |
| **Phase 3** | 集成（ArtifactRail + ChatInput + API） | ~3h |
| **Phase 4** | Message 展示（Skill 调用图标/详情） | ~3h |
| **Phase 5** | 权限管理 | ~2.5h |
| **Phase 6** | 测试与优化 | ~4h |

**新增特性额外工作量**：动态上下文注入 1.5h + Glob 匹配 1h + Monorepo 发现 1.5h + 兼容格式 1h

**总计: ~31h**

---

## 十一、关键决策点

> 详见 **十八、关键决策更新** 获取完整决策表。以下为初始核心决策：

| 决策项 | 选择 | 原因 |
|--------|------|------|
| **SKILL.md 格式** | 完全兼容 Claude Code 标准 | 保持生态兼容性 |
| **存储层级** | 4 层（enterprise > user > project > extension） | 对齐 Claude Code 官方架构 |
| **扩展字段** | `when-to-use`, `globs`, `always-apply`, `hooks` | 融合各家优势 |
| **兼容格式** | 自动识别 .cursorrules, .windsurfrules, AGENTS.md | 降低用户迁移成本 |
| **UI 位置** | ArtifactRail Tab 形式 | 不增加额外空间，逻辑相近 |
| **Session 刷新** | 提示下次对话生效 | Skills 在 Session 创建时加载 |

---

## 十二、Message 中 Skill 调用展示

### 12.1 现有 Tool 展示机制

Halo 现有架构通过以下组件展示工具调用：

| 组件 | 位置 | 用途 |
|------|------|------|
| `ThoughtProcess.tsx` | 实时对话 | 展示思考过程和工具调用 |
| `CollapsedThoughtProcess.tsx` | 历史消息 | 折叠状态下的思考过程 |
| `thought-utils.ts` | 工具函数 | 图标、颜色、友好格式化 |
| `ToolIcons.tsx` | 图标映射 | 工具名称到图标的映射 |

**核心类型定义** (`src/renderer/types/index.ts`)：

```typescript
interface Thought {
  type: 'thinking' | 'tool_use' | 'tool_result' | 'text' | 'system' | 'error' | 'result'
  toolName?: string
  toolInput?: Record<string, unknown>
  toolResult?: {
    output?: string
    isError?: boolean
  }
  // ...
}
```

### 12.2 Skill 调用的识别方式

SDK 中 Skill 工具的调用特征：

```typescript
// 当用户输入 /skill-name 或 AI 自动匹配时
{
  type: 'tool_use',
  toolName: 'Skill',                    // 固定为 'Skill'
  toolInput: {
    skill: 'code-commit',               // 技能 ID
    args: 'commit message here'         // 可选参数
  }
}
```

### 12.3 Skill 展示方案

#### 方案 A：在现有 Tool 展示中增强（推荐）

**修改文件**: `src/renderer/components/chat/thought-utils.ts`

```typescript
// 新增 Skill 友好格式化
export function getToolFriendlyFormat(
  toolName: string,
  toolInput?: Record<string, unknown>
): string {
  if (!toolInput) return ''

  // 新增 Skill 处理
  if (toolName === 'Skill') {
    const skillName = typeof toolInput.skill === 'string' ? toolInput.skill : ''
    const args = typeof toolInput.args === 'string' ? toolInput.args : ''
    if (args) {
      return `${skillName}: ${truncateText(args, 50)}`
    }
    return skillName || 'Unknown skill'
  }

  // 现有逻辑...
}

// 新增 Skill 标签获取
export function getThoughtLabelKey(type: Thought['type'], toolName?: string): string {
  switch (type) {
    case 'tool_use':
      if (toolName === 'Skill') return 'Invoking skill'  // 新增
      return 'Tool call'
    // ...
  }
}
```

**修改文件**: `src/renderer/components/icons/ToolIcons.tsx`

```typescript
// 新增 Skill 图标映射
export const toolIconMap: Record<string, LucideIcon> = {
  // 现有映射...

  // 新增
  Skill: Zap,  // 使用黄色闪电图标
}

// 新增 Skill 专用颜色
export const skillIconColors: Record<string, string> = {
  Skill: 'text-yellow-500',
}

export function getToolIconColor(toolName: string): string {
  return skillIconColors[toolName] || 'text-amber-400'
}
```

#### Message 中的展示效果

```
┌─────────────────────────────────────────────────────────────┐
│  [⚡ Invoking skill]                        [Generating...]  │
│  code-commit: fix authentication bug                        │
└─────────────────────────────────────────────────────────────┘
```

### 12.4 Skill 调用详情展开

**新增组件**: `src/renderer/components/chat/SkillCallDetail.tsx`

```tsx
import { Zap, ChevronDown, ChevronUp } from 'lucide-react'
import { useState } from 'react'
import { MarkdownRenderer } from './MarkdownRenderer'

interface SkillCallDetailProps {
  skillId: string
  args?: string
  skillContent?: string  // SKILL.md 内容（可选，用于展示）
}

export function SkillCallDetail({ skillId, args, skillContent }: SkillCallDetailProps) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg overflow-hidden">
      {/* Header */}
      <div
        className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-yellow-500/10"
        onClick={() => setExpanded(!expanded)}
      >
        <Zap className="w-4 h-4 text-yellow-500" />
        <span className="text-sm font-medium">/{skillId}</span>
        {args && (
          <span className="text-xs text-muted-foreground truncate flex-1">
            {args}
          </span>
        )}
        {expanded ? (
          <ChevronUp className="w-4 h-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        )}
      </div>

      {/* Expanded content */}
      {expanded && skillContent && (
        <div className="px-3 py-2 border-t border-yellow-500/20 bg-background/50">
          <p className="text-xs text-muted-foreground mb-2">Skill instructions:</p>
          <div className="text-xs prose prose-sm dark:prose-invert max-w-none">
            <MarkdownRenderer content={skillContent} />
          </div>
        </div>
      )}
    </div>
  )
}
```

### 12.5 ThoughtProcess 集成

**修改文件**: `src/renderer/components/chat/ThoughtProcess.tsx`

```tsx
// 在 SingleThoughtItem 组件中新增 Skill 特殊处理

import { SkillCallDetail } from './SkillCallDetail'

function SingleThoughtItem({ thought, ... }: { thought: Thought, ... }) {
  // 现有逻辑...

  // 新增：检测是否为 Skill 调用
  const isSkillCall = thought.type === 'tool_use' && thought.toolName === 'Skill'

  if (isSkillCall && thought.toolInput) {
    const skillId = thought.toolInput.skill as string
    const args = thought.toolInput.args as string | undefined

    return (
      <div className={/* ... */}>
        <SkillCallDetail
          skillId={skillId}
          args={args}
          // skillContent 可以通过 API 获取（可选）
        />

        {/* Tool result */}
        {hasToolResult && thought.toolResult?.output && (
          <ToolResultViewer
            toolName={thought.toolName || ''}
            output={thought.toolResult.output}
            isError={thought.toolResult.isError}
          />
        )}
      </div>
    )
  }

  // 现有的非 Skill 工具展示逻辑...
}
```

### 12.6 其他 Agent 客户端对比

| 客户端 | Skill 展示方式 | 特点 |
|--------|---------------|------|
| **Claude Code CLI** | 文本输出 + 代码高亮 | 简洁，无特殊 UI |
| **Cursor** | 无 Skills 概念，Rules 静默应用 | 在状态栏显示 "Rules applied" |
| **Roo Code** | 模式切换器 + 状态指示 | 明确显示当前模式 |
| **Windsurf** | 无特殊展示 | Rules 作为上下文注入 |
| **Cline** | 工具调用列表中显示 | 与普通工具无异 |

**Halo 的差异化**：
- 使用黄色闪电图标区分 Skill 与普通工具
- 可展开查看 Skill 的具体指令内容
- 在消息中明确标识 "Invoking skill"

### 12.7 完整展示流程

```
用户输入: /code-commit fix bug
        ↓
AI 识别为 Skill 调用
        ↓
ThoughtProcess 显示:
┌─────────────────────────────────────────────────────────────┐
│  ⚡ Invoking skill                           [Generating...] │
│  code-commit: fix bug                                       │
└─────────────────────────────────────────────────────────────┘
        ↓
Skill 执行完成
        ↓
ThoughtProcess 更新:
┌─────────────────────────────────────────────────────────────┐
│  ⚡ Invoking skill                                   [Done]  │
│  code-commit: fix bug                                       │
│  ─────────────────────────────────────────────────────────  │
│  [Tool Result]                                              │
│  Committed successfully: abc1234                            │
└─────────────────────────────────────────────────────────────┘
        ↓
AI 输出最终回复
```

---

## 十三、依赖安装

```bash
# 新增依赖
npm install simple-git js-yaml archiver minimatch
npm install -D @types/js-yaml @types/archiver @types/minimatch
```

---

## 十四、国际化

需要在 `src/renderer/i18n/locales/*.json` 中添加以下 key：

```json
{
  "skills": "skills",
  "User Skills": "User Skills",
  "Project Skills": "Project Skills",
  "Enterprise Skills": "Enterprise Skills",
  "Compatible Rules": "Compatible Rules",
  "No skills yet": "No skills yet",
  "Create or import skills to extend AI capabilities": "Create or import skills to extend AI capabilities",
  "Import skill": "Import skill",
  "Create skill": "Create skill",
  "Import Skill": "Import Skill",
  "Create Skill": "Create Skill",
  "Edit Skill": "Edit Skill",
  "GitHub URL": "GitHub URL",
  "Raw File URL": "Raw File URL",
  "Local folder": "Local folder",
  "Skill name *": "Skill name *",
  "Custom name (optional)": "Custom name (optional)",
  "Import to": "Import to",
  "Available globally": "Available globally",
  "Current space only": "Current space only",
  "Import": "Import",
  "Import successful": "Import successful",
  "Import failed": "Import failed",
  "Folder must contain SKILL.md file": "Folder must contain SKILL.md file",
  "Supports: owner/repo, https URL, or SSH URL": "Supports: owner/repo, https URL, or SSH URL",
  "Sync from remote": "Sync from remote",
  "Not user-invocable": "Not user-invocable",
  "tools": "tools",
  "Enabled": "Enabled",
  "Disabled": "Disabled",
  "Read-only (auto-detected)": "Read-only (auto-detected)",
  "Permissions": "Permissions",
  "Allow": "Allow",
  "Deny": "Deny",
  "Condition triggers": "Condition triggers",
  "Always active": "Always active"
}
```

---

## 十五、缺失组件实现

### 15.1 CreateSkillDialog

文件位置: `src/renderer/components/skills/CreateSkillDialog.tsx`

```tsx
import { useState } from 'react'
import { api } from '../../api'
import { X, Loader2, Plus, Minus } from 'lucide-react'
import { useTranslation } from '../../i18n'
import type { CreateSkillRequest, SkillSource } from '../../../../shared/types/skill'

interface CreateSkillDialogProps {
  spaceId?: string
  onClose: () => void
  onSuccess: () => void
}

export function CreateSkillDialog({ spaceId, onClose, onSuccess }: CreateSkillDialogProps) {
  const { t } = useTranslation()

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [content, setContent] = useState('')
  const [source, setSource] = useState<SkillSource>('project')
  const [userInvocable, setUserInvocable] = useState(true)
  const [argumentHint, setArgumentHint] = useState('')
  const [allowedTools, setAllowedTools] = useState<string[]>([])
  const [newTool, setNewTool] = useState('')
  const [globs, setGlobs] = useState('')
  const [alwaysApply, setAlwaysApply] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showAdvanced, setShowAdvanced] = useState(false)

  const handleCreate = async () => {
    setIsLoading(true)
    setError(null)

    try {
      const request: CreateSkillRequest = {
        name,
        description: description || undefined,
        content,
        source,
        spaceId: source === 'project' ? spaceId : undefined,
        userInvocable,
        argumentHint: argumentHint || undefined,
        allowedTools: allowedTools.length > 0 ? allowedTools : undefined,
        globs: globs ? globs.split(',').map(g => g.trim()) : undefined,
        alwaysApply,
      }

      await api.invoke('skills:create', request)
      onSuccess()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setIsLoading(false)
    }
  }

  const addTool = () => {
    if (newTool.trim() && !allowedTools.includes(newTool.trim())) {
      setAllowedTools([...allowedTools, newTool.trim()])
      setNewTool('')
    }
  }

  const removeTool = (tool: string) => {
    setAllowedTools(allowedTools.filter(t => t !== tool))
  }

  const isValid = name.trim().length > 0 && content.trim().length > 0

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
      <div className="w-[600px] max-h-[85vh] bg-card border border-border rounded-xl shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="text-lg font-semibold">{t('Create Skill')}</h2>
          <button onClick={onClose} className="p-1 hover:bg-secondary rounded">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-4 space-y-4">
          {/* Name */}
          <div>
            <label className="text-sm text-muted-foreground mb-1.5 block">
              {t('Skill name *')}
            </label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="my-skill-name"
              className="w-full px-3 py-2 bg-secondary/50 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Lowercase letters, numbers, and hyphens only
            </p>
          </div>

          {/* Description */}
          <div>
            <label className="text-sm text-muted-foreground mb-1.5 block">Description</label>
            <input
              type="text"
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="What does this skill do?"
              className="w-full px-3 py-2 bg-secondary/50 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>

          {/* Source */}
          <div>
            <label className="text-sm text-muted-foreground mb-1.5 block">{t('Import to')}</label>
            <div className="flex gap-2">
              <button
                onClick={() => setSource('user')}
                className={`flex-1 px-3 py-2 rounded-lg text-sm border transition-colors ${
                  source === 'user' ? 'border-primary bg-primary/10' : 'border-border hover:bg-secondary'
                }`}
              >
                {t('User Skills')}
              </button>
              <button
                onClick={() => setSource('project')}
                disabled={!spaceId}
                className={`flex-1 px-3 py-2 rounded-lg text-sm border transition-colors ${
                  source === 'project' ? 'border-primary bg-primary/10' : 'border-border hover:bg-secondary'
                } ${!spaceId ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                {t('Project Skills')}
              </button>
            </div>
          </div>

          {/* Content (SKILL.md body) */}
          <div>
            <label className="text-sm text-muted-foreground mb-1.5 block">
              Skill Instructions (Markdown) *
            </label>
            <textarea
              value={content}
              onChange={e => setContent(e.target.value)}
              placeholder={`You are a helpful assistant that...\n\n## Context\n!\\`git status\\`\n\n## Arguments\nUser input: $ARGUMENTS`}
              rows={10}
              className="w-full px-3 py-2 bg-secondary/50 border border-border rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/50 resize-y"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Supports Markdown, !`command` dynamic context, and $ARGUMENTS variable substitution
            </p>
          </div>

          {/* Advanced Options */}
          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="text-xs text-primary hover:underline"
          >
            {showAdvanced ? 'Hide' : 'Show'} advanced options
          </button>

          {showAdvanced && (
            <div className="space-y-3 pl-2 border-l-2 border-primary/20">
              {/* User Invocable */}
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={userInvocable}
                  onChange={e => setUserInvocable(e.target.checked)}
                />
                User-invocable (can be called with /{name || 'skill-name'})
              </label>

              {/* Always Apply */}
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={alwaysApply}
                  onChange={e => setAlwaysApply(e.target.checked)}
                />
                Always apply (inject into every conversation)
              </label>

              {/* Argument Hint */}
              {userInvocable && (
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Argument hint</label>
                  <input
                    type="text"
                    value={argumentHint}
                    onChange={e => setArgumentHint(e.target.value)}
                    placeholder='<commit message>'
                    className="w-full px-3 py-1.5 bg-secondary/50 border border-border rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                </div>
              )}

              {/* Globs */}
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">
                  Condition globs (comma-separated)
                </label>
                <input
                  type="text"
                  value={globs}
                  onChange={e => setGlobs(e.target.value)}
                  placeholder="**/*.ts, **/*.tsx"
                  className="w-full px-3 py-1.5 bg-secondary/50 border border-border rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  Skill activates when files matching these patterns are in context
                </p>
              </div>

              {/* Allowed Tools */}
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Allowed tools</label>
                <div className="flex gap-1 flex-wrap mb-1">
                  {allowedTools.map(tool => (
                    <span key={tool} className="text-[10px] bg-secondary px-1.5 py-0.5 rounded flex items-center gap-1">
                      {tool}
                      <button onClick={() => removeTool(tool)}>
                        <Minus className="w-2.5 h-2.5" />
                      </button>
                    </span>
                  ))}
                </div>
                <div className="flex gap-1">
                  <input
                    type="text"
                    value={newTool}
                    onChange={e => setNewTool(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && addTool()}
                    placeholder="Edit, Read, Bash, Edit(*.md)"
                    className="flex-1 px-2 py-1 bg-secondary/50 border border-border rounded text-xs focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                  <button onClick={addTool} className="px-2 py-1 bg-secondary rounded text-xs">
                    <Plus className="w-3 h-3" />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="p-3 bg-destructive/10 border border-destructive/30 rounded-lg text-sm text-destructive">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 p-4 border-t border-border">
          <button onClick={onClose} className="px-4 py-2 text-sm hover:bg-secondary rounded-lg transition-colors">
            {t('Cancel')}
          </button>
          <button
            onClick={handleCreate}
            disabled={!isValid || isLoading}
            className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
            {t('Create skill')}
          </button>
        </div>
      </div>
    </div>
  )
}
```

### 15.2 SkillEditorDialog

文件位置: `src/renderer/components/skills/SkillEditorDialog.tsx`

```tsx
import { useState } from 'react'
import { api } from '../../api'
import { X, Loader2, Save } from 'lucide-react'
import { useTranslation } from '../../i18n'
import type { Skill, UpdateSkillRequest } from '../../../../shared/types/skill'

interface SkillEditorDialogProps {
  skill: Skill
  onClose: () => void
  onSuccess: () => void
}

export function SkillEditorDialog({ skill, onClose, onSuccess }: SkillEditorDialogProps) {
  const { t } = useTranslation()

  const [name, setName] = useState(skill.name)
  const [description, setDescription] = useState(skill.description)
  const [content, setContent] = useState(skill.content)
  const [userInvocable, setUserInvocable] = useState(skill.userInvocable)
  const [argumentHint, setArgumentHint] = useState(skill.argumentHint || '')
  const [globs, setGlobs] = useState((skill.globs || []).join(', '))
  const [alwaysApply, setAlwaysApply] = useState(skill.alwaysApply || false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isReadOnly = !!skill.compatSource

  const handleSave = async () => {
    if (isReadOnly) return

    setIsLoading(true)
    setError(null)

    try {
      const request: UpdateSkillRequest = {
        name,
        description,
        content,
        source: skill.source,
        userInvocable,
        argumentHint: argumentHint || undefined,
        globs: globs ? globs.split(',').map(g => g.trim()) : undefined,
        alwaysApply,
      }

      await api.invoke('skills:update', skill.id, request)
      onSuccess()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
      <div className="w-[700px] max-h-[85vh] bg-card border border-border rounded-xl shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold">{t('Edit Skill')}</h2>
            {isReadOnly && (
              <span className="text-xs bg-yellow-500/20 text-yellow-600 px-2 py-0.5 rounded">
                {t('Read-only (auto-detected)')}
              </span>
            )}
          </div>
          <button onClick={onClose} className="p-1 hover:bg-secondary rounded">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-4 space-y-4">
          {/* Metadata row */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Name</label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                disabled={isReadOnly}
                className="w-full px-3 py-1.5 bg-secondary/50 border border-border rounded-lg text-sm disabled:opacity-60"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Description</label>
              <input
                type="text"
                value={description}
                onChange={e => setDescription(e.target.value)}
                disabled={isReadOnly}
                className="w-full px-3 py-1.5 bg-secondary/50 border border-border rounded-lg text-sm disabled:opacity-60"
              />
            </div>
          </div>

          {/* Options row */}
          <div className="flex gap-4 items-center text-sm">
            <label className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={userInvocable}
                onChange={e => setUserInvocable(e.target.checked)}
                disabled={isReadOnly}
              />
              User-invocable
            </label>
            <label className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={alwaysApply}
                onChange={e => setAlwaysApply(e.target.checked)}
                disabled={isReadOnly}
              />
              Always apply
            </label>
            {userInvocable && (
              <input
                type="text"
                value={argumentHint}
                onChange={e => setArgumentHint(e.target.value)}
                placeholder="Argument hint"
                disabled={isReadOnly}
                className="px-2 py-1 bg-secondary/50 border border-border rounded text-xs disabled:opacity-60"
              />
            )}
          </div>

          {/* Globs */}
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">
              Condition globs (comma-separated)
            </label>
            <input
              type="text"
              value={globs}
              onChange={e => setGlobs(e.target.value)}
              disabled={isReadOnly}
              placeholder="**/*.ts, **/*.tsx"
              className="w-full px-3 py-1.5 bg-secondary/50 border border-border rounded-lg text-xs disabled:opacity-60"
            />
          </div>

          {/* Content Editor */}
          <div className="flex-1">
            <label className="text-xs text-muted-foreground mb-1 block">
              Skill Content (SKILL.md body)
            </label>
            <textarea
              value={content}
              onChange={e => setContent(e.target.value)}
              disabled={isReadOnly}
              rows={16}
              className="w-full px-3 py-2 bg-secondary/50 border border-border rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/50 resize-y disabled:opacity-60"
            />
          </div>

          {/* Info */}
          <div className="text-[10px] text-muted-foreground space-y-0.5">
            <p>Source: {skill.source} | Path: {skill.path}</p>
            <p>Created: {new Date(skill.createdAt).toLocaleString()} | Updated: {new Date(skill.updatedAt).toLocaleString()}</p>
            {skill.compatSource && <p>Auto-detected from: {skill.compatSource}</p>}
          </div>

          {/* Error */}
          {error && (
            <div className="p-3 bg-destructive/10 border border-destructive/30 rounded-lg text-sm text-destructive">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 p-4 border-t border-border">
          <button onClick={onClose} className="px-4 py-2 text-sm hover:bg-secondary rounded-lg transition-colors">
            {isReadOnly ? 'Close' : t('Cancel')}
          </button>
          {!isReadOnly && (
            <button
              onClick={handleSave}
              disabled={isLoading}
              className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Save
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
```

---

## 十六、更新后的实现计划

| 阶段 | 内容 | 预估工作量 |
|------|------|-----------|
| **Phase 1** | 基础框架 | |
| - | 创建 `src/shared/types/skill.ts` 类型定义（含新增类型） | 1h |
| - | 创建 `src/main/services/skills.service.ts` 核心服务 | 3h |
| - | 实现动态上下文注入 + 参数变量替换 | 1.5h |
| - | 实现条件规则/Glob 匹配引擎 | 1h |
| - | 实现 Monorepo 自动发现 + 兼容格式识别 | 1.5h |
| - | 创建 `src/main/ipc/skills.ipc.ts` IPC 注册 | 1h |
| - | 在 main 入口注册 IPC | 0.5h |
| **Phase 2** | UI 组件 | |
| - | 创建 `SkillsList.tsx` 列表组件（含启用/禁用开关） | 2h |
| - | 创建 `SkillCard.tsx` 卡片组件（含状态标识） | 1h |
| - | 创建 `ImportSkillDialog.tsx` 导入对话框 | 2h |
| - | 创建 `CreateSkillDialog.tsx` 创建对话框 | 2h |
| - | 创建 `SkillEditorDialog.tsx` 编辑对话框 | 2h |
| **Phase 3** | 集成 | |
| - | 修改 `ArtifactRail.tsx` 添加 Tab 切换 | 1h |
| - | 修改 `ChatInput.tsx` 添加技能自动补全 + 参数提示 | 1.5h |
| - | 添加 API 层 `renderer/api/skills.ts` | 0.5h |
| **Phase 4** | Message 展示 | |
| - | 修改 `thought-utils.ts` 添加 Skill 格式化 | 0.5h |
| - | 修改 `ToolIcons.tsx` 添加 Skill 图标 | 0.5h |
| - | 创建 `SkillCallDetail.tsx` 展开详情组件 | 1h |
| - | 修改 `ThoughtProcess.tsx` 集成 Skill 展示 | 1h |
| **Phase 5** | 权限管理 | |
| - | 实现权限配置持久化 | 1h |
| - | 创建权限管理面板 UI | 1.5h |
| **Phase 6** | 测试与优化 | |
| - | 单元测试 | 2h |
| - | 集成测试 | 1h |
| - | UI/UX 优化 | 1h |

**总计: ~31h**

---

## 十七、TODO 优先级表

| 优先级 | TODO | 说明 | 阻塞关系 |
|--------|------|------|---------|
| **P0-阻塞** | `getSpacePath(spaceId)` | 对接 SpaceStore 获取 Space 路径 | 所有 project 级别操作依赖此 |
| **P1-非阻塞** | `saveRemoteMetadata` / `getRemoteMetadata` | 对接配置系统持久化远程同步元数据 | 仅影响 sync 功能 |
| **P1-非阻塞** | `getEnabledConfig` / `saveEnabledConfig` | 持久化启用/禁用状态 | 仅影响开关功能，默认全部启用 |
| **P1-非阻塞** | 权限管理持久化 | 持久化 allow/deny 配置 | 仅影响权限管理，默认全部允许 |
| **P2-后续** | 企业级 Skills 管理后台 | 管理员配置和分发企业级 Skills | 独立模块，不影响核心功能 |
| **P2-后续** | Extension Skills 注入接口 | 对接 MCP 等插件系统 | 插件系统完善后再接入 |
| **P2-后续** | 字符预算动态计算 | 根据实际上下文窗口大小动态计算 2% | 当前使用固定最低值 16000 |

---

## 十八、关键决策更新

| 决策项 | 选择 | 原因 |
|--------|------|------|
| **远程同步策略** | git clone + 本地存储 | 参考 Cursor，避免实时网络请求 |
| **SKILL.md 格式** | 完全兼容 Claude Code 标准 | 保持生态兼容性 |
| **扩展字段** | `when-to-use`, `globs`, `always-apply` | 借鉴 Roo Code + Cursor，增强条件触发能力 |
| **存储层级** | 4 层（enterprise > user > project > extension） | 对齐 Claude Code 官方架构 |
| **兼容格式** | 自动识别 .cursorrules, .windsurfrules, AGENTS.md | 借鉴 Cline，降低迁移成本 |
| **参数变量** | 支持 $ARGUMENTS, $0-$99 | 对齐 Claude Code 官方标准 |
| **动态上下文** | !`command` 语法，10s 超时 | 对齐 Claude Code 官方标准 |
| **字符预算** | 上下文 2%，最低 16000 | 对齐 Claude Code 官方标准 |
| **启用/禁用** | 每个 Skill 独立开关 | 借鉴 Cline，无需删除文件 |
| **UI 位置** | ArtifactRail Tab 形式 | 不增加额外空间，逻辑相近 |
| **Session 刷新** | 提示下次对话生效 | Skills 在 Session 创建时加载 |
| **权限控制** | Skill(name) / Skill(name *) | 对齐 Claude Code /permissions |

---

## 附录 A：主流客户端 Skills/Rules 对比

| 特性 | Claude Code | Cursor | Roo Code | Windsurf | Cline | **Halo（本方案）** |
|------|------------|--------|----------|----------|-------|-----------------|
| **文件格式** | SKILL.md (YAML+MD) | .mdc (YAML+MD) | .roomodes (YAML/JSON) | 纯文本/MD | MD (YAML frontmatter) | SKILL.md (YAML+MD) |
| **存储层级** | 4 层 | 3 层 | 2 层 | 2 层 | 2 层 | **4 层** |
| **手动调用** | /skill-name | 不支持 | 模式切换 | 不支持 | /newrule | **/skill-name** |
| **自动匹配** | description | alwaysApply/globs | whenToUse | 自动 | paths glob | **description + globs** |
| **参数传递** | $ARGUMENTS, $0-$N | 不支持 | 不支持 | 不支持 | 不支持 | **$ARGUMENTS, $0-$N** |
| **动态上下文** | !`command` | 不支持 | 不支持 | 不支持 | 不支持 | **!`command`** |
| **条件触发** | 不支持 | globs 匹配 | whenToUse | 不支持 | paths glob | **globs 匹配** |
| **Hooks** | 支持 | 不支持 | 不支持 | 不支持 | 不支持 | **支持** |
| **工具限制** | allowed-tools | 不支持 | groups+正则 | 不支持 | 不支持 | **allowed-tools + 文件范围** |
| **启用/禁用** | 不支持 | 不支持 | 不支持 | 不支持 | 独立开关 | **独立开关** |
| **兼容格式** | 不支持 | AGENTS.md | 不支持 | 不支持 | 全部兼容 | **全部兼容** |
| **字符预算** | 2% 上下文 | 6000 字符 | 无限制 | 6000/12000 | 无限制 | **2% 上下文** |
| **权限管理** | /permissions | 不支持 | 不支持 | 不支持 | 不支持 | **允许/拒绝** |
| **导入方式** | GitHub/本地 | 不支持 | 导入/导出 | 不支持 | /newrule | **GitHub/URL/本地** |

**Halo 的差异化优势**：
1. 融合了 Claude Code 的完整 Skills 能力（参数变量、动态上下文、Hooks）
2. 吸收了 Cursor 的条件触发 globs 匹配
3. 借鉴了 Cline 的启用/禁用开关和全格式兼容
4. 保持了 4 层存储优先级架构
5. 提供了最丰富的导入渠道（GitHub / URL / 本地 / 兼容格式自动发现）
