import { z } from 'zod';
import { moduleKeys } from './modules';
import { permissionSetSchema, permissionsSchema } from './permissions';

export const emailSchema = z.string().trim().toLowerCase().email();

export const companyCreateSchema = z.object({
  name: z.string().trim().min(2),
  businessType: z.string().trim().min(2),
  address: z.string().trim().min(3),
  phone: z.string().trim().min(7),
  email: emailSchema,
  timezone: z.string().trim().min(2),
  currency: z.string().trim().min(2)
});

export const companyJoinSchema = z.object({
  companyCode: z.string().trim().regex(/^RS-[A-Z0-9]{6}$/),
  inviteCode: z.string().trim().min(6),
  email: emailSchema
});

export const roleSchema = z.object({
  name: z.string().trim().min(2),
  isSystem: z.boolean().default(false),
  permissions: permissionsSchema
});

export const roleCreateSchema = z.object({
  name: z.string().trim().min(2),
  permissions: permissionsSchema
});

export const inviteCreateSchema = z.object({
  email: emailSchema,
  roleId: z.string().trim().min(1),
  expiresInDays: z.number().int().min(1).max(30).default(7)
});

export const assignRoleSchema = z.object({
  roleId: z.string().trim().min(1)
});

export const posDailySummarySchema = z.object({
  date: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/),
  day: z.string().trim().min(2),
  highTax: z.number(),
  lowTax: z.number(),
  saleTax: z.number(),
  totalSales: z.number(),
  gas: z.number(),
  lottery: z.number(),
  creditCard: z.number(),
  lotteryPayout: z.number(),
  clTotal: z.number(),
  cash: z.number(),
  cashPayout: z.number(),
  cashExpenses: z.number(),
  notes: z.string().default('')
});

export const posDailyQuerySchema = z.object({
  start: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/),
  end: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/)
});

export const monthlySummaryQuerySchema = z.object({
  month: z.string().trim().regex(/^\d{4}-\d{2}$/)
});

export const itemCreateSchema = z.object({
  upc: z.string().trim().min(1),
  modifier: z.string().trim().default(''),
  description: z.string().trim().min(1),
  department: z.string().trim().min(1),
  price: z.number().min(0),
  sku: z.string().trim().optional(),
  defaultLocationCode: z.string().trim().optional()
});

export const itemUpdateSchema = itemCreateSchema.partial().refine((value) => Object.keys(value).length > 0, {
  message: 'At least one field is required'
});

export const locationTypeSchema = z.enum(['shelf', 'fridge', 'freezer', 'backroom']);

export const locationCreateSchema = z.object({
  code: z.string().trim().min(1),
  type: locationTypeSchema,
  label: z.string().trim().min(1)
});

export const locationUpdateSchema = locationCreateSchema.partial().refine((value) => Object.keys(value).length > 0, {
  message: 'At least one field is required'
});

export const inventoryMoveSchema = z.object({
  itemId: z.string().trim().min(1),
  fromLocationCode: z.string().trim().min(1),
  toLocationCode: z.string().trim().min(1),
  qty: z.number().positive(),
  notes: z.string().trim().optional()
});

export const barcodeSearchSchema = z.object({
  barcode: z.string().trim().min(1)
});

export const modulePermissionInputSchema = z.record(z.enum(moduleKeys), permissionSetSchema);

export type CompanyCreateInput = z.infer<typeof companyCreateSchema>;
export type CompanyJoinInput = z.infer<typeof companyJoinSchema>;
export type RoleInput = z.infer<typeof roleSchema>;
export type RoleCreateInput = z.infer<typeof roleCreateSchema>;
export type InviteCreateInput = z.infer<typeof inviteCreateSchema>;
export type AssignRoleInput = z.infer<typeof assignRoleSchema>;
export type PosDailySummaryInput = z.infer<typeof posDailySummarySchema>;
export type PosDailyQueryInput = z.infer<typeof posDailyQuerySchema>;
export type MonthlySummaryQueryInput = z.infer<typeof monthlySummaryQuerySchema>;
export type ItemCreateInput = z.infer<typeof itemCreateSchema>;
export type ItemUpdateInput = z.infer<typeof itemUpdateSchema>;
export type LocationCreateInput = z.infer<typeof locationCreateSchema>;
export type LocationUpdateInput = z.infer<typeof locationUpdateSchema>;
export type InventoryMoveInput = z.infer<typeof inventoryMoveSchema>;
