import { z } from 'zod'
import type { CategoryId, UserRole } from './types'
import { EWASTE_CATEGORIES } from './types'

export const UserRoleSchema = z.union([
  z.literal('citizen'),
  z.literal('pmc'),
  z.literal('driver')
]).transform(v => v as UserRole)

export const PhoneSchema = z
  .string()
  .regex(/^\d{10}$/, 'Phone number must be exactly 10 digits')

export const OtpSchema = z
  .string()
  .regex(/^\d{6}$/, 'OTP must be exactly 6 digits')

export const PasswordSchema = z
  .string()
  .min(6, 'Password must be at least 6 characters')
  .max(72, 'Password is too long')

export const EmailSchema = z.string().email('Invalid email address').max(254)

export const NotesSchema = z.preprocess(
  v => {
    if (typeof v !== 'string') return v
    const trimmed = v.trim()
    return trimmed === '' ? undefined : trimmed
  },
  z.string().max(1000, 'Notes must be at most 1000 characters').optional()
)

export const CategoryIdSchema = z
  .string()
  .refine(
    (v): v is CategoryId => EWASTE_CATEGORIES.some(c => c.id === v),
    'Invalid e-waste category'
  )

export const CoordinatesSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180)
})

export const CreateReportSchema = z.object({
  citizenId: z.string().min(1),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  category: CategoryIdSchema,
  photoFileId: z.string().optional(),
  notes: NotesSchema,
  detectedObjectName: z.string().max(128).optional(),
  detectedCategory: z.string().max(32).optional(),
  confidenceScore: z.number().int().min(0).max(100).optional(),
  aiModelVersion: z.string().max(64).optional(),
  userOverrideCategory: z.boolean().optional()
})

export function parseOrThrow<T>(schema: z.ZodSchema<T>, input: unknown, label?: string): T {
  const result = schema.safeParse(input)
  if (!result.success) {
    const message = result.error.issues.map(i => i.message).join('; ')
    throw new Error(`${label ? `${label}: ` : ''}${message}`)
  }
  return result.data
}

