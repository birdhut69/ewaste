// Roboflow E-Waste Detection Integration
// Pre-trained model: https://universe.roboflow.com/electronic-waste-detection
// 20k images, 77 specialized e-waste classes, mAP 69.8%

import type { CategoryId, AIDetectionResult } from './types'
import { EWASTE_CATEGORIES } from './types'

interface RoboflowPrediction {
  x: number
  y: number
  width: number
  height: number
  confidence: number
  class: string
  class_id: number
  detection_id: string
}

interface RoboflowResponse {
  time: number
  image: {
    width: number
    height: number
  }
  predictions: RoboflowPrediction[]
  model: {
    id: string
    name: string
    confidence: number
    overlap: number
  }
  visualization: string
}

// Mapping Roboflow 77 e-waste classes to our 7 categories
const ROBOFLOW_TO_EWASTE_CATEGORY: Record<string, { category: CategoryId; confidence_boost: number }> = {
  // Mobile Devices (20 classes)
  'smartphone': { category: 'mobile', confidence_boost: 8 },
  'iphone': { category: 'mobile', confidence_boost: 8 },
  'android phone': { category: 'mobile', confidence_boost: 8 },
  'cell phone': { category: 'mobile', confidence_boost: 8 },
  'mobile phone': { category: 'mobile', confidence_boost: 8 },
  'tablet': { category: 'mobile', confidence_boost: 6 },
  'ipad': { category: 'mobile', confidence_boost: 6 },
  'digital camera': { category: 'mobile', confidence_boost: 6 },
  'camera': { category: 'mobile', confidence_boost: 6 },
  'webcam': { category: 'mobile', confidence_boost: 5 },
  'video camera': { category: 'mobile', confidence_boost: 5 },
  'smart watch': { category: 'mobile', confidence_boost: 6 },
  'digital watch': { category: 'mobile', confidence_boost: 5 },
  'calculator': { category: 'mobile', confidence_boost: 4 },
  'ipod': { category: 'mobile', confidence_boost: 6 },
  'e-reader': { category: 'mobile', confidence_boost: 5 },
  'digital device': { category: 'mobile', confidence_boost: 4 },
  'handheld device': { category: 'mobile', confidence_boost: 4 },
  'portable device': { category: 'mobile', confidence_boost: 4 },
  'remote control': { category: 'mobile', confidence_boost: 4 },

  // Computers & Peripherals (25 classes)
  'laptop': { category: 'computer', confidence_boost: 8 },
  'desktop computer': { category: 'computer', confidence_boost: 8 },
  'computer': { category: 'computer', confidence_boost: 7 },
  'notebook': { category: 'computer', confidence_boost: 7 },
  'macbook': { category: 'computer', confidence_boost: 8 },
  'computer keyboard': { category: 'computer', confidence_boost: 7 },
  'keyboard': { category: 'computer', confidence_boost: 7 },
  'computer mouse': { category: 'computer', confidence_boost: 7 },
  'mouse': { category: 'computer', confidence_boost: 7 },
  'optical mouse': { category: 'computer', confidence_boost: 6 },
  'wireless mouse': { category: 'computer', confidence_boost: 6 },
  'trackpad': { category: 'computer', confidence_boost: 6 },
  'touchpad': { category: 'computer', confidence_boost: 6 },
  'printer': { category: 'computer', confidence_boost: 7 },
  'scanner': { category: 'computer', confidence_boost: 6 },
  'router': { category: 'computer', confidence_boost: 6 },
  'modem': { category: 'computer', confidence_boost: 6 },
  'hard drive': { category: 'computer', confidence_boost: 7 },
  'motherboard': { category: 'computer', confidence_boost: 7 },
  'circuit board': { category: 'computer', confidence_boost: 6 },
  'gpu': { category: 'computer', confidence_boost: 6 },
  'cpu': { category: 'computer', confidence_boost: 6 },
  'server': { category: 'computer', confidence_boost: 7 },
  'storage device': { category: 'computer', confidence_boost: 6 },
  'external drive': { category: 'computer', confidence_boost: 6 },

  // Monitors & Displays (10 classes)
  'monitor': { category: 'monitor', confidence_boost: 8 },
  'computer monitor': { category: 'monitor', confidence_boost: 8 },
  'television': { category: 'monitor', confidence_boost: 8 },
  'tv': { category: 'monitor', confidence_boost: 8 },
  'screen': { category: 'monitor', confidence_boost: 7 },
  'display': { category: 'monitor', confidence_boost: 7 },
  'lcd monitor': { category: 'monitor', confidence_boost: 7 },
  'led monitor': { category: 'monitor', confidence_boost: 7 },
  'crt monitor': { category: 'monitor', confidence_boost: 7 },
  'projector': { category: 'monitor', confidence_boost: 6 },

  // Cables & Connectors (12 classes)
  'cable': { category: 'cable', confidence_boost: 6 },
  'power cable': { category: 'cable', confidence_boost: 7 },
  'power cord': { category: 'cable', confidence_boost: 7 },
  'usb cable': { category: 'cable', confidence_boost: 7 },
  'charging cable': { category: 'cable', confidence_boost: 7 },
  'hdmi cable': { category: 'cable', confidence_boost: 6 },
  'ethernet cable': { category: 'cable', confidence_boost: 6 },
  'adapter': { category: 'cable', confidence_boost: 6 },
  'charger': { category: 'cable', confidence_boost: 6 },
  'power adapter': { category: 'cable', confidence_boost: 6 },
  'plug': { category: 'cable', confidence_boost: 5 },
  'connector': { category: 'cable', confidence_boost: 5 },

  // Batteries (5 classes)
  'battery': { category: 'battery', confidence_boost: 8 },
  'battery pack': { category: 'battery', confidence_boost: 8 },
  'power bank': { category: 'battery', confidence_boost: 7 },
  'lithium battery': { category: 'battery', confidence_boost: 7 },
  'rechargeable battery': { category: 'battery', confidence_boost: 7 },

  // Appliances (15+ classes)
  'microwave': { category: 'appliance', confidence_boost: 8 },
  'oven': { category: 'appliance', confidence_boost: 8 },
  'refrigerator': { category: 'appliance', confidence_boost: 8 },
  'washing machine': { category: 'appliance', confidence_boost: 8 },
  'dishwasher': { category: 'appliance', confidence_boost: 8 },
  'coffee machine': { category: 'appliance', confidence_boost: 7 },
  'toaster': { category: 'appliance', confidence_boost: 7 },
  'vacuum cleaner': { category: 'appliance', confidence_boost: 7 },
  'air conditioner': { category: 'appliance', confidence_boost: 8 },
  'electric fan': { category: 'appliance', confidence_boost: 6 },
  'heater': { category: 'appliance', confidence_boost: 6 },
  'blender': { category: 'appliance', confidence_boost: 6 },
  'mixer': { category: 'appliance', confidence_boost: 6 },
  'speaker': { category: 'appliance', confidence_boost: 5 },
  'radio': { category: 'appliance', confidence_boost: 5 },
}

