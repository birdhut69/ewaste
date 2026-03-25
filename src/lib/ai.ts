// AI image recognition for e-waste classification
// Ensemble approach: MobileNet classifier + COCO-SSD detector + visual feature heuristics

import { EWASTE_CATEGORIES } from './types'
import type { AIDetectionResult, CategoryId } from './types'
import { getAIFeedbackSignal } from './aiFeedback'

const AI_MODEL_VERSION = 'ewaste-ensemble-v3.3-consensus'
const LITE_MODEL_VERSION = 'ewaste-lite-v3'
const CANVAS_SIZE = 224
const MIN_DETECTION_SCORE = 0.33
const MAX_CLASSIFIER_PREDICTIONS = 10
const CONSENSUS_MIN_AGREEMENT = 0.66
const CONSENSUS_BASE_BONUS = 28

interface ClassifierPrediction {
  className: string
  probability: number
}

interface TFClassifier {
  classify: (img: HTMLImageElement | HTMLCanvasElement) => Promise<ClassifierPrediction[]>
}

interface DetectorPrediction {
  class: string
  score: number
  bbox: [number, number, number, number]
}

interface TFObjectDetector {
  detect: (img: HTMLImageElement | HTMLCanvasElement) => Promise<DetectorPrediction[]>
}

interface ModelBundle {
  classifier: TFClassifier
  detector: TFObjectDetector | null
}

interface CategoryMapping {
  category: CategoryId
  boost: number
  matched: boolean
}

interface ImageFeatures {
  darkRatio: number
  lightRatio: number
  edgeDensity: number
  lowSaturationRatio: number
  metallicRatio: number
  blueLightRatio: number
  aspectRatio: number
}

interface FeatureInference {
  category: CategoryId
  confidence: number
}

interface EvidenceSignal {
  label: string
  category: CategoryId
  score: number
  matched: boolean
}

const DIRECT_CLASS_MAPPINGS: Record<string, { category: CategoryId; boost: number }> = {
  // Mobile devices
  'cellular telephone': { category: 'mobile', boost: 34 },
  'cellular phone': { category: 'mobile', boost: 34 },
  'cell phone': { category: 'mobile', boost: 34 },
  'smartphone': { category: 'mobile', boost: 36 },
  'iphone': { category: 'mobile', boost: 36 },
  'mobile phone': { category: 'mobile', boost: 34 },
  'tablet computer': { category: 'mobile', boost: 28 },
  'tablet': { category: 'mobile', boost: 24 },
  'ipad': { category: 'mobile', boost: 26 },
  'ipod': { category: 'mobile', boost: 24 },
  'digital camera': { category: 'mobile', boost: 24 },
  'reflex camera': { category: 'mobile', boost: 20 },
  'video camera': { category: 'mobile', boost: 18 },
  'remote control': { category: 'mobile', boost: 20 },
  'digital watch': { category: 'mobile', boost: 16 },
  'smart watch': { category: 'mobile', boost: 20 },
  'calculator': { category: 'mobile', boost: 14 },

  // Computer / peripheral
  'desktop computer': { category: 'computer', boost: 36 },
  'computer keyboard': { category: 'computer', boost: 34 },
  'computer mouse': { category: 'computer', boost: 38 },
  'optical mouse': { category: 'computer', boost: 34 },
  'wireless mouse': { category: 'computer', boost: 34 },
  'trackball': { category: 'computer', boost: 32 },
  'trackpad': { category: 'computer', boost: 28 },
  'touchpad': { category: 'computer', boost: 28 },
  'laptop': { category: 'computer', boost: 36 },
  'notebook': { category: 'computer', boost: 34 },
  'macbook': { category: 'computer', boost: 34 },
  'monitor stand': { category: 'computer', boost: 18 },
  'printer': { category: 'computer', boost: 30 },
  'scanner': { category: 'computer', boost: 28 },
  'webcam': { category: 'computer', boost: 26 },
  'hard disk': { category: 'computer', boost: 28 },
  'hard disc': { category: 'computer', boost: 28 },
  'motherboard': { category: 'computer', boost: 30 },
  'circuit board': { category: 'computer', boost: 26 },
  'router': { category: 'computer', boost: 24 },
  'modem': { category: 'computer', boost: 24 },
  'game controller': { category: 'computer', boost: 24 },
  'joystick': { category: 'computer', boost: 22 },

  // Monitor / display
  'computer monitor': { category: 'monitor', boost: 36 },
  'monitor': { category: 'monitor', boost: 32 },
  'television': { category: 'monitor', boost: 34 },
  'tv': { category: 'monitor', boost: 32 },
  'screen': { category: 'monitor', boost: 24 },
  'display': { category: 'monitor', boost: 22 },
  'lcd': { category: 'monitor', boost: 22 },
  'led monitor': { category: 'monitor', boost: 24 },
  'projector': { category: 'monitor', boost: 22 },

  // Cables / adapters
  'power cord': { category: 'cable', boost: 34 },
  'extension cord': { category: 'cable', boost: 30 },
  'usb cable': { category: 'cable', boost: 34 },
  'charging cable': { category: 'cable', boost: 34 },
  'charger': { category: 'cable', boost: 30 },
  'adapter': { category: 'cable', boost: 28 },
  'plug': { category: 'cable', boost: 22 },
  'cable': { category: 'cable', boost: 22 },
  'wire': { category: 'cable', boost: 20 },
  'headphone': { category: 'cable', boost: 18 },
  'earphone': { category: 'cable', boost: 18 },

  // Battery
  'battery pack': { category: 'battery', boost: 34 },
  'battery charger': { category: 'battery', boost: 30 },
  'battery': { category: 'battery', boost: 30 },
  'power bank': { category: 'battery', boost: 32 },

  // Appliances
  'washing machine': { category: 'appliance', boost: 36 },
  'refrigerator': { category: 'appliance', boost: 36 },
  'microwave': { category: 'appliance', boost: 34 },
  'dishwasher': { category: 'appliance', boost: 34 },
  'vacuum cleaner': { category: 'appliance', boost: 30 },
  'toaster': { category: 'appliance', boost: 30 },
  'coffee maker': { category: 'appliance', boost: 28 },
  'mixer': { category: 'appliance', boost: 26 },
  'blender': { category: 'appliance', boost: 26 },
  'electric fan': { category: 'appliance', boost: 28 },
  'air conditioner': { category: 'appliance', boost: 30 },
  'speaker': { category: 'appliance', boost: 22 },
  'radio': { category: 'appliance', boost: 20 },
  'digital clock': { category: 'appliance', boost: 18 },

  // Known non e-waste distractors
  'crate': { category: 'other', boost: 2 },
  'wooden box': { category: 'other', boost: 2 },
  'cardboard box': { category: 'other', boost: 2 }
}

