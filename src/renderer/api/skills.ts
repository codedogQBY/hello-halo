/**
 * Skills API - Clean namespace for skills-related API calls
 * Wraps the main api object's skill methods for convenient access
 */

import { api } from './index'
import type {
  Skill,
  CreateSkillRequest,
  UpdateSkillRequest,
  ImportUrlRequest,
  ImportFileRequest,
  ImportGithubRequest,
  SkillsListResponse,
  SkillValidationResult,
  SkillSource,
  SkillPermission
} from '../../shared/types/skill'

export const skillsApi = {
  // Query
  list: (spaceId?: string) => api.listSkills(spaceId),
  get: (skillId: string, source: SkillSource, spaceId?: string) => api.getSkill(skillId, source, spaceId),

  // CRUD
  create: (request: CreateSkillRequest) => api.createSkill(request),
  update: (skillId: string, request: UpdateSkillRequest) => api.updateSkill(skillId, request),
  delete: (skillId: string, source: SkillSource, spaceId?: string) => api.deleteSkill(skillId, source, spaceId),
  toggle: (skillId: string, enabled: boolean) => api.toggleSkill(skillId, enabled),

  // Import
  importFromUrl: (request: ImportUrlRequest) => api.importSkillFromUrl(request),
  importFromLocal: (request: ImportFileRequest) => api.importSkillFromLocal(request),
  discoverGithub: (url: string) => api.discoverGithubSkills(url),
  importFromGithub: (request: ImportGithubRequest) => api.importFromGithub(request),

  // Validate
  validate: (content: string) => api.validateSkill(content),

  // Permissions
  getPermissions: () => api.getSkillPermissions(),
  setPermission: (permission: SkillPermission) => api.setSkillPermission(permission),
  removePermission: (skillId: string, scope?: 'all' | 'invocation-only') => api.removeSkillPermission(skillId, scope),
}
