import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  GoogleSheetsIntegrationCard,
  type GoogleSheetsSettings,
} from './GoogleSheetsIntegrationCard';

vi.mock('./GoogleSheetsSetupInline', () => ({
  GoogleSheetsSetupInline: () => <div>setup-inline</div>,
}));

const baseSettings: GoogleSheetsSettings = {
  mode: 'service_account',
  serviceAccountEmail: 'svc@retailsync.test',
  connected: true,
  connectedEmail: 'ops@retailsync.test',
  sources: [
    {
      sourceId: 'oauth-1',
      name: 'POS DATA SHEET',
      spreadsheetTitle: 'OAuth POS',
      spreadsheetId: 'oauth-sheet-id',
      sheetGid: null,
      range: 'Daily!A1:Z',
      mapping: { Date: 'date' },
      mappingConfirmedAt: null,
      mappingHash: null,
      active: true,
    },
  ],
  sharedSheets: [
    {
      profileId: 'shared-1',
      name: 'POS DATA SHEET',
      spreadsheetId: 'shared-sheet-id',
      spreadsheetTitle: 'Shared POS',
      sheetName: 'Daily',
      headerRow: 1,
      enabled: true,
      columnsMap: { Date: 'date' },
      mappingConfirmedAt: null,
      mappingHash: null,
      isDefault: true,
    },
  ],
};

const buildSettings = () => structuredClone(baseSettings);

afterEach(() => {
  cleanup();
});

describe('GoogleSheetsIntegrationCard', () => {
  it('shows plain text summary and setup-required expanded state when nothing is configured', () => {
    const emptySettings: GoogleSheetsSettings = {
      ...buildSettings(),
      connected: false,
      mode: 'service_account',
      sources: [],
      sharedSheets: [
        {
          profileId: 'shared-1',
          name: 'POS DATA SHEET',
          spreadsheetId: null,
          spreadsheetTitle: 'Shared POS',
          sheetName: 'Daily',
          headerRow: 1,
          enabled: false,
          columnsMap: {},
          isDefault: true,
          shareStatus: 'not_shared',
        },
      ],
    };

    render(
      <GoogleSheetsIntegrationCard
        settings={emptySettings}
        canEdit
        isBusy={false}
        onSetActiveMode={vi.fn()}
        onReset={vi.fn()}
        onVerifyShared={vi.fn()}
        onSaveShared={vi.fn()}
      />,
    );

    expect(screen.getByText(/No sheets configured\. Set up a sheet to enable syncing\./i)).toBeInTheDocument();
    expect(screen.getByText(/Status: Not configured/i)).toBeInTheDocument();
    const infoHeading = screen.getByText(/Sheet information/i);
    const expandedCell = infoHeading.closest('td') as HTMLElement | null;
    expect(expandedCell).not.toBeNull();
    if (expandedCell) {
      expect(within(expandedCell).getAllByRole('button', { name: /Setup sheet/i })).toHaveLength(1);
      expect(within(expandedCell).queryByRole('button', { name: /Debug/i })).not.toBeInTheDocument();
      expect(within(expandedCell).queryByRole('button', { name: /Sync settings/i })).not.toBeInTheDocument();
      expect(within(expandedCell).queryByRole('button', { name: /Remove connector setup/i })).not.toBeInTheDocument();
    }
    expect(screen.queryByLabelText(/Google Sheets source switch/i)).not.toBeInTheDocument();
    expect(document.querySelectorAll('.MuiChip-root').length).toBe(0);
  });

  it('shows ready summary and ready-state actions when active source is ready', () => {
    const fullMapping = {
      Date: 'date',
      'HIGH TAX': 'highTax',
      'LOW TAX': 'lowTax',
      'SALE TAX': 'saleTax',
      GAS: 'gas',
      LOTTERY: 'lottery',
      'CREDIT CARD': 'creditCard',
      'LOTTERY PAYOUT': 'lotteryPayout',
      'CASH EXPENSES': 'cashExpenses',
    };
    const readySettings: GoogleSheetsSettings = {
      ...buildSettings(),
      sharedSheets: [
        {
          ...buildSettings().sharedSheets![0],
          columnsMap: fullMapping,
          mappingConfirmedAt: '2026-03-02T07:08:46.000Z',
          mappingHash: JSON.stringify(
            Object.entries(fullMapping).sort(([left], [right]) => left.localeCompare(right)),
          ),
        },
      ],
    };

    render(
      <GoogleSheetsIntegrationCard
        settings={readySettings}
        canEdit
        isBusy={false}
        onSetActiveMode={vi.fn()}
        onReset={vi.fn()}
        onVerifyShared={vi.fn()}
        onSaveShared={vi.fn()}
      />,
    );

    expect(screen.getByText(/1 connector ready • Active: Shared/i)).toBeInTheDocument();
    expect(screen.getByText(/Status: Sync enabled/i)).toBeInTheDocument();
    const infoHeading = screen.getByText(/Sheet information/i);
    const expandedCell = infoHeading.closest('td') as HTMLElement | null;
    expect(expandedCell).not.toBeNull();
    if (expandedCell) {
      expect(within(expandedCell).getByRole('button', { name: /^Sync now$/i })).toBeInTheDocument();
      expect(within(expandedCell).getByRole('button', { name: /^View mapping$/i })).toBeInTheDocument();
      expect(within(expandedCell).getByRole('button', { name: /^Change sheet$/i })).toBeInTheDocument();
      expect(within(expandedCell).getByRole('button', { name: /Remove connector setup/i })).toBeInTheDocument();
    }
    expect(screen.getByRole('columnheader', { name: /Connector/i })).toBeInTheDocument();
  });

  it('shows fix setup CTA when backend active source is incomplete', () => {
    const pausedSettings: GoogleSheetsSettings = {
      ...buildSettings(),
      mode: 'oauth',
      connected: true,
      sources: [
        {
          sourceId: 'oauth-1',
          name: 'POS DATA SHEET',
          spreadsheetTitle: 'OAuth POS',
          spreadsheetId: 'oauth-sheet-id',
          sheetGid: null,
          range: 'Daily!A1:Z',
          mapping: {},
          active: true,
        },
      ],
      sharedSheets: [],
    };

    render(
      <GoogleSheetsIntegrationCard
        settings={pausedSettings}
        canEdit
        isBusy={false}
        onSetActiveMode={vi.fn()}
        onReset={vi.fn()}
        onVerifyShared={vi.fn()}
        onSaveShared={vi.fn()}
      />,
    );

    expect(screen.getAllByRole('button', { name: /Fix setup/i }).length).toBeGreaterThan(0);
  });
});
