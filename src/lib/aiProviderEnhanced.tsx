import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { AIDetectionResult } from './types'
import { detectEwaste, getModelStatus, preloadModel } from './ai'
import { detectEwasteWithRoboflow, isRoboflowConfigured, getRoboflowStatus } from './roboflow'

type ModelStatus = ReturnType<typeof getModelStatus>

interface AIContextValue {
  modelStatus: ModelStatus
  roboflowStatus: {
    configured: boolean
    hasApiKey: boolean
    hasModelId: boolean
  }
  detect: (imageSource: string) => Promise<AIDetectionResult>
  detectWithFallback: (imageSource: string) => Promise<AIDetectionResult>
}

const AIContext = createContext<AIContextValue | null>(null)

function yieldToMainThread(): Promise<void> {
  // Small yield helps keep the UI responsive between expensive steps.
  return new Promise(resolve => setTimeout(resolve, 0))
}

function selectBestDetection(
  roboflowResult: AIDetectionResult | null,
  ensembleResult: AIDetectionResult
): AIDetectionResult {
  // If Roboflow not available, use ensemble
  if (!roboflowResult) {
    return ensembleResult
  }

  // If Roboflow confidence is significantly higher, prefer it
  if (roboflowResult.confidenceScore >= ensembleResult.confidenceScore + 15) {
    return {
      ...roboflowResult,
      aiModelVersion: 'hybrid-roboflow-primary'
    }
  }

  // If ensemble confidence is higher, use it
  if (ensembleResult.confidenceScore >= roboflowResult.confidenceScore + 10) {
    return {
      ...ensembleResult,
      aiModelVersion: 'hybrid-ensemble-primary'
    }
  }

  // If both agree on category, use the higher confidence
  if (roboflowResult.detectedCategory === ensembleResult.detectedCategory) {
    const result = roboflowResult.confidenceScore >= ensembleResult.confidenceScore
      ? roboflowResult
      : ensembleResult
    return {
      ...result,
      aiModelVersion: 'hybrid-consensus'
    }
  }

  // Default to Roboflow if different category (specialized model)
  return {
    ...roboflowResult,
    aiModelVersion: 'hybrid-roboflow-specialized'
  }
}

export function AIProvider({ children }: { children: React.ReactNode }) {
  const [modelStatus, setModelStatus] = useState<ModelStatus>(() => getModelStatus())
  const [roboflowStatus, setRoboflowStatus] = useState(() => getRoboflowStatus())

  useEffect(() => {
    // Load models once for the whole app.
    preloadModel()

    // Check Roboflow configuration
    
        const isConfigured = isRoboflowConfigured()
        if (isConfigured) {
          console.log('✓ Roboflow E-Waste model configured and ready')
        }

    const interval = window.setInterval(() => {
      setModelStatus(getModelStatus())
      setRoboflowStatus(getRoboflowStatus())
    }, 500)

    return () => window.clearInterval(interval)
  }, [])

  // Primary detection: Roboflow + Ensemble hybrid
  const detect = useCallback(async (imageSource: string): Promise<AIDetectionResult> => {
    await yieldToMainThread()

    const isConfigured = roboflowStatus.configured

    if (isConfigured) {
      try {
        // Try Roboflow first (specialized 77-class model)
        const roboflowResult = await detectEwasteWithRoboflow(imageSource)

        // Also run ensemble for comparison
        const ensembleResult = await detectEwaste(imageSource)

        // Select best result
        return selectBestDetection(roboflowResult, ensembleResult)
      } catch (error) {
        console.error('Roboflow detection failed, falling back to ensemble:', error)
        return detectEwaste(imageSource)
      }
    }

    // Fallback to ensemble only
    return detectEwaste(imageSource)
  }, [roboflowStatus.configured])

  // Fallback detection: Ensemble only (for when network is poor)
  const detectWithFallback = useCallback(async (imageSource: string): Promise<AIDetectionResult> => {
    await yieldToMainThread()
    return detectEwaste(imageSource)
  }, [])

  const value = useMemo(
    () => ({
      modelStatus,
      roboflowStatus,
      detect,
      detectWithFallback
    }),
    [modelStatus, roboflowStatus, detect, detectWithFallback]
  )

  return <AIContext.Provider value={value}>{children}</AIContext.Provider>
}

export function useAI() {
  const ctx = useContext(AIContext)
  if (!ctx) throw new Error('useAI must be used within an AIProvider')
  return ctx
}
