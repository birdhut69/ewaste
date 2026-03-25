import type { CategoryId } from './types'

export interface AIFeedbackEntry {
  reportId: string
  isCorrect: boolean
  correctedCategory?: CategoryId
  predictedCategory?: CategoryId
  predictedObjectName?: string
  submittedAt: string
}

interface AIFeedbackSignal {
  categoryBias: Record<CategoryId, number>
  objectCorrection: Record<string, CategoryId>
}

const FEEDBACK_KEY = 'ewaste_ai_feedback'
const SIGNAL_CACHE_TTL_MS = 30000
let signalCache: { at: number; value: AIFeedbackSignal } | null = null

function readMap(): Record<string, AIFeedbackEntry> {
  try {
    const raw = localStorage.getItem(FEEDBACK_KEY)
    if (!raw) return {}
    return JSON.parse(raw) as Record<string, AIFeedbackEntry>
  } catch {
    return {}
  }
}

function writeMap(value: Record<string, AIFeedbackEntry>): void {
  try {
    localStorage.setItem(FEEDBACK_KEY, JSON.stringify(value))
  } catch {
    // Ignore persistence failure in private/incognito modes.
  }
}

function normalizeObjectName(value?: string): string {
  if (!value) return ''
  return value.toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim()
}

export function getAIFeedback(reportId: string): AIFeedbackEntry | null {
  const map = readMap()
  return map[reportId] || null
}

export function getAllAIFeedback(): Record<string, AIFeedbackEntry> {
  return readMap()
}

export function saveAIFeedback(entry: AIFeedbackEntry): void {
  const map = readMap()
  map[entry.reportId] = entry
  writeMap(map)
  signalCache = null
}

export function getAIFeedbackSignal(): AIFeedbackSignal {
  const now = Date.now()
  if (signalCache && now - signalCache.at < SIGNAL_CACHE_TTL_MS) {
    return signalCache.value
  }

  const entries = Object.values(readMap())
  const bias: Record<CategoryId, number> = {
    mobile: 0,
    computer: 0,
    monitor: 0,
    cable: 0,
    battery: 0,
    appliance: 0,
    other: 0,
  }

  const correctionVotes = new Map<string, Record<CategoryId, number>>()

  for (const entry of entries) {
    if (entry.isCorrect && entry.predictedCategory) {
      bias[entry.predictedCategory] += 1
    }

    if (!entry.isCorrect) {
      if (entry.correctedCategory) {
        bias[entry.correctedCategory] += 2
      }

      if (entry.predictedCategory && entry.correctedCategory && entry.predictedCategory !== entry.correctedCategory) {
        bias[entry.predictedCategory] -= 1
      }
    }

    const objectName = normalizeObjectName(entry.predictedObjectName)
    if (!objectName || !entry.correctedCategory) continue

    const votes = correctionVotes.get(objectName) || {
      mobile: 0,
      computer: 0,
      monitor: 0,
      cable: 0,
      battery: 0,
      appliance: 0,
      other: 0,
    }

    votes[entry.correctedCategory] += entry.isCorrect ? 1 : 2
    correctionVotes.set(objectName, votes)
  }

  const objectCorrection: Record<string, CategoryId> = {}
  for (const [objectName, votes] of correctionVotes.entries()) {
    const winner = (Object.entries(votes) as Array<[CategoryId, number]>)
      .sort((a, b) => b[1] - a[1])[0]

    if (winner && winner[1] >= 2) {
      objectCorrection[objectName] = winner[0]
    }
  }

  const signal: AIFeedbackSignal = {
    categoryBias: bias,
    objectCorrection,
  }

  signalCache = { at: now, value: signal }
  return signal
}