let roboflowModelId: string | null = null
let roboflowApiKey: string | null = null

function initializeRoboflow(): void {
  // Get from environment or config
  roboflowApiKey = import.meta.env.VITE_ROBOFLOW_API_KEY || null
  roboflowModelId = import.meta.env.VITE_ROBOFLOW_MODEL_ID || null
}

function normalizeRoboflowClass(className: string): string {
  return className.toLowerCase().trim().replace(/_/g, ' ')
}

function mapRoboflowClassToCategory(className: string): { category: CategoryId; confidence_boost: number } {
  const normalized = normalizeRoboflowClass(className)
  
  // Exact match first
  const exactMatch = ROBOFLOW_TO_EWASTE_CATEGORY[normalized]
  if (exactMatch) {
    return exactMatch
  }

  // Partial match fallback
  for (const [key, value] of Object.entries(ROBOFLOW_TO_EWASTE_CATEGORY)) {
    if (normalized.includes(key) || key.includes(normalized)) {
      return value
    }
  }

  // Default to "other" if no match
  return { category: 'other', confidence_boost: 0 }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

async function encodeImageToBase64(imageSource: string): Promise<string> {
  if (imageSource.startsWith('data:')) {
    // Already base64
    return imageSource.split(',')[1] || imageSource
  }

  // Load from URL or canvas
  const img = new Image()
  img.crossOrigin = 'anonymous'

  return new Promise((resolve, reject) => {
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = img.width
      canvas.height = img.height
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        reject(new Error('Canvas context not available'))
        return
      }
      ctx.drawImage(img, 0, 0)
      const base64 = canvas.toDataURL('image/jpeg').split(',')[1] || ''
      resolve(base64)
    }
    img.onerror = () => reject(new Error('Failed to load image'))
    img.src = imageSource
  })
}

