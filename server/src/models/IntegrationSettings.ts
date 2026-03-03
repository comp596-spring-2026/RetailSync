import { InferSchemaType, Schema, Types, model } from 'mongoose';
import { tenantPlugin } from './plugins/tenantPlugin';

const debugResultSchema = new Schema(
  {
    ok: { type: Boolean, required: true },
    integrationType: {
      type: String,
      enum: ['oauth', 'shared'],
      required: true
    },
    connectorKey: { type: String, default: null },
    checkedAt: { type: String, required: true },
    auth: {
      ok: { type: Boolean, required: true },
      details: { type: String, default: null },
      scopes: { type: [String], default: undefined },
      expiresInSec: { type: Number, default: null }
    },
    sheet: {
      ok: { type: Boolean, required: true },
      spreadsheetId: { type: String, default: null },
      sheetName: { type: String, default: null },
      details: { type: String, default: null }
    },
    header: {
      ok: { type: Boolean, required: true },
      headerRow: { type: Number, default: null },
      columns: { type: [String], default: undefined }
    },
    mapping: {
      ok: { type: Boolean, required: true },
      details: { type: String, default: null },
      missingTargets: { type: [String], default: undefined },
      duplicateTargets: { type: [String], default: undefined }
    },
    sample: {
      ok: { type: Boolean, required: true },
      rowCount: { type: Number, default: null },
      details: { type: String, default: null }
    }
  },
  { _id: false }
);

const connectorScheduleSchema = new Schema(
  {
    enabled: { type: Boolean, default: false },
    frequency: {
      type: String,
      enum: ['hourly', 'daily', 'weekly', 'manual'],
      default: 'manual'
    },
    timeOfDay: { type: String, default: null },
    dayOfWeek: { type: Number, min: 0, max: 6, default: null }
  },
  { _id: false }
);

const connectorSchema = new Schema(
  {
    key: { type: String, required: true },
    label: { type: String, required: true },
    enabled: { type: Boolean, default: true },
    spreadsheetId: { type: String, required: true },
    spreadsheetTitle: { type: String, default: null },
    sheetName: { type: String, required: true },
    headerRow: { type: Number, min: 1, default: 1 },
    mapping: { type: Map, of: String, default: {} },
    transformations: { type: Map, of: Schema.Types.Mixed, default: {} },
    mappingConfirmedAt: { type: Date, default: null },
    mappingHash: { type: String, default: null },
    schedule: { type: connectorScheduleSchema, default: undefined },
    lastDebugResult: { type: debugResultSchema, default: undefined },
    lastImportAt: { type: Date, default: null }
  },
  { _id: true, timestamps: true }
);

const oauthSourceSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    connectors: { type: [connectorSchema], default: [] },
    lastDebugResult: { type: debugResultSchema, default: undefined }
  },
  { _id: true, timestamps: true }
);

const sharedProfileSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    connectors: { type: [connectorSchema], default: [] },
    lastDebugResult: { type: debugResultSchema, default: undefined }
  },
  { _id: true, timestamps: true }
);

const integrationSettingsSchema = new Schema(
  {
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true },
    ownerUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    googleSheets: {
      oauth: {
        enabled: { type: Boolean, default: false },
        connectionStatus: {
          type: String,
          enum: ['connected', 'error', 'not_connected'],
          default: 'not_connected'
        },
        sources: { type: [oauthSourceSchema], default: [] },
        activeSourceId: { type: Schema.Types.ObjectId, default: null },
        activeConnectorKey: { type: String, default: null },
        lastDebugResult: { type: debugResultSchema, default: undefined },
        lastImportAt: { type: Date, default: null }
      },
      shared: {
        enabled: { type: Boolean, default: false },
        profiles: { type: [sharedProfileSchema], default: [] },
        activeProfileId: { type: Schema.Types.ObjectId, default: null },
        activeConnectorKey: { type: String, default: null },
        lastDebugResult: { type: debugResultSchema, default: undefined },
        lastScheduledSyncAt: { type: Date, default: null },
        lastImportAt: { type: Date, default: null }
      },
      activeIntegration: {
        type: String,
        enum: ['oauth', 'shared', null],
        default: null
      },
      updatedAt: { type: Date, default: Date.now }
    },
    quickbooks: {
      connected: { type: Boolean, default: false },
      environment: { type: String, enum: ['sandbox', 'production'], default: 'sandbox' },
      realmId: { type: String, default: null },
      companyName: { type: String, default: null },
      updatedAt: { type: Date, default: Date.now }
    },
    lastImportSource: { type: String, enum: ['file', 'google_sheets', null], default: null },
    lastImportAt: { type: Date, default: null }
  },
  { timestamps: true }
);

integrationSettingsSchema.index({ companyId: 1 }, { unique: true });
integrationSettingsSchema.plugin(tenantPlugin);

export type IntegrationSettingsDoc = InferSchemaType<typeof integrationSettingsSchema> & {
  _id: string;
  googleSheets: {
    oauth: {
      activeSourceId?: Types.ObjectId | null;
    };
    shared: {
      activeProfileId?: Types.ObjectId | null;
    };
  };
};

export const IntegrationSettingsModel = model('IntegrationSettings', integrationSettingsSchema);