const DIRECT_MAPPING_ENTRIES = Object.entries(DIRECT_CLASS_MAPPINGS).sort(
  ([labelA], [labelB]) => labelB.length - labelA.length
)

const COCO_TO_EWASTE: Record<string, { category: CategoryId; boost: number }> = {
  'cell phone': { category: 'mobile', boost: 38 },
  laptop: { category: 'computer', boost: 38 },
  keyboard: { category: 'computer', boost: 34 },
  tv: { category: 'monitor', boost: 36 },
  remote: { category: 'mobile', boost: 26 },
  microwave: { category: 'appliance', boost: 34 },
  oven: { category: 'appliance', boost: 32 },
  toaster: { category: 'appliance', boost: 32 },
  refrigerator: { category: 'appliance', boost: 34 },
  'hair drier': { category: 'appliance', boost: 26 },
  mouse: { category: 'computer', boost: 38 }
}

const KEYWORD_HINTS: Record<CategoryId, Array<{ term: string; weight: number }>> = {
  mobile: [
    { term: 'phone', weight: 6 },
    { term: 'smart', weight: 4 },
    { term: 'handheld', weight: 6 },
    { term: 'portable', weight: 4 },
    { term: 'touchscreen', weight: 5 },
    { term: 'camera', weight: 4 }
  ],
  computer: [
    { term: 'computer', weight: 6 },
    { term: 'laptop', weight: 6 },
    { term: 'desktop', weight: 5 },
    { term: 'keyboard', weight: 6 },
    { term: 'mouse', weight: 4 },
    { term: 'trackpad', weight: 5 },
    { term: 'circuit', weight: 4 },
    { term: 'motherboard', weight: 6 },
    { term: 'chip', weight: 4 }
  ],
  monitor: [
    { term: 'monitor', weight: 6 },
    { term: 'screen', weight: 5 },
    { term: 'display', weight: 5 },
    { term: 'television', weight: 6 },
    { term: 'tv', weight: 5 },
    { term: 'lcd', weight: 5 },
    { term: 'led', weight: 4 }
  ],
  cable: [
    { term: 'wire', weight: 5 },
    { term: 'cable', weight: 6 },
    { term: 'cord', weight: 6 },
    { term: 'usb', weight: 5 },
    { term: 'connector', weight: 5 },
    { term: 'adapter', weight: 5 },
    { term: 'charger', weight: 6 },
    { term: 'plug', weight: 4 }
  ],
  battery: [
    { term: 'battery', weight: 7 },
    { term: 'lithium', weight: 6 },
    { term: 'power bank', weight: 7 },
    { term: 'rechargeable', weight: 5 },
    { term: 'cell', weight: 4 }
  ],
  appliance: [
    { term: 'appliance', weight: 6 },
    { term: 'microwave', weight: 7 },
    { term: 'toaster', weight: 6 },
    { term: 'refrigerator', weight: 7 },
    { term: 'washer', weight: 6 },
    { term: 'vacuum', weight: 6 },
    { term: 'fan', weight: 5 },
    { term: 'blender', weight: 5 },
    { term: 'mixer', weight: 5 }
  ],
  other: [{ term: 'electronic', weight: 2 }]
}

