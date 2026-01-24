/**
 * ModelSelector - Dropdown for selecting AI model in header
 * - Desktop: Dropdown menu from button
 * - Mobile: Bottom sheet for better touch interaction
 *
 * Design: Dynamic rendering based on config - no hardcoded provider names
 * OAuth providers are loaded from product.json configuration
 */

import { useState, useRef, useEffect } from 'react'
import { ChevronDown, Plus, Sparkles, X } from 'lucide-react'
import { useAppStore } from '../../stores/app.store'
import { api } from '../../api'
import {
  AVAILABLE_MODELS,
  getCurrentModelName,
  type HaloConfig,
  type AISourceType,
  type OAuthSourceConfig
} from '../../types'
import { useTranslation, getCurrentLanguage } from '../../i18n'
import { useIsMobile } from '../../hooks/useIsMobile'

/**
 * Localized text - either a simple string or object with language codes
 */
type LocalizedText = string | Record<string, string>

// Provider config from authGetProviders
interface AuthProviderConfig {
  type: string
  displayName: LocalizedText
  enabled: boolean
}

/**
 * Get localized text based on current language
 */
function getLocalizedText(value: LocalizedText): string {
  if (typeof value === 'string') {
    return value
  }
  const lang = getCurrentLanguage()
  return value[lang] || value['en'] || Object.values(value)[0] || ''
}

