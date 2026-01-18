/**
 * Custom AI Source Provider
 *
 * Handles custom API configuration (Anthropic Claude or OpenAI compatible).
 * This is the simplest provider - no OAuth, just API key configuration.
 *
 * Design Notes:
 * - Stateless: all state comes from config
 * - No authentication flow needed
 * - Supports both Anthropic and OpenAI compatible endpoints
 */

import type {
  AISourceProvider,
  ProviderResult
} from '../../../../shared/interfaces'
import type {
  AISourceType,
  AISourcesConfig,
  BackendRequestConfig,
  CustomSourceConfig
} from '../../../../shared/types'
import { AVAILABLE_MODELS } from '../../../../shared/types'

/**
 * Anthropic API base URL
 */
const ANTHROPIC_API_URL = 'https://api.anthropic.com'

/**
 * Custom AI Source Provider Implementation
 */
export class CustomAISourceProvider implements AISourceProvider {
  readonly type: AISourceType = 'custom'
  readonly displayName = 'Custom API'

  /**
   * Check if custom API is configured
   */
  isConfigured(config: AISourcesConfig): boolean {
    return !!(config.custom?.apiKey)
  }

  /**
   * Get backend request configuration
   */
  getBackendConfig(config: AISourcesConfig): BackendRequestConfig | null {
    const customConfig = config.custom
    if (!customConfig?.apiKey) {
      return null
    }

    const isAnthropic = customConfig.provider === 'anthropic'
    const baseUrl = customConfig.apiUrl || ANTHROPIC_API_URL

    // Remove trailing slash from base URL if present
    const cleanBaseUrl = baseUrl.replace(/\/$/, '')

    // Return URL as-is - user provides the complete endpoint URL
    // For Anthropic: base URL only (SDK will add /v1/messages)
    // For OpenAI compatible: user should provide full endpoint like https://api.example.com/v1/chat/completions
    return {
      url: cleanBaseUrl,
      key: customConfig.apiKey,
      model: customConfig.model,
      // For OpenAI compatible, infer API type from URL
      apiType: isAnthropic ? undefined : this.inferApiTypeFromUrl(cleanBaseUrl)
    }
  }

  /**
   * Infer API type from URL
   */
  private inferApiTypeFromUrl(url: string): 'chat_completions' | 'responses' {
    if (url.includes('/responses')) return 'responses'
    // Default to chat_completions (most common for third-party providers)
    return 'chat_completions'
  }

  /**
   * Get current model ID
   */
  getCurrentModel(config: AISourcesConfig): string | null {
    return config.custom?.model || null
  }

  /**
   * Get available models - returns static list for custom API
   */
  async getAvailableModels(config: AISourcesConfig): Promise<string[]> {
    const customConfig = config.custom
    if (!customConfig) {
      return []
    }

    // For Anthropic provider, return known Claude models
    if (customConfig.provider === 'anthropic') {
      return AVAILABLE_MODELS.map(m => m.id)
    }

    // For OpenAI compatible, we don't know the models
    // User needs to specify manually
    return []
  }

  /**
   * No refresh needed for custom API
   */
  async refreshConfig(_config: AISourcesConfig): Promise<ProviderResult<Partial<AISourcesConfig>>> {
    // Custom API doesn't need refresh - configuration is static
    return { success: true, data: {} }
  }
}

/**
 * Singleton instance
 */
let instance: CustomAISourceProvider | null = null

/**
 * Get the CustomAISourceProvider instance
 */
export function getCustomProvider(): CustomAISourceProvider {
  if (!instance) {
    instance = new CustomAISourceProvider()
  }
  return instance
}
