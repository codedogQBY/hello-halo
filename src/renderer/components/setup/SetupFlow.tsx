/**
 * SetupFlow - Multi-source login flow
 * Handles the first-time setup with OAuth providers or Custom API
 * Dynamically supports any provider configured in product.json
 */

import { useState, useEffect } from 'react'
import { useAppStore } from '../../stores/app.store'
import { api } from '../../api'
import { LoginSelector } from './LoginSelector'
import { ApiSetup } from './ApiSetup'
import { useTranslation } from '../../i18n'
import { Loader2 } from 'lucide-react'

type SetupStep = 'select' | 'oauth-waiting' | 'custom'

export function SetupFlow() {
  const { t } = useTranslation()
  const { setView, setConfig } = useAppStore()
  const [step, setStep] = useState<SetupStep>('select')
  const [currentProvider, setCurrentProvider] = useState<string | null>(null)
  const [oauthState, setOauthState] = useState<string | null>(null)
  const [loginStatus, setLoginStatus] = useState<string>('')
  const [error, setError] = useState<string | null>(null)

  // Handle OAuth provider login (generic)
  const handleSelectProvider = async (providerType: string) => {
    setError(null)
    setCurrentProvider(providerType)
    setStep('oauth-waiting')
    setLoginStatus(t('Opening login page...'))

    try {
      // Start the login flow - this opens the browser
      const result = await api.authStartLogin(providerType)
      if (!result.success) {
        throw new Error(result.error || 'Failed to start login')
      }

      const { state } = result.data as { loginUrl: string; state: string }
      setOauthState(state)
      setLoginStatus(t('Waiting for login...'))

      // Complete the login - this polls for the token
      const completeResult = await api.authCompleteLogin(providerType, state)
      if (!completeResult.success) {
        throw new Error(completeResult.error || 'Login failed')
      }

      // Success! Reload config and go to home
      const configResult = await api.getConfig()
      if (configResult.success && configResult.data) {
        setConfig(configResult.data as any)
      }

      setView('home')
    } catch (err) {
      console.error(`[SetupFlow] ${providerType} login error:`, err)
      setError(err instanceof Error ? err.message : 'Login failed')
      setStep('select')
      setCurrentProvider(null)
    }
  }

  // Handle Custom API selection
  const handleSelectCustom = () => {
    setStep('custom')
  }

  // Handle back from Custom API
  const handleBackFromCustom = () => {
    setStep('select')
  }

  // Listen for login progress updates (generic)
  useEffect(() => {
    if (step !== 'oauth-waiting' || !currentProvider) return

    // Listen to generic auth progress
    const unsubscribe = api.onAuthLoginProgress((data: { provider: string; status: string }) => {
      if (data.provider === currentProvider) {
        setLoginStatus(data.status)
      }
    })

    return unsubscribe
  }, [step, currentProvider])

  // Render based on step
  if (step === 'select') {
    return (
      <LoginSelector
        onSelectProvider={handleSelectProvider}
        onSelectCustom={handleSelectCustom}
      />
    )
  }

  if (step === 'oauth-waiting') {
    return (
      <div className="h-full w-full flex flex-col items-center justify-center bg-background p-8">
        {/* Header with Logo */}
        <div className="flex flex-col items-center mb-10">
          <div className="w-20 h-20 rounded-full border-2 border-primary/60 flex items-center justify-center halo-glow">
            <div className="w-14 h-14 rounded-full bg-gradient-to-br from-primary/30 to-transparent" />
          </div>
          <h1 className="mt-4 text-3xl font-light tracking-wide">Halo</h1>
        </div>

        {/* Loading state */}
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="text-muted-foreground">{loginStatus}</p>
          <p className="text-sm text-muted-foreground/70">
            {t('Please complete login in your browser')}
          </p>
        </div>

        {/* Error message */}
        {error && (
          <div className="mt-6 p-4 bg-destructive/10 border border-destructive/20 rounded-lg">
            <p className="text-sm text-destructive">{error}</p>
          </div>
        )}

        {/* Cancel button */}
        <button
          onClick={() => {
            setStep('select')
            setCurrentProvider(null)
          }}
          className="mt-8 px-6 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          {t('Cancel')}
        </button>
      </div>
    )
  }

  if (step === 'custom') {
    return <ApiSetup showBack onBack={handleBackFromCustom} />
  }

  return null
}
