/**
 * Skills IPC Handlers - Handle skill-related requests from renderer
 */

import { ipcMain } from 'electron'
import {
  listAllSkills,
  getSkill,
  skillExists,
  createSkill,
  updateSkill,
  deleteSkill,
  renameSkill,
  toggleSkill,
  importFromUrl,
  importFromLocal,
  discoverGithubSkills,
  importFromGithub,
  exportSkill,
  validateSkill,
  getSkillPermissions,
  setSkillPermission,
  removeSkillPermission
} from '../services/skills.service'
import type {
  SkillSource,
  CreateSkillRequest,
  UpdateSkillRequest,
  ImportUrlRequest,
  ImportFileRequest,
  ImportGithubRequest,
  SkillPermission
} from '../../shared/types/skill'

export function registerSkillsHandlers(): void {
  // List all skills
  ipcMain.handle('skills:list', async (_event, spaceId?: string) => {
    try {
      const data = listAllSkills(spaceId)
      return { success: true, data }
    } catch (error) {
      console.error('[IPC] skills:list error:', error)
      return { success: false, error: (error as Error).message }
    }
  })

  // Get single skill
  ipcMain.handle('skills:get', async (_event, skillId: string, source: SkillSource, spaceId?: string) => {
    try {
      const data = getSkill(skillId, source, spaceId)
      return { success: true, data }
    } catch (error) {
      console.error('[IPC] skills:get error:', error)
      return { success: false, error: (error as Error).message }
    }
  })

  // Check if skill exists
  ipcMain.handle('skills:exists', async (_event, name: string, source: SkillSource, spaceId?: string) => {
    try {
      const data = skillExists(name, source, spaceId)
      return { success: true, data }
    } catch (error) {
      console.error('[IPC] skills:exists error:', error)
      return { success: false, error: (error as Error).message }
    }
  })

  // Create skill
  ipcMain.handle('skills:create', async (_event, request: CreateSkillRequest) => {
    try {
      const data = createSkill(request)
      return { success: true, data }
    } catch (error) {
      console.error('[IPC] skills:create error:', error)
      return { success: false, error: (error as Error).message }
    }
  })

  // Update skill
  ipcMain.handle('skills:update', async (_event, skillId: string, request: UpdateSkillRequest) => {
    try {
      const data = updateSkill(skillId, request)
      return { success: true, data }
    } catch (error) {
      console.error('[IPC] skills:update error:', error)
      return { success: false, error: (error as Error).message }
    }
  })

  // Delete skill
  ipcMain.handle('skills:delete', async (_event, skillId: string, source: SkillSource, spaceId?: string) => {
    try {
      deleteSkill(skillId, source, spaceId)
      return { success: true }
    } catch (error) {
      console.error('[IPC] skills:delete error:', error)
      return { success: false, error: (error as Error).message }
    }
  })

  // Rename skill
  ipcMain.handle('skills:rename', async (_event, oldId: string, newId: string, source: SkillSource, spaceId?: string) => {
    try {
      const data = renameSkill(oldId, newId, source, spaceId)
      return { success: true, data }
    } catch (error) {
      console.error('[IPC] skills:rename error:', error)
      return { success: false, error: (error as Error).message }
    }
  })

  // Toggle skill enabled/disabled
  ipcMain.handle('skills:toggle', async (_event, skillId: string, enabled: boolean) => {
    try {
      toggleSkill(skillId, enabled)
      return { success: true }
    } catch (error) {
      console.error('[IPC] skills:toggle error:', error)
      return { success: false, error: (error as Error).message }
    }
  })

  // Import from URL
  ipcMain.handle('skills:import:url', async (_event, request: ImportUrlRequest) => {
    try {
      const data = await importFromUrl(request)
      return { success: data.success, data: data.skill, error: data.error }
    } catch (error) {
      console.error('[IPC] skills:import:url error:', error)
      return { success: false, error: (error as Error).message }
    }
  })

  // Import from local folder
  ipcMain.handle('skills:import:file', async (_event, request: ImportFileRequest) => {
    try {
      const data = importFromLocal(request)
      return { success: data.success, data: data.skill, error: data.error }
    } catch (error) {
      console.error('[IPC] skills:import:file error:', error)
      return { success: false, error: (error as Error).message }
    }
  })

  // Discover skills from GitHub repository
  ipcMain.handle('skills:github:discover', async (_event, url: string) => {
    try {
      const data = await discoverGithubSkills(url)
      return { success: data.success, data, error: data.error }
    } catch (error) {
      console.error('[IPC] skills:github:discover error:', error)
      return { success: false, error: (error as Error).message }
    }
  })

  // Import skills from GitHub repository
  ipcMain.handle('skills:github:import', async (_event, request: ImportGithubRequest) => {
    try {
      const data = await importFromGithub(request)
      return { success: data.success, data, error: data.failed.length > 0 ? data.failed.map(f => `${f.name}: ${f.error}`).join('; ') : undefined }
    } catch (error) {
      console.error('[IPC] skills:github:import error:', error)
      return { success: false, error: (error as Error).message }
    }
  })

  // Export skill
  ipcMain.handle('skills:export', async (_event, skillId: string, source: SkillSource, spaceId?: string) => {
    try {
      const data = exportSkill(skillId, source, spaceId)
      return { success: true, data }
    } catch (error) {
      console.error('[IPC] skills:export error:', error)
      return { success: false, error: (error as Error).message }
    }
  })

  // Validate skill content
  ipcMain.handle('skills:validate', async (_event, content: string) => {
    try {
      const data = validateSkill(content)
      return { success: true, data }
    } catch (error) {
      console.error('[IPC] skills:validate error:', error)
      return { success: false, error: (error as Error).message }
    }
  })

  // Get skill permissions
  ipcMain.handle('skills:permissions:list', async () => {
    try {
      const data = getSkillPermissions()
      return { success: true, data }
    } catch (error) {
      console.error('[IPC] skills:permissions:list error:', error)
      return { success: false, error: (error as Error).message }
    }
  })

  // Set skill permission
  ipcMain.handle('skills:permissions:set', async (_event, permission: SkillPermission) => {
    try {
      setSkillPermission(permission)
      return { success: true }
    } catch (error) {
      console.error('[IPC] skills:permissions:set error:', error)
      return { success: false, error: (error as Error).message }
    }
  })

  // Remove skill permission
  ipcMain.handle('skills:permissions:remove', async (_event, skillId: string, scope?: 'all' | 'invocation-only') => {
    try {
      removeSkillPermission(skillId, scope)
      return { success: true }
    } catch (error) {
      console.error('[IPC] skills:permissions:remove error:', error)
      return { success: false, error: (error as Error).message }
    }
  })
}