const FALSE_POSITIVE_TYPOS: Record<string, string> = {
  'cellular telephone': 'mobile phone',
  'cellular phone': 'mobile phone',
  'cell phone': 'mobile phone',
  'handheld computer': 'mobile phone'
}

const NON_EWASTE_TERMS = [
  'crate',
  'carton',
  'wooden box',
  'table',
  'chair',
  'sofa',
  'bed',
  'person',
  'human',
  'cat',
  'dog',
  'bird',
  'flower',
  'plant',
  'banana',
  'apple',
  'orange',
  'food',
  'tree',
  'mountain',
  'carpet',
  'wood',
  'meat loaf',
  'meatloaf',
  'loaf',
  'dough',
  'bread',
  'pizza',
  'sandwich',
  'burrito',
  'taco',
  'hot dog',
  'hamburger',
  'potpie',
  'bakery',
  'basketball',
  'football',
  'soccer',
  'baseball',
  'volleyball',
  'tennis',
  'ball',
  'racket',
  'sport',
  'shoe',
  'clothing',
  'shirt',
  'pants',
  'jeans',
  'dress',
  'bottle',
  'cup',
  'glass',
  'mug',
  'plate',
  'bowl',
  'fork',
  'knife',
  'spoon',
  'toy',
  'doll',
  'teddy',
  'book',
  'paper',
  'pen',
  'pencil',
  'desk',
  'furniture',
  'pillow',
  'blanket',
  'curtain',
  // COCO non-ewaste classes
  'person',
  'bicycle',
  'car',
  'motorcycle',
  'airplane',
  'bus',
  'train',
  'truck',
  'boat',
  'traffic light',
  'fire hydrant',
  'stop sign',
  'parking meter',
  'bench',
  'bird',
  'cat',
  'dog',
  'horse',
  'sheep',
  'cow',
  'elephant',
  'bear',
  'zebra',
  'giraffe',
  'backpack',
  'umbrella',
  'handbag',
  'tie',
  'suitcase',
  'frisbee',
  'skis',
  'snowboard',
  'sports ball',
  'kite',
  'baseball bat',
  'baseball glove',
  'skateboard',
  'surfboard',
  'tennis racket',
  'bottle',
  'wine glass',
  'cup',
  'fork',
  'knife',
  'spoon',
  'bowl',
  'banana',
  'apple',
  'sandwich',
  'orange',
  'broccoli',
  'carrot',
  'hot dog',
  'pizza',
  'donut',
  'cake',
  'chair',
  'couch',
  'potted plant',
  'bed',
  'dining table',
  'toilet',
  'book',
  'vase',
  'scissors',
  'teddy bear',
  'toothbrush'
]

let modelInstance: ModelBundle | null = null
let modelLoadingPromise: Promise<ModelBundle> | null = null
let modelStatus: 'not-loaded' | 'loading' | 'loaded' | 'failed' = 'not-loaded'

function createEmptyCategoryScores(): Record<CategoryId, number> {
  return {
    mobile: 0,
    computer: 0,
    monitor: 0,
    cable: 0,
    battery: 0,
    appliance: 0,
    other: 0
  }
}