export function ModelSelector() {
  const { t } = useTranslation()
  const isMobile = useIsMobile()
  const { config, setConfig, setView } = useAppStore()
  const [isOpen, setIsOpen] = useState(false)
  const [isAnimatingOut, setIsAnimatingOut] = useState(false)
  const [authProviders, setAuthProviders] = useState<AuthProviderConfig[]>([])
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Load auth providers from config
  useEffect(() => {
    api.authGetProviders().then((result) => {
      if (result.success && result.data) {
        setAuthProviders(result.data as AuthProviderConfig[])
      }
    })
  }, [])

  // Close dropdown when clicking outside (desktop only)
  useEffect(() => {
    if (!isOpen || isMobile) return

    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    // Use setTimeout to avoid the click event that opened the dropdown
    const timeoutId = setTimeout(() => {
      document.addEventListener('click', handleClickOutside)
    }, 0)

    return () => {
      clearTimeout(timeoutId)
      document.removeEventListener('click', handleClickOutside)
    }
  }, [isOpen, isMobile])

  // Handle escape key
  useEffect(() => {
    if (!isOpen) return

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        handleClose()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen])

  const handleClose = () => {
    if (isMobile) {
      setIsAnimatingOut(true)
      setTimeout(() => {
        setIsOpen(false)
        setIsAnimatingOut(false)
      }, 200)
    } else {
      setIsOpen(false)
    }
  }

  if (!config) return null

  const aiSources = config.aiSources || { current: 'custom' as AISourceType }
  const currentSource = aiSources.current
  const hasCustom = !!(aiSources.custom?.apiKey)
  const isCustomAnthropic = aiSources.custom?.provider === 'anthropic'

  // Get logged-in OAuth providers dynamically
  const loggedInOAuthProviders = authProviders
    .filter(p => p.type !== 'custom' && p.enabled)
    .map(p => {
      const providerConfig = aiSources[p.type] as OAuthSourceConfig | undefined
      return {
        type: p.type,
        displayName: getLocalizedText(p.displayName),
        config: providerConfig,
        isLoggedIn: providerConfig?.loggedIn === true
      }
    })
    .filter(p => p.isLoggedIn)

  // Get current model display name
  const currentModelName = getCurrentModelName(config)

  // Handle model selection for any provider
  const handleSelectModel = async (source: AISourceType, modelId: string) => {
    const newAiSources = {
      ...aiSources,
      current: source
    }

    // Get current provider config
    const providerConfig = aiSources[source] as OAuthSourceConfig | undefined

    if (source === 'custom' && aiSources.custom) {
      newAiSources.custom = {
        ...aiSources.custom,
        model: modelId
      }
      // Also update legacy api field
      ;(config as any).api = {
        ...config.api,
        model: modelId
      }
    } else if (providerConfig) {
      // OAuth provider - update dynamically
      newAiSources[source] = {
        ...providerConfig,
        model: modelId
      }
    }

    const newConfig = {
      ...config,
      aiSources: newAiSources
    }

    await api.setConfig(newConfig)
    setConfig(newConfig as HaloConfig)
    handleClose()
  }

  // Handle add source
  const handleAddSource = () => {
    handleClose()
    setView('settings')
  }

  // Shared model list content
  const renderModelList = () => (
    <>
      {/* Custom API Section */}
      {hasCustom && aiSources.custom && (
        <>
          <div className="px-3 py-2 text-xs font-medium text-muted-foreground flex items-center justify-between">
            <span>{t('Custom API')}</span>
            <button
              onClick={handleAddSource}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              &gt;
            </button>
          </div>
          {isCustomAnthropic ? (
            // Anthropic provider: show Claude model list
            AVAILABLE_MODELS.map((model) => (
              <button
                key={model.id}
                onClick={() => handleSelectModel('custom', model.id)}
                className={`w-full px-3 py-3 text-left text-sm hover:bg-secondary/80 transition-colors flex items-center gap-2 ${
                  currentSource === 'custom' && aiSources.custom?.model === model.id
                    ? 'text-primary'
                    : 'text-foreground'
                }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${
                  currentSource === 'custom' && aiSources.custom?.model === model.id
                    ? 'bg-primary'
                    : 'bg-transparent'
                }`} />
                {model.name}
              </button>
            ))
          ) : (
            // OpenAI compatible: show current model only (user configures in settings)
            <button
              onClick={handleClose}
              className={`w-full px-3 py-3 text-left text-sm hover:bg-secondary/80 transition-colors flex items-center gap-2 ${
                currentSource === 'custom' ? 'text-primary' : 'text-foreground'
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${
                currentSource === 'custom' ? 'bg-primary' : 'bg-transparent'
              }`} />
              {aiSources.custom?.model || 'Custom Model'}
            </button>
          )}
        </>
      )}

      {/* OAuth Providers - Dynamic rendering */}
      {loggedInOAuthProviders.map((provider, index) => (
        <div key={provider.type}>
          {(hasCustom || index > 0) && <div className="my-1 border-t border-border" />}
          <div className="px-3 py-2 text-xs font-medium text-muted-foreground">
            {provider.displayName}
          </div>
          {(provider.config?.availableModels || []).map((modelId) => {
            const displayName = provider.config?.modelNames?.[modelId] || modelId
            return (
              <button
                key={modelId}
                onClick={() => handleSelectModel(provider.type, modelId)}
                className={`w-full px-3 py-3 text-left text-sm hover:bg-secondary/80 transition-colors flex items-center gap-2 ${
                  currentSource === provider.type && provider.config?.model === modelId
                    ? 'text-primary'
                    : 'text-foreground'
                }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${
                  currentSource === provider.type && provider.config?.model === modelId
                    ? 'bg-primary'
                    : 'bg-transparent'
                }`} />
                {displayName}
              </button>
            )
          })}
        </div>
      ))}

      {/* Add source if none configured */}
      {!hasCustom && loggedInOAuthProviders.length === 0 && (
        <>
          <div className="my-1 border-t border-border" />
          <button
            onClick={handleAddSource}
            className="w-full px-3 py-3 text-left text-sm text-muted-foreground hover:text-foreground hover:bg-secondary/80 transition-colors flex items-center gap-2"
          >
            <Plus className="w-3.5 h-3.5" />
            {t('Add Custom API')}
          </button>
        </>
      )}
    </>
  )

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Trigger Button - icon only on mobile, text on desktop */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground hover:bg-secondary/80 rounded-lg transition-colors"
        title={currentModelName}
      >
        {/* Mobile: show Sparkles icon */}
        <Sparkles className="w-4 h-4 sm:hidden" />
        {/* Desktop: show model name */}
        <span className="hidden sm:inline max-w-[140px] truncate">{currentModelName}</span>
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown/Bottom Sheet */}
      {isOpen && (
        <>
          {isMobile ? (
            /* Mobile: Bottom Sheet */
            <>
              {/* Backdrop */}
              <div
                onClick={handleClose}
                className={`fixed inset-0 bg-black/40 z-40 ${isAnimatingOut ? 'animate-fade-out' : 'animate-fade-in'}`}
                style={{ animationDuration: '0.2s' }}
              />

              <div
                className={`
                  fixed inset-x-0 bottom-0 z-50
                  bg-card rounded-t-2xl border-t border-border/50
                  shadow-2xl overflow-hidden
                  ${isAnimatingOut ? 'animate-slide-out-bottom' : 'animate-slide-in-bottom'}
                `}
                style={{ maxHeight: '60vh' }}
              >
                {/* Drag handle */}
                <div className="flex justify-center py-2">
                  <div className="w-10 h-1 bg-muted-foreground/30 rounded-full" />
                </div>

                {/* Header */}
                <div className="px-4 py-2 border-b border-border/50 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-primary" />
                    <div>
                      <h3 className="text-base font-semibold text-foreground">{t('Select Model')}</h3>
                      <p className="text-xs text-muted-foreground">{currentModelName}</p>
                    </div>
                  </div>
                  <button
                    onClick={handleClose}
                    className="p-2 hover:bg-secondary rounded-lg transition-colors"
                  >
                    <X className="w-5 h-5 text-muted-foreground" />
                  </button>
                </div>

                {/* Model list */}
                <div className="overflow-auto" style={{ maxHeight: 'calc(60vh - 80px)' }}>
                  {renderModelList()}
                </div>
              </div>
            </>
          ) : (
            /* Desktop: Dropdown Menu */
            <div className="absolute right-0 top-full mt-1 w-56 bg-card border border-border rounded-xl shadow-lg z-50 py-1 overflow-hidden">
              {renderModelList()}
            </div>
          )}
        </>
      )}
    </div>
  )
}
