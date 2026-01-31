/**
 * Config Probe - Configuration file health check
 *
 * Checks:
 * - Config file exists
 * - JSON is valid
 * - Critical fields are present
 * - API key is configured
 */

import { existsSync, readFileSync } from 'fs'
import type { ConfigProbeResult } from '../../types'
import { getConfigPath } from '../../../config.service'

/**
 * Check configuration file health
 */
export async function runConfigProbe(): Promise<ConfigProbeResult> {
  const configPath = getConfigPath()
  const errors: string[] = []

  let fileExists = false
  let jsonValid = false
  let criticalFieldsPresent = false
  let apiKeyConfigured = false

  try {
    // Check file exists
    fileExists = existsSync(configPath)

    if (!fileExists) {
      return {
        name: 'config',
        healthy: false,
        severity: 'info',  // Missing config is OK on first launch
        message: 'Config file not found, will be created on first launch',
        timestamp: Date.now(),
        data: {
          fileExists,
          jsonValid,
          criticalFieldsPresent,
          apiKeyConfigured,
          errors: ['Config file does not exist']
        }
      }
    }

    // Try to parse JSON
    let config: Record<string, unknown>
    try {
      const content = readFileSync(configPath, 'utf-8')
      config = JSON.parse(content)
      jsonValid = true
    } catch (parseError) {
      errors.push(`JSON parse error: ${(parseError as Error).message}`)
      return {
        name: 'config',
        healthy: false,
        severity: 'critical',
        message: 'Config file is corrupted (invalid JSON)',
        timestamp: Date.now(),
        data: {
          fileExists,
          jsonValid,
          criticalFieldsPresent,
          apiKeyConfigured,
          errors
        }
      }
    }

    // Check critical fields
    const aiSources = config.aiSources as Record<string, unknown> | undefined
    const hasAiSourcesCurrent = aiSources && typeof aiSources.current === 'string'
    const hasPermissions = config.permissions && typeof config.permissions === 'object'

    criticalFieldsPresent = !!(hasAiSourcesCurrent && hasPermissions)

    if (!hasAiSourcesCurrent) {
      errors.push('Missing aiSources.current field')
    }
    if (!hasPermissions) {
      errors.push('Missing permissions field')
    }

    // Check API key configuration
    const currentSource = aiSources?.current as string | undefined
    if (currentSource === 'custom') {
      const custom = aiSources?.custom as Record<string, unknown> | undefined
      apiKeyConfigured = !!(custom?.apiKey && typeof custom.apiKey === 'string' && custom.apiKey.length > 0)
    } else if (currentSource && currentSource !== 'custom') {
      // OAuth provider - check for access token
      const provider = aiSources?.[currentSource] as Record<string, unknown> | undefined
      apiKeyConfigured = !!(provider?.accessToken && typeof provider.accessToken === 'string')
    }

    // Determine overall health
    const healthy = jsonValid && criticalFieldsPresent
    const severity = !healthy ? 'critical' : !apiKeyConfigured ? 'warning' : 'info'

    let message = 'Config file is healthy'
    if (!criticalFieldsPresent) {
      message = 'Config file missing critical fields'
    } else if (!apiKeyConfigured) {
      message = 'No API key configured'
    }

    return {
      name: 'config',
      healthy,
      severity,
      message,
      timestamp: Date.now(),
      data: {
        fileExists,
        jsonValid,
        criticalFieldsPresent,
        apiKeyConfigured,
        errors
      }
    }
  } catch (error) {
    errors.push(`Unexpected error: ${(error as Error).message}`)
    return {
      name: 'config',
      healthy: false,
      severity: 'critical',
      message: `Config check failed: ${(error as Error).message}`,
      timestamp: Date.now(),
      data: {
        fileExists,
        jsonValid,
        criticalFieldsPresent,
        apiKeyConfigured,
        errors
      }
    }
  }
}
