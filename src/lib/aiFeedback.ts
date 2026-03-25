import type { CategoryId } from './types'

export interface AIFeedbackEntry {
  reportId: string
  isCorrect: boolean
  correctedCategory?: CategoryId
  submittedAt: string
}

const FEEDBACK_KEY = 'ewaste_ai_feedback'

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
}