function normalizeLabel(label: string): string {
  const normalized = label
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  
  return FALSE_POSITIVE_TYPOS[normalized] || normalized
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function hasAnyTerm(text: string, terms: string[]): boolean {
  return terms.some(term => {
    const pattern = new RegExp(`\\b${escapeRegExp(term)}\\b`)
    return pattern.test(text)
  })
}

function mapToEwasteCategory(className: string): CategoryMapping {
  const normalized = normalizeLabel(className)

  for (const [label, mapping] of DIRECT_MAPPING_ENTRIES) {
    if (normalized.includes(label)) {
      return { category: mapping.category, boost: mapping.boost, matched: true }
    }
  }

  const categoryScores = createEmptyCategoryScores()
  for (const [category, hints] of Object.entries(KEYWORD_HINTS) as Array<
    [CategoryId, Array<{ term: string; weight: number }>]
  >) {
    for (const hint of hints) {
      if (normalized.includes(hint.term)) {
        categoryScores[category] += hint.weight
      }
    }
  }

  let bestCategory: CategoryId = 'other'
  let bestScore = 0

  for (const category of Object.keys(categoryScores) as CategoryId[]) {
    if (categoryScores[category] > bestScore) {
      bestScore = categoryScores[category]
      bestCategory = category
    }
  }

  if (bestScore > 0) {
    return {
      category: bestCategory,
      boost: clamp(Math.round(bestScore * 2.6), 6, 22),
      matched: bestScore >= 4
    }
  }

  if (hasAnyTerm(normalized, NON_EWASTE_TERMS)) {
    return { category: 'other', boost: -10, matched: false } // Penalize known non-ewaste
  }

  // If it's not in our e-waste whitelist and not in our blocklist, treat it neutrally/suspiciously
  // but do NOT boost it.
  return { category: 'other', boost: 0, matched: false }
}

function mapDetectionToEwasteCategory(className: string): CategoryMapping {
  const normalized = normalizeLabel(className)
  const cocoMapping = COCO_TO_EWASTE[normalized]
  if (cocoMapping) {
    return { category: cocoMapping.category, boost: cocoMapping.boost, matched: true }
  }
  return mapToEwasteCategory(className)
}

function registerTfGlobal(tf: unknown): void {
  const globalObj = globalThis as { tf?: unknown; window?: { tf?: unknown }; self?: { tf?: unknown } }
  globalObj.tf = tf
  if (globalObj.window) {
    globalObj.window.tf = tf
  }
  if (globalObj.self) {
    globalObj.self.tf = tf
  }
}

function deriveClassifierConsensus(
  classifierOutputs: ClassifierPrediction[][]
): { category: CategoryId | null; agreement: number; averageProbability: number } {
  const votes = createEmptyCategoryScores()
  const probabilities: Record<CategoryId, number[]> = {
    mobile: [],
    computer: [],
    monitor: [],
    cable: [],
    battery: [],
    appliance: [],
    other: []
  }

  classifierOutputs.forEach((predictions) => {
    let bestVote: { category: CategoryId; score: number; probability: number } | null = null

    for (let i = 0; i < Math.min(predictions.length, 4); i++) {
      const prediction = predictions[i]
      const mapping = mapToEwasteCategory(prediction.className)
      const rankWeight = clamp(1 - i * 0.15, 0.5, 1)
      const mappedBoost = mapping.matched ? 1.15 : 1
      const voteScore = prediction.probability * rankWeight * mappedBoost

      if (!bestVote || voteScore > bestVote.score) {
        bestVote = {
          category: mapping.category,
          score: voteScore,
          probability: prediction.probability
        }
      }
    }

    if (bestVote) {
      votes[bestVote.category] += 1
      probabilities[bestVote.category].push(bestVote.probability)
    }
  })

  const sortedVotes = (Object.entries(votes) as Array<[CategoryId, number]>).sort((a, b) => b[1] - a[1])
  const [topCategory, topVotes] = sortedVotes[0] ?? ['other', 0]

  if (!topVotes || classifierOutputs.length === 0) {
    return { category: null, agreement: 0, averageProbability: 0 }
  }

  const agreement = topVotes / classifierOutputs.length
  const values = probabilities[topCategory]
  const averageProbability = values.length
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : 0

  return {
    category: topCategory,
    agreement,
    averageProbability
  }
}

async function dynamicImport<T>(url: string): Promise<T> {
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  return Function('url', 'return import(url)')(url) as Promise<T>
}

async function loadModel(): Promise<ModelBundle> {
  if (modelInstance) return modelInstance
  if (modelLoadingPromise) return modelLoadingPromise

  modelStatus = 'loading'

  modelLoadingPromise = (async () => {
    try {
      const tfUrl = 'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.17.0/+esm'
      const mobileNetUrl = 'https://cdn.jsdelivr.net/npm/@tensorflow-models/mobilenet@2.1.1/+esm'
      const cocoSsdUrl = 'https://cdn.jsdelivr.net/npm/@tensorflow-models/coco-ssd@2.2.3/+esm'

      const [tf, mobilenet] = await Promise.all<any>([
        dynamicImport(tfUrl),
        dynamicImport(mobileNetUrl)
      ])

      if (typeof tf.ready === 'function') {
        await tf.ready()
      }

      if (typeof tf.getBackend === 'function' && typeof tf.setBackend === 'function') {
        const currentBackend = tf.getBackend()
        if (currentBackend === 'cpu') {
          try {
            await tf.setBackend('webgl')
            await tf.ready()
          } catch {
            // CPU backend remains available as fallback.
          }
        }
      }

      // Some coco-ssd runtime builds expect tf to be present on multiple globals.
      registerTfGlobal(tf)

      const classifier = await mobilenet.load({ version: 2, alpha: 1.0 })

      let detector: TFObjectDetector | null = null
      try {
        const cocoSsd = await dynamicImport<any>(cocoSsdUrl)
        detector = await cocoSsd.load({ base: 'mobilenet_v2' })
      } catch (detectorError) {
        console.warn('COCO detector unavailable, continuing with classifier only:', detectorError)
      }

      modelInstance = {
        classifier,
        detector
      }
      modelStatus = 'loaded'
      return modelInstance
    } catch (error) {
      console.error('Failed to load AI models:', error)
      modelStatus = 'failed'
      throw new Error('AI model loading failed')
    }
  })()

  return modelLoadingPromise
}

async function loadImage(imageSource: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.decoding = 'async'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Failed to load image'))
    img.src = imageSource
  })
}