export async function detectEwasteWithRoboflow(imageSource: string): Promise<AIDetectionResult> {
  try {
    initializeRoboflow()

    if (!roboflowApiKey || !roboflowModelId) {
      console.warn('Roboflow API key or model ID not configured')
      return createFallbackResult()
    }

    // Encode image to base64
    const base64Image = await encodeImageToBase64(imageSource)

    // Call Roboflow API
    const response = await fetch('https://detect.roboflow.com/infer', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        api_key: roboflowApiKey,
        model: roboflowModelId,
        image: base64Image,
        format: 'json'
      })
    })

    if (!response.ok) {
      console.error('Roboflow API error:', response.status)
      return createFallbackResult()
    }

    const data: RoboflowResponse = await response.json()

    if (!data.predictions || data.predictions.length === 0) {
      return createFallbackResult()
    }

    // Score each category based on predictions
    const categoryScores: Record<CategoryId, { score: number; predictions: RoboflowPrediction[] }> = {
      mobile: { score: 0, predictions: [] },
      computer: { score: 0, predictions: [] },
      monitor: { score: 0, predictions: [] },
      cable: { score: 0, predictions: [] },
      battery: { score: 0, predictions: [] },
      appliance: { score: 0, predictions: [] },
      other: { score: 0, predictions: [] }
    }

    // Process predictions - sort by confidence
    const sortedPredictions = data.predictions.sort((a, b) => b.confidence - a.confidence)

    for (let i = 0; i < Math.min(sortedPredictions.length, 5); i++) {
      const prediction = sortedPredictions[i]
      const mapping = mapRoboflowClassToCategory(prediction.class)
      
      // Confidence calculation: base (Roboflow confidence) + boost (for this category match)
      const rankWeight = clamp(1 - i * 0.15, 0.6, 1)
      const score = (prediction.confidence * 100 + mapping.confidence_boost * 10) * rankWeight

      categoryScores[mapping.category].score += score
      categoryScores[mapping.category].predictions.push(prediction)
    }

    // Find best category
    let bestCategory: CategoryId = 'other'
    let bestScore = 0

    for (const [category, data] of Object.entries(categoryScores) as Array<[CategoryId, typeof categoryScores['mobile']]>) {
      if (data.score > bestScore) {
        bestScore = data.score
        bestCategory = category
      }
    }

    if (bestCategory === 'other' || bestScore <= 0) {
      return createFallbackResult()
    }

    // Calculate confidence (0-100)
    const totalScore = Object.values(categoryScores).reduce((sum, d) => sum + d.score, 0)
    const confidence = clamp(Math.round((bestScore / totalScore) * 100), 30, 95)

    // Get best detection for this category
    const bestDetection = categoryScores[bestCategory].predictions[0]
    const objectName = bestDetection
      ? formatRoboflowClassName(bestDetection.class)
      : getCategoryLabel(bestCategory)

    // Alternative predictions
    const alternativePredictions = Object.entries(categoryScores)
      .filter(([cat]) => cat !== bestCategory && categoryScores[cat as CategoryId].score > 0)
      .map(([cat, data]) => ({
        category: cat as CategoryId,
        confidence: clamp(Math.round((data.score / totalScore) * 100), 5, 50)
      }))
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 2)

    return {
      detectedObjectName: objectName,
      detectedCategory: bestCategory,
      confidenceScore: confidence,
      aiModelVersion: 'roboflow-v1-77classes',
      alternativePredictions,
      roboflowDetections: categoryScores[bestCategory].predictions.map(p => ({
        label: p.class,
        confidence: p.confidence
      }))
    }
  } catch (error) {
    console.error('Roboflow detection error:', error)
    return createFallbackResult()
  }
}

function formatRoboflowClassName(className: string): string {
  return className
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
    .slice(0, 48)
}

function getCategoryLabel(categoryId: CategoryId): string {
  return EWASTE_CATEGORIES.find(cat => cat.id === categoryId)?.label ?? 'Electronic Item'
}

function createFallbackResult(): AIDetectionResult {
  return {
    detectedObjectName: 'Electronic item',
    detectedCategory: 'other',
    confidenceScore: 25,
    aiModelVersion: 'roboflow-v1-fallback',
    alternativePredictions: [
      { category: 'computer', confidence: 15 },
      { category: 'mobile', confidence: 12 }
    ]
  }
}

export function isRoboflowConfigured(): boolean {
  initializeRoboflow()
  return !!(roboflowApiKey && roboflowModelId)
}

export function getRoboflowStatus(): {
  configured: boolean
  hasApiKey: boolean
  hasModelId: boolean
} {
  initializeRoboflow()
  return {
    configured: !!(roboflowApiKey && roboflowModelId),
    hasApiKey: !!roboflowApiKey,
    hasModelId: !!roboflowModelId
  }
}
