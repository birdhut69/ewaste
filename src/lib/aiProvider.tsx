import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { AIDetectionResult } from './types'
import { detectEwaste, getModelStatus, preloadModel } from './ai'

type ModelStatus = ReturnType<typeof getModelStatus>

interface AIContextValue {
  modelStatus: ModelStatus
  detect: (imageSource: string) => Promise<AIDetectionResult>
}

const AIContext = createContext<AIContextValue | null>(null)

function yieldToMainThread(): Promise<void> {
  // Small yield helps keep the UI responsive between expensive steps.
  return new Promise(resolve => setTimeout(resolve, 0))
}

export function AIProvider({ children }: { children: React.ReactNode }) {
  const [modelStatus, setModelStatus] = useState<ModelStatus>(() => getModelStatus())

  useEffect(() => {
    // Load models once for the whole app.
    preloadModel()

    const interval = window.setInterval(() => {
      setModelStatus(getModelStatus())
    }, 500)

    return () => window.clearInterval(interval)
  }, [])

  const detect = useCallback(async (imageSource: string) => {
    await yieldToMainThread()
    return detectEwaste(imageSource)
  }, [])

  const value = useMemo(
    () => ({
      modelStatus,
      detect
    }),
    [modelStatus, detect]
  )

  return <AIContext.Provider value={value}>{children}</AIContext.Provider>
}

export function useAI() {
  const ctx = useContext(AIContext)
  if (!ctx) throw new Error('useAI must be used within an AIProvider')
  return ctx
}