function createSquareCanvas(image: HTMLImageElement, cropScale: number): HTMLCanvasElement {
  const width = image.naturalWidth || image.width
  const height = image.naturalHeight || image.height
  const baseSize = Math.min(width, height)
  const cropSize = clamp(baseSize * cropScale, baseSize * 0.45, baseSize)

  const sx = (width - cropSize) / 2
  const sy = (height - cropSize) / 2

  const canvas = document.createElement('canvas')
  canvas.width = CANVAS_SIZE
  canvas.height = CANVAS_SIZE

  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('Canvas not supported')
  }

  ctx.drawImage(image, sx, sy, cropSize, cropSize, 0, 0, CANVAS_SIZE, CANVAS_SIZE)
  return canvas
}

function analyzeImageFeatures(imageData: ImageData, width: number, height: number): ImageFeatures {
  const data = imageData.data
  const pixelCount = data.length / 4

  let darkPixels = 0
  let lightPixels = 0
  let lowSaturationPixels = 0
  let metallicPixels = 0
  let blueLightPixels = 0

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i]
    const g = data[i + 1]
    const b = data[i + 2]

    const max = Math.max(r, g, b)
    const min = Math.min(r, g, b)
    const brightness = (r + g + b) / 3
    const saturation = max === 0 ? 0 : (max - min) / max

    if (brightness < 62) darkPixels++
    if (brightness > 198) lightPixels++
    if (saturation < 0.2) lowSaturationPixels++

    // Metallic devices often have close RGB channels in mid brightness ranges.
    if (Math.abs(r - g) < 22 && Math.abs(g - b) < 22 && brightness > 90 && brightness < 220) {
      metallicPixels++
    }

    // Screen-like glow tends to have stronger blue channel on bright pixels.
    if (b > r + 18 && b > g + 18 && brightness > 140) {
      blueLightPixels++
    }
  }

  let edgeCount = 0
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = (y * width + x) * 4
      const current = (data[idx] + data[idx + 1] + data[idx + 2]) / 3
      const rightIdx = (y * width + (x + 1)) * 4
      const bottomIdx = ((y + 1) * width + x) * 4
      const right = (data[rightIdx] + data[rightIdx + 1] + data[rightIdx + 2]) / 3
      const bottom = (data[bottomIdx] + data[bottomIdx + 1] + data[bottomIdx + 2]) / 3

      if (Math.abs(current - right) > 28 || Math.abs(current - bottom) > 28) {
        edgeCount++
      }
    }
  }

  return {
    darkRatio: darkPixels / pixelCount,
    lightRatio: lightPixels / pixelCount,
    edgeDensity: edgeCount / ((width - 2) * (height - 2)),
    lowSaturationRatio: lowSaturationPixels / pixelCount,
    metallicRatio: metallicPixels / pixelCount,
    blueLightRatio: blueLightPixels / pixelCount,
    aspectRatio: width / height
  }
}

