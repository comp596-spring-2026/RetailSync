import { InferSchemaType, Schema, model } from 'mongoose';
import { tenantPlugin } from './plugins/tenantPlugin';

const googleSheetSourceSchema = new Schema(
  {
    sourceId: { type: String, required: true },
    name: { type: String, required: true },
    spreadsheetId: { type: String, required: true },
    sheetGid: { type: String, default: null },
    range: { type: String, required: true, default: 'Sheet1!A1:Z' },
    mapping: { type: Map, of: String, default: {} },
    active: { type: Boolean, default: false }
  },
  { _id: false }
);

const googleSharedSheetConfigSchema = new Schema(
  {
    spreadsheetId: { type: String, default: null },
    sheetName: { type: String, default: 'Sheet1' },
    headerRow: { type: Number, default: 1, min: 1 },
    columnsMap: { type: Map, of: String, default: {} },
    enabled: { type: Boolean, default: false },
    lastVerifiedAt: { type: Date, default: null },
    lastImportAt: { type: Date, default: null }
  },
  { _id: false }
);

const integrationSettingsSchema = new Schema(
  {
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true },
    ownerUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    googleSheets: {
      mode: { type: String, enum: ['service_account', 'oauth'], default: 'service_account' },
      serviceAccountEmail: { type: String, required: true },
      connected: { type: Boolean, default: false },
      connectedEmail: { type: String, default: null },
      sources: { type: [googleSheetSourceSchema], default: [] },
      sharedConfig: { type: googleSharedSheetConfigSchema, default: () => ({}) },
      updatedAt: { type: Date, default: Date.now }
    },
    quickbooks: {
      connected: { type: Boolean, default: false },
      environment: { type: String, enum: ['sandbox', 'production'], default: 'sandbox' },
      realmId: { type: String, default: null },
      companyName: { type: String, default: null },
      updatedAt: { type: Date, default: Date.now }
    }
  },
  { timestamps: true }
);

integrationSettingsSchema.index({ companyId: 1 }, { unique: true });
integrationSettingsSchema.plugin(tenantPlugin);

export type IntegrationSettingsDoc = InferSchemaType<typeof integrationSettingsSchema> & { _id: string };
export const IntegrationSettingsModel = model('IntegrationSettings', integrationSettingsSchema);
