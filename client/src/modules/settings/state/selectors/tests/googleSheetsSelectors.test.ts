import { describe, expect, it } from 'vitest';
import type { IntegrationSettingsCanonical } from '../../../types/googleSheets';
import {
  computeMappingHash,
  selectActionAvailability,
  selectActiveConnector,
  selectMappingReadiness,
  selectMappingSummary,
  selectSheetInfoDisplay,
} from '../googleSheetsSelectors';

const makeState = (settings: IntegrationSettingsCanonical) =>
  ({ settings: { settings } }) as unknown as Parameters<typeof selectMappingReadiness>[0];

const baseSettings: IntegrationSettingsCanonical = {
  id: 'settings_1',
  companyId: 'company_1',
  ownerUserId: 'owner_1',
  googleSheets: {
    activeIntegration: 'shared',
    oauth: {
      enabled: false,
      connectionStatus: 'not_connected',
      activeSourceId: null,
      activeConnectorKey: 'pos_daily',
      sources: [],
      lastImportAt: null,
    },
    shared: {
      enabled: true,
      activeProfileId: 'profile_1',
      activeConnectorKey: 'pos_daily',
      profiles: [
        {
          id: 'profile_1',
          name: 'POS DATA SHEET',
          connectors: [
            {
              key: 'pos_daily',
              label: 'POS Daily Summary',
              spreadsheetId: 'sheet_1',
              spreadsheetTitle: 'Accounting 4630 HOP In',
              sheetName: 'Responses',
              headerRow: 1,
              mapping: {
                DATE: 'date',
                'HIGH TAX': 'highTax',
                'LOW TAX': 'lowTax',
                'SALE TAX': 'saleTax',
                GAS: 'gas',
                LOTTERY: 'lottery',
                'CREDIT CARD': 'creditCard',
                'LOTTERY PAYOUT': 'lotteryPayout',
                'CASH EXPENSES': 'cashExpenses',
              },
              mappingConfirmedAt: null,
              mappingHash: null,
            },
          ],
        },
      ],
      lastImportAt: null,
      lastScheduledSyncAt: null,
    },
    updatedAt: null,
  },
  quickbooks: {
    connected: false,
    environment: 'sandbox',
    realmId: null,
    companyName: null,
  },
  lastImportSource: null,
  lastImportAt: null,
};

describe('googleSheetsSelectors', () => {
  it('shared configured but not confirmed => needs_review and sync disabled', () => {
    const state = makeState(baseSettings);
    expect(selectMappingReadiness(state)).toBe('needs_review');
    const actions = selectActionAvailability(state);
    expect(actions.canSyncNow).toBe(false);
    expect(actions.canReviewMapping).toBe(true);
  });

  it('shared configured + confirmed => ready and sync enabled', () => {
    const state1 = makeState(baseSettings);
    const summary = selectMappingSummary(state1);
    expect(summary.isValid).toBe(true);

    const connector = baseSettings.googleSheets.shared.profiles[0].connectors[0];
    const mappingHash = computeMappingHash(
      connector.mapping,
      connector.spreadsheetId,
      connector.sheetName,
      Number(connector.headerRow ?? 1),
    );

    const next: IntegrationSettingsCanonical = {
      ...baseSettings,
      googleSheets: {
        ...baseSettings.googleSheets,
        shared: {
          ...baseSettings.googleSheets.shared,
          profiles: [
            {
              ...baseSettings.googleSheets.shared.profiles[0],
              connectors: [
                {
                  ...connector,
                  mappingConfirmedAt: '2026-03-02T00:00:00.000Z',
                  mappingHash,
                },
              ],
            },
          ],
        },
      },
    };

    const state2 = makeState(next);
    expect(selectMappingReadiness(state2)).toBe('ready');
    expect(selectActionAvailability(state2).canSyncNow).toBe(true);
  });

  it('missing required mappings => invalid', () => {
    const next: IntegrationSettingsCanonical = {
      ...baseSettings,
      googleSheets: {
        ...baseSettings.googleSheets,
        shared: {
          ...baseSettings.googleSheets.shared,
          profiles: [
            {
              ...baseSettings.googleSheets.shared.profiles[0],
              connectors: [
                {
                  ...baseSettings.googleSheets.shared.profiles[0].connectors[0],
                  mapping: {
                    DATE: 'date',
                  },
                },
              ],
            },
          ],
        },
      },
    };

    const state = makeState(next);
    expect(selectMappingReadiness(state)).toBe('invalid');
    expect(selectMappingSummary(state).missingRequiredCount).toBeGreaterThan(0);
  });

  it('missing spreadsheetTitle uses Unknown spreadsheet fallback', () => {
    const next: IntegrationSettingsCanonical = {
      ...baseSettings,
      googleSheets: {
        ...baseSettings.googleSheets,
        shared: {
          ...baseSettings.googleSheets.shared,
          profiles: [
            {
              ...baseSettings.googleSheets.shared.profiles[0],
              connectors: [
                {
                  ...baseSettings.googleSheets.shared.profiles[0].connectors[0],
                  spreadsheetTitle: null,
                },
              ],
            },
          ],
        },
      },
    };
    const display = selectSheetInfoDisplay(makeState(next));
    expect(display.spreadsheetTitle).toBe('Unknown spreadsheet');
    expect(display.url).toBe('https://docs.google.com/spreadsheets/d/sheet_1/edit');
    expect(display.ownerLabel).toBe('POS DATA SHEET');
    expect(display.connectorLabel).toBe('POS Daily Summary');
  });

  it('mapping hash mismatch keeps readiness as needs_review', () => {
    const next: IntegrationSettingsCanonical = {
      ...baseSettings,
      googleSheets: {
        ...baseSettings.googleSheets,
        shared: {
          ...baseSettings.googleSheets.shared,
          profiles: [
            {
              ...baseSettings.googleSheets.shared.profiles[0],
              connectors: [
                {
                  ...baseSettings.googleSheets.shared.profiles[0].connectors[0],
                  mappingConfirmedAt: '2026-03-02T00:00:00.000Z',
                  mappingHash: 'wrong-hash',
                },
              ],
            },
          ],
        },
      },
    };

    expect(selectMappingReadiness(makeState(next))).toBe('needs_review');
  });

  it('returns not_configured when active connector key does not exist', () => {
    const next: IntegrationSettingsCanonical = {
      ...baseSettings,
      googleSheets: {
        ...baseSettings.googleSheets,
        shared: {
          ...baseSettings.googleSheets.shared,
          activeConnectorKey: 'missing_connector',
        },
      },
    };

    const state = makeState(next);
    expect(selectActiveConnector(state)).toBeNull();
    expect(selectMappingReadiness(state)).toBe('not_configured');
  });
});