function inferCategoryFromFeatures(features: ImageFeatures): FeatureInference[] {
  const scores = createEmptyCategoryScores()

  if (features.blueLightRatio > 0.06 && features.darkRatio > 0.25) {
    scores.monitor += 64
    scores.mobile += 52
  }

  if (features.metallicRatio > 0.11 && features.edgeDensity > 0.13) {
    scores.computer += 56
  }

  if (features.darkRatio > 0.34 && features.edgeDensity > 0.12 && features.aspectRatio > 1.0) {
    scores.mobile += 50
  }

  if (features.edgeDensity > 0.22 && features.lowSaturationRatio > 0.42) {
    scores.cable += 50
  }

  if (features.lightRatio > 0.3 && features.metallicRatio > 0.1) {
    scores.appliance += 48
  }

  if (features.darkRatio > 0.52 && features.lowSaturationRatio > 0.55) {
    scores.battery += 44
  }

  return (Object.entries(scores) as Array<[CategoryId, number]>)
    .filter(([, score]) => score > 0)
    .sort(([, scoreA], [, scoreB]) => scoreB - scoreA)
    .slice(0, 3)
    .map(([category, confidence]) => ({ category, confidence }))
}

function getCategoryLabel(categoryId: CategoryId): string {
  return EWASTE_CATEGORIES.find(category => category.id === categoryId)?.label ?? 'Electronic Item'
}

function formatObjectName(label: string): string {
  if (!label) return 'Electronic item'

  if (label.startsWith('feature:')) {
    const featureCategory = label.split(':')[1] as CategoryId | undefined
    if (featureCategory) {
      return getCategoryLabel(featureCategory)
    }
    return 'Electronic item'
  }

  const cleaned = label
    .split(',')[0]
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  if (!cleaned) return 'Electronic item'

  return cleaned
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ')
    .slice(0, 48)
}

function createFallbackResult(): AIDetectionResult {
  return {
    detectedObjectName: 'Electronic item',
    detectedCategory: 'other',
    confidenceScore: 30,
    aiModelVersion: AI_MODEL_VERSION,
    alternativePredictions: [
      { category: 'computer', confidence: 18 },
      { category: 'mobile', confidence: 17 },
      { category: 'appliance', confidence: 14 }
    ]
  }
}

