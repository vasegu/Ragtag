import { z } from 'zod';

export const CATEGORIES = [
  'Fly Tipping inside Hackney Housing Building', 'Other - Street Lighting', 'Vehicle Idling',
  'Tree Damage - General', 'Parking signs', 'Safety concern (traffic or pedestrian)',
  'Pedestrian Guard Rails', 'Fly Posting', 'Dog Poo/Fouling', 'Illegal Parking',
  'Excessive Litter', 'Electric Vehicle Charge Points', 'Abandoned Lime bike or scooter',
  'Fallen Tree', 'Highways Obstructions', 'Drug Paraphernalia / Needles', 'Play Area',
  'Abandoned push bike/bike frame', 'Drain Cover - Missing or Damaged', 'Abandoned Vehicles',
  'Blocked Gully', 'Overflowing Public Litter Bin', 'Bollards - Non Illuminated', 'Fly Tipping on Street',
] as const;

export const locationSchema = z.object({
  label: z.string().max(400), lat: z.number().min(-90).max(90), lon: z.number().min(-180).max(180),
  borough: z.string(), source: z.literal('OpenStreetMap / Nominatim'),
});
export type Location = z.infer<typeof locationSchema>;
export const placeSchema = z.object({ name: z.string(), type: z.string(), distance: z.number(), osmId: z.string() });
export const contextSchema = z.object({
  status: z.enum(['available','unavailable','location_needed']),
  places: z.array(placeSchema), fetchedAt: z.string(), source: z.string(),
  ownershipEvidence:z.array(z.object({reportId:z.string(),category:z.string(),reportedRecipient:z.string()})).default([]),
  collisions: z.literal('Not connected'),
});
export type Context = z.infer<typeof contextSchema>;
export const workOrderSchema = z.object({
  summary: z.string(),
  size: z.object({ band: z.enum(['small', 'medium', 'large', 'very large', 'unknown']), description: z.string(), quantity: z.string() }),
  trade: z.string(),
  crewSize: z.number().int().min(1).max(12),
  estimatedMinutes: z.object({ min: z.number(), max: z.number() }),
  tasks: z.array(z.object({ step: z.string(), detail: z.string(), who: z.string() })),
  materials: z.array(z.string()),
  equipment: z.array(z.string()),
  trafficManagement: z.string(),
  safety: z.array(z.string()),
  access: z.string(),
  deliveryMode: z.enum(['in-house', 'contractor', 'refer']),
  deliveryReason: z.string(),
  costRange: z.object({ low: z.number(), high: z.number(), basis: z.string() }),
  bundleKey: z.string(),
  afterPhotoRequired: z.boolean(),
  confirmations: z.array(z.string()),
});
export type WorkOrder = z.infer<typeof workOrderSchema>;
export const assessmentSchema = z.object({
  id: z.string(), createdAt: z.string(), outcome: z.enum(['accepted','review','referred','rejected']),
  category: z.string(), title: z.string(), councilDescription: z.string(),
  visibleEvidence: z.array(z.string()), reportedClaims: z.array(z.string()), missingEvidence: z.array(z.string()),
  extentDescription:z.string(),riskLocation:z.string(),
  resources:z.object({trade:z.string(),materials:z.array(z.string()),equipment:z.array(z.string()),actions:z.array(z.string())}),
  legalFlags:z.array(z.string()),
  residentDescription:z.string(),
  decisionTrace:z.array(z.object({stage:z.number(),question:z.string(),answer:z.string(),method:z.string(),status:z.enum(['pass','review','reject','refer','skipped']),confidence:z.number().nullable(),evidence:z.array(z.string()),alternative:z.string(),sources:z.array(z.string())})),
  address: z.string(), location: locationSchema.nullable(),
  severity: z.number().int().min(1).max(5).nullable(), policyLevel: z.string(),
  confidence: z.number().min(0).max(1), queue: z.string(), queueOrder: z.number(),
  responsibility: z.string(), reason: z.string(),
  validation: z.object({ relevance: z.number(), emergency: z.number() }),
  context: contextSchema,
  policyVersion: z.literal('0.3.0 · proposed'), policySources: z.array(z.string()),
  saved: z.boolean(), photoUrls: z.array(z.string()),
  workOrder: workOrderSchema.nullable().optional(),
});
export type Assessment = z.infer<typeof assessmentSchema>;

export const probabilitySchema = z.number().min(0).max(1);
export const decisionAnswerSchema = z.discriminatedUnion('type', [
  z.object({type:z.literal('predicate'),name:z.string(),probability:probabilitySchema}),
  z.object({type:z.literal('choice'),name:z.string(),choice:z.string(),confidence:probabilitySchema}),
  z.object({type:z.literal('score'),name:z.string(),score:z.number(),confidence:probabilitySchema,
    probabilities:z.array(z.object({value:z.number().int().min(0).max(4),probability:probabilitySchema}))}),
  z.object({type:z.literal('refusal'),name:z.string()}),
]);
export const decisionsSchema = z.object({answers:z.array(decisionAnswerSchema)});
export type DecisionAnswer = z.infer<typeof decisionAnswerSchema>;
export const descriptionSchema = z.object({title:z.string().max(120),councilDescription:z.string().max(1800),
  visibleEvidence:z.array(z.string()).max(8),reportedClaims:z.array(z.string()).max(8),missingEvidence:z.array(z.string()).max(8),
  extentDescription:z.string(),riskLocation:z.string(),resources:z.object({trade:z.string(),materials:z.array(z.string()).max(6),equipment:z.array(z.string()).max(6),actions:z.array(z.string()).max(6)}),legalFlags:z.array(z.string()).max(6)});
