/**
 * Diagnostics Collector - Gather system information for debugging
 *
 * Collects data from various sources for diagnostic reports.
 * All sensitive data is sanitized before inclusion.
 */

import { app } from 'electron'
import { freemem, totalmem } from 'os'
import type { DiagnosticReport } from '../types'
import { getConfig, getHaloDir } from '../../config.service'
import { getHealthState } from '../orchestrator'
import { getRegistryStats } from '../process-guardian'
import { getRecentEvents } from '../health-checker'
import { sanitizeReport } from './sanitizer'

/**
 * Collect full diagnostic report
 */
export async function collectDiagnosticReport(): Promise<DiagnosticReport> {
  const config = getConfig()
  const healthState = getHealthState()
  const registryStats = getRegistryStats()
  const recentEvents = getRecentEvents()

  // Get AI source info (sanitized)
  const aiSources = config.aiSources
  const currentSource = aiSources?.current || 'custom'
  let provider = 'unknown'
  let hasApiKey = false
  let apiUrlHost = ''

  if (currentSource === 'custom') {
    const custom = aiSources?.custom
    provider = custom?.provider || 'anthropic'
    hasApiKey = !!(custom?.apiKey && custom.apiKey.length > 0)
    apiUrlHost = custom?.apiUrl ? new URL(custom.apiUrl).hostname : 'api.anthropic.com'
  } else if (aiSources?.[currentSource]) {
    provider = 'oauth'
    const oauthConfig = aiSources[currentSource] as unknown as Record<string, unknown>
    hasApiKey = !!(oauthConfig?.accessToken)
  }

  // Build raw report
  const rawReport: DiagnosticReport = {
    timestamp: new Date().toISOString(),
    version: app.getVersion(),
    platform: process.platform,
    arch: process.arch,

    config: {
      currentSource,
      provider,
      hasApiKey,
      apiUrlHost,
      mcpServerCount: Object.keys(config.mcpServers || {}).length
    },

    processes: {
      registered: registryStats.totalProcesses,
      orphansFound: registryStats.orphanProcesses,
      orphansCleaned: healthState.lastStartupCheck?.probes
        .find(p => p.name === 'process')?.data?.zombiesKilled as number || 0
    },

    health: {
      lastCheckTime: healthState.lastStartupCheck
        ? new Date(healthState.lastStartupCheck.timestamp).toISOString()
        : 'never',
      consecutiveFailures: healthState.consecutiveFailures,
      recoveryAttempts: healthState.recoveryAttempts
    },

    recentErrors: recentEvents
      .filter(e => e.category === 'critical' || e.category === 'warning')
      .slice(0, 10)
      .map(e => ({
        time: new Date(e.timestamp).toISOString(),
        source: e.source,
        message: e.message
      })),

    system: {
      memory: {
        total: formatBytes(totalmem()),
        free: formatBytes(freemem())
      },
      uptime: Math.floor(process.uptime())
    }
  }

  // Sanitize sensitive data
  return sanitizeReport(rawReport)
}

/**
 * Format bytes to human-readable string
 */
function formatBytes(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let unitIndex = 0
  let value = bytes

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex++
  }

  return `${value.toFixed(1)} ${units[unitIndex]}`
}