export async function detectEwaste(imageSource: string): Promise<AIDetectionResult> {
  try {
    const [models, image] = await Promise.all([loadModel(), loadImage(imageSource)])

    const fullCanvas = createSquareCanvas(image, 1)
    const centerCanvas = createSquareCanvas(image, 0.78)
    const detailCanvas = createSquareCanvas(image, 0.62)

    const classifierRuns = [
      { input: fullCanvas as HTMLCanvasElement | HTMLImageElement, weight: 1.0 },
      { input: centerCanvas as HTMLCanvasElement | HTMLImageElement, weight: 1.15 },
      { input: detailCanvas as HTMLCanvasElement | HTMLImageElement, weight: 1.24 }
    ]

    const detectionPromise = models.detector
      ? models.detector.detect(image).catch(() => [])
      : Promise.resolve([])

    const [classifierOutputs, detections] = await Promise.all([
      Promise.all(classifierRuns.map(run => models.classifier.classify(run.input))),
      detectionPromise
    ])

    const consensus = deriveClassifierConsensus(classifierOutputs)

    const centerCtx = centerCanvas.getContext('2d')
    if (!centerCtx) {
      throw new Error('Canvas not supported')
    }

    const features = analyzeImageFeatures(
      centerCtx.getImageData(0, 0, CANVAS_SIZE, CANVAS_SIZE),
      CANVAS_SIZE,
      CANVAS_SIZE
    )
    const featureInferences = inferCategoryFromFeatures(features)

    const categoryScores = createEmptyCategoryScores()
    const evidenceSignals: EvidenceSignal[] = []
    let matchedSignals = 0

    classifierOutputs.forEach((predictions, runIndex) => {
      const runWeight = classifierRuns[runIndex].weight

      for (let i = 0; i < Math.min(predictions.length, MAX_CLASSIFIER_PREDICTIONS); i++) {
        const prediction = predictions[i]
        const mapping = mapToEwasteCategory(prediction.className)
        const rankWeight = clamp(1 - i * 0.1, 0.22, 1)
        
        // If it's a known typo correction, boost it
        const isCorrected = FALSE_POSITIVE_TYPOS[prediction.className.toLowerCase()] !== undefined
        const correctionBoost = isCorrected ? 1.5 : 1.0

        const nonEwastePenalty = hasAnyTerm(normalizeLabel(prediction.className), NON_EWASTE_TERMS)
          ? 0
          : (mapping.category === 'other' && !mapping.matched) ? 0.1 : 1

        const weightedScore =
          (prediction.probability * 100 + mapping.boost) * rankWeight * runWeight * nonEwastePenalty * correctionBoost

        if (weightedScore <= 0) continue

        categoryScores[mapping.category] += weightedScore
        evidenceSignals.push({
          label: prediction.className,
          category: mapping.category,
          score: weightedScore,
          matched: mapping.matched
        })

        if (mapping.matched) {
          matchedSignals++
        }
      }
    })

    const imageArea = (image.naturalWidth || image.width) * (image.naturalHeight || image.height)

    detections
      .filter(detection => detection.score >= MIN_DETECTION_SCORE)
      .slice(0, 6)
      .forEach(detection => {
        const mapping = mapDetectionToEwasteCategory(detection.class)
        const detectionArea = detection.bbox[2] * detection.bbox[3]
        const areaRatio = imageArea > 0 ? detectionArea / imageArea : 0
        const areaMultiplier = 1 + clamp(areaRatio * 2.2, 0, 0.9)
        
        const nonEwastePenalty = hasAnyTerm(normalizeLabel(detection.class), NON_EWASTE_TERMS) 
          ? 0 
          : (mapping.category === 'other' && !mapping.matched) ? 0.1 : 1

        // Heavily boost object detection results as they are more specific than classification
        const weightedScore = (detection.score * 100 + mapping.boost + 24) * areaMultiplier * 1.5 * nonEwastePenalty

        if (weightedScore <= 0) return

        categoryScores[mapping.category] += weightedScore
        evidenceSignals.push({
          label: detection.class,
          category: mapping.category,
          score: weightedScore,
          matched: mapping.matched
        })

        if (mapping.matched || detection.score > 0.58) {
          matchedSignals++
        }
      })

    featureInferences.forEach(inference => {
      const weightedScore = inference.confidence * 0.75
      categoryScores[inference.category] += weightedScore
      evidenceSignals.push({
        label: `feature:${inference.category}`,
        category: inference.category,
        score: weightedScore,
        matched: true
      })
    })

    if (
      consensus.category &&
      consensus.category !== 'other' &&
      consensus.agreement >= CONSENSUS_MIN_AGREEMENT
    ) {
      const consensusBonus =
        CONSENSUS_BASE_BONUS * consensus.agreement +
        clamp(consensus.averageProbability * 24, 0, 24)

      categoryScores[consensus.category] += consensusBonus
      evidenceSignals.push({
        label: `consensus:${consensus.category}`,
        category: consensus.category,
        score: consensusBonus,
        matched: true
      })
      matchedSignals++
    }

    const feedbackSignal = getAIFeedbackSignal()
    ;(Object.keys(categoryScores) as CategoryId[]).forEach((category) => {
      const bias = clamp(feedbackSignal.categoryBias[category], -8, 12)
      if (!bias) return
      categoryScores[category] += bias * 3
    })

    const strongestEvidenceLabel = evidenceSignals
      .slice()
      .sort((a, b) => b.score - a.score)[0]?.label

    if (strongestEvidenceLabel) {
      const normalizedEvidence = normalizeLabel(strongestEvidenceLabel)
      const correctedCategory = feedbackSignal.objectCorrection[normalizedEvidence]

      if (correctedCategory) {
        categoryScores[correctedCategory] += 22
      }
    }

    const sortedScores = (Object.entries(categoryScores) as Array<[CategoryId, number]>)
      .sort(([, scoreA], [, scoreB]) => scoreB - scoreA)

    const [initialBestCategory, bestScore] = sortedScores[0] ?? ['other', 0]
    let bestCategory = initialBestCategory
    const secondCandidate = sortedScores[1]
    const secondScore = secondCandidate?.[1] ?? 0
    const totalScore = Object.values(categoryScores).reduce((sum, score) => sum + Math.max(score, 0), 0)

    if (!Number.isFinite(totalScore) || totalScore <= 0 || bestScore <= 0) {
      return detectEwasteLite(imageSource)
    }

    const promoteSecondFromOther =
      bestCategory === 'other' &&
      secondCandidate &&
      secondCandidate[0] !== 'other' &&
      secondScore >= bestScore * 0.72

    if (promoteSecondFromOther) {
      bestCategory = secondCandidate[0]
    }

    const effectiveBestScore = promoteSecondFromOther ? secondScore : bestScore
    const effectiveSecondScore = promoteSecondFromOther
      ? (sortedScores[2]?.[1] ?? bestScore)
      : secondScore

    const confidenceShare = effectiveBestScore / totalScore
    const confidenceMargin = (effectiveBestScore - effectiveSecondScore) / Math.max(effectiveBestScore, 1)
    const signalStrength = Math.min(1, matchedSignals / 10)

    let confidence = Math.round(
      25 + confidenceShare * 60 + confidenceMargin * 20 + signalStrength * 18 + matchedSignals * 0.8
    )

    // IF we have strong matched signals (classifier + detector agree), boost confidence
    if (matchedSignals >= 3 && confidenceMargin > 0.15) {
      confidence = Math.min(confidence + 12, 97)
    }

    // Prevent "other" from being auto-selected as a real category.
    // Citizen UI auto-selects at >= 58, so cap "other" below that.
    if (bestCategory === 'other') {
      confidence = Math.min(confidence, 52)
    }

    if (promoteSecondFromOther) {
      // Promotion improves category usefulness - be more confident when we promote from "other"
      confidence = Math.min(confidence + 8, 85)
    }

    if (confidenceShare < 0.20) {
      confidence = Math.min(confidence, 46)
    }

    confidence = clamp(confidence, 20, 97)

    const bestEvidence = evidenceSignals
      .sort((a, b) => b.score - a.score)
      .find(signal => !signal.label.startsWith('feature:'))
      ?? evidenceSignals.sort((a, b) => b.score - a.score)[0]

    const bestDetection = detections
      .filter(d => mapDetectionToEwasteCategory(d.class).category === bestCategory)
      .sort((a, b) => b.score - a.score)[0]

    const alternativePredictions = sortedScores
      .slice(1, 4)
      .map(([category, score]) => ({
        category,
        confidence: Math.max(1, Math.round((score / totalScore) * 100))
      }))
      .filter(prediction => prediction.confidence >= 5)

    return {
      detectedObjectName: formatObjectName(bestEvidence?.label ?? 'Electronic item'),
      detectedCategory: bestCategory,
      confidenceScore: confidence,
      aiModelVersion: AI_MODEL_VERSION,
      bbox: bestDetection?.bbox,
      imageWidth: image.naturalWidth || image.width,
      imageHeight: image.naturalHeight || image.height,
      alternativePredictions
    }
  } catch (error) {
    console.error('AI detection error:', error)
    return detectEwasteLite(imageSource)
  }
}

export async function detectEwasteLite(imageSource: string): Promise<AIDetectionResult> {
  try {
    const image = await loadImage(imageSource)
    const analysisCanvas = createSquareCanvas(image, 0.82)
    const ctx = analysisCanvas.getContext('2d')

    if (!ctx) {
      throw new Error('Canvas not supported')
    }

    const features = analyzeImageFeatures(
      ctx.getImageData(0, 0, CANVAS_SIZE, CANVAS_SIZE),
      CANVAS_SIZE,
      CANVAS_SIZE
    )

    const inferences = inferCategoryFromFeatures(features)

    if (inferences.length === 0) {
      return createFallbackResult()
    }

    const feedbackSignal = getAIFeedbackSignal()
    const calibrated = inferences
      .map((inference) => ({
        ...inference,
        confidence: clamp(inference.confidence + clamp(feedbackSignal.categoryBias[inference.category], -4, 8) * 3, 15, 90),
      }))
      .sort((a, b) => b.confidence - a.confidence)

    const [best, ...rest] = calibrated

    return {
      detectedObjectName: getCategoryLabel(best.category),
      detectedCategory: best.category,
      confidenceScore: clamp(Math.round(best.confidence), 48, 78),
      aiModelVersion: LITE_MODEL_VERSION,
      alternativePredictions: rest.map(inference => ({
        category: inference.category,
        confidence: clamp(Math.round(inference.confidence * 0.85), 12, 50)
      }))
    }
  } catch (error) {
    console.error('Lite detection error:', error)
    return createFallbackResult()
  }
}

export async function isAIModelAvailable(): Promise<boolean> {
  try {
    await loadModel()
    return true
  } catch {
    return false
  }
}

export function getModelStatus(): 'not-loaded' | 'loading' | 'loaded' | 'failed' {
  return modelStatus
}

export function preloadModel(): void {
  loadModel().catch(() => {
    // Silent fallback to lite detection.
  })
}
