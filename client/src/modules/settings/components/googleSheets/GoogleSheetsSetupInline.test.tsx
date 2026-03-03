import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GoogleSheetsSetupInline } from './GoogleSheetsSetupInline';
import type { GoogleSheetsSettings } from './GoogleSheetsIntegrationCard';
import { settingsApi } from '../../api';
import { posApi } from '../../../pos/api';

vi.mock('../../api', () => ({
  settingsApi: {
    getGoogleConnectUrl: vi.fn().mockResolvedValue({ data: { data: { url: 'https://accounts.google.com/o/oauth2/v2/auth' } } }),
    listOAuthSpreadsheets: vi.fn().mockResolvedValue({ data: { data: { files: [] } } }),
    getGoogleSheetsOAuthStatus: vi.fn().mockResolvedValue({ data: { data: { ok: true, reason: null, email: null, scopes: null, expiresInSec: null } } }),
    listSharedSpreadsheets: vi.fn().mockResolvedValue({ data: { data: { files: [] } } }),
    listTabsWithSpreadsheetId: vi.fn().mockResolvedValue({ data: { data: { tabs: [] } } }),
    stageGoogleSheetsChange: vi.fn().mockResolvedValue({ data: { data: { preview: { header: [], sampleRows: [], suggestions: [] } } } }),
    commitGoogleSheetsChange: vi.fn().mockResolvedValue({ data: { ok: true } }),
    setGoogleMode: vi.fn().mockResolvedValue({}),
    saveGoogleSource: vi.fn().mockResolvedValue({}),
    saveGoogleSheetsMapping: vi.fn().mockResolvedValue({}),
    configureSharedSheet: vi.fn().mockResolvedValue({}),
    verifySharedSheet: vi.fn().mockResolvedValue({ data: { ok: true } }),
  },
}));

vi.mock('../../../pos/api', () => ({
  posApi: {
    previewSheet: vi.fn().mockResolvedValue({
      data: { data: { header: [], sampleRows: [], suggestions: [] } },
    }),
    validateMapping: vi.fn().mockResolvedValue({
      data: { data: { valid: true, rowErrors: [] } },
    }),
    commitImport: vi.fn().mockResolvedValue({
      data: { data: { result: { imported: 0 } } },
    }),
  },
}));

const settings: GoogleSheetsSettings = {
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
      transformations: {},
      active: true,
    },
  ],
  sharedConfig: {
    spreadsheetId: 'shared-sheet-id',
    spreadsheetTitle: 'Shared POS',
    sheetName: 'CLEAN DATA',
    headerRow: 1,
    enabled: true,
    columnsMap: { Date: 'date' },
    lastImportAt: '2026-03-01T12:00:00.000Z',
  },
  sharedSheets: [
    {
      profileId: 'shared-1',
      name: 'POS DATA SHEET',
      spreadsheetId: 'shared-sheet-id',
      spreadsheetTitle: 'Shared POS',
      sheetName: 'CLEAN DATA',
      headerRow: 1,
      enabled: true,
      shareStatus: 'shared',
      lastImportAt: '2026-03-01T12:00:00.000Z',
      columnsMap: { Date: 'date' },
      isDefault: true,
    },
  ],
};

const clickUnselectedOauthToggle = async (user: ReturnType<typeof userEvent.setup>) => {
  const candidate = screen
    .getAllByRole('button', { name: /OAuth source/i })
    .find((button) => button.getAttribute('aria-pressed') === 'false');
  if (!candidate) {
    throw new Error('No unselected OAuth toggle found');
  }
  await user.click(candidate);
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('GoogleSheetsSetupInline', () => {
  it('shows current summary and updates staged source selection', async () => {
    const user = userEvent.setup();

    render(
      <GoogleSheetsSetupInline
        mode="service_account"
        settings={settings}
        canEdit
        isBusy={false}
        openWizardToken={1}
        onSaved={vi.fn()}
      />,
    );

    expect(screen.getByText(/Currently active: Shared/i)).toBeInTheDocument();

    await clickUnselectedOauthToggle(user);

    expect(screen.getByText(/Active source will switch from Shared to OAuth/i)).toBeInTheDocument();
  });

  it('disables continue with guidance when oauth is selected but not connected', async () => {
    const user = userEvent.setup();
    const disconnectedSettings: GoogleSheetsSettings = {
      ...settings,
      connected: false,
      sources: [],
      mode: 'service_account',
    };

    render(
      <GoogleSheetsSetupInline
        mode="service_account"
        settings={disconnectedSettings}
        canEdit
        isBusy={false}
        openWizardToken={1}
        onSaved={vi.fn()}
      />,
    );

    await clickUnselectedOauthToggle(user);

    expect(screen.getByText(/OAuth is not connected/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Connect Google/i })).toBeInTheDocument();
    const continueButtons = screen.getAllByRole('button', { name: /^Continue$/i });
    expect(continueButtons.some((button) => button.hasAttribute('disabled'))).toBe(true);
  });

  it('shows oauth connected but incomplete guidance and allows continue', async () => {
    const user = userEvent.setup();
    const incompleteOauthSettings: GoogleSheetsSettings = {
      ...settings,
      connected: true,
      connectedEmail: 'ops@retailsync.test',
      sources: [],
      mode: 'service_account',
    };

    render(
      <GoogleSheetsSetupInline
        mode="service_account"
        settings={incompleteOauthSettings}
        canEdit
        isBusy={false}
        openWizardToken={1}
        onSaved={vi.fn()}
      />,
    );

    await clickUnselectedOauthToggle(user);

    expect(screen.getByText(/Current status: OAuth connected \(setup incomplete\)/i)).toBeInTheDocument();
    expect(screen.getByText(/Connected account: ops@retailsync\.test/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Change OAuth account/i })).toBeInTheDocument();
    const continueButtons = screen.getAllByRole('button', { name: /^Continue$/i });
    expect(continueButtons.some((button) => !button.hasAttribute('disabled'))).toBe(true);
  });

  it('shows oauth account from oauth-status when connectedEmail is missing', async () => {
    const user = userEvent.setup();
    vi.mocked(settingsApi.getGoogleSheetsOAuthStatus).mockResolvedValueOnce({
      data: {
        data: {
          ok: true,
          reason: null,
          email: 'hopin4630@gmail.com',
          scopes: ['openid', 'https://www.googleapis.com/auth/spreadsheets'],
          expiresInSec: 3600,
        },
      },
    } as never);

    const incompleteOauthSettings: GoogleSheetsSettings = {
      ...settings,
      connected: true,
      connectedEmail: null,
      sources: [],
      mode: 'service_account',
    };

    render(
      <GoogleSheetsSetupInline
        mode="service_account"
        settings={incompleteOauthSettings}
        canEdit
        isBusy={false}
        openWizardToken={1}
        onSaved={vi.fn()}
      />,
    );

    await clickUnselectedOauthToggle(user);

    await waitFor(() => {
      expect(screen.getByText(/Connected account: hopin4630@gmail\.com/i)).toBeInTheDocument();
    });
  });

  it('updates debug button label based on staged source selection', async () => {
    const user = userEvent.setup();

    render(
      <GoogleSheetsSetupInline
        mode="service_account"
        settings={settings}
        canEdit
        isBusy={false}
        openWizardToken={1}
        onSaved={vi.fn()}
      />,
    );

    expect(screen.getAllByRole('button', { name: /Debug Shared/i }).length).toBeGreaterThan(0);

    await clickUnselectedOauthToggle(user);

    expect(screen.getAllByRole('button', { name: /Debug OAuth/i }).length).toBeGreaterThan(0);
  });

  it('renders source selector only in wizard step 1 and shows shared verify controls', () => {
    const sharedNotConfigured: GoogleSheetsSettings = {
      ...settings,
      sharedSheets: [
        {
          profileId: 'shared-1',
          name: 'POS DATA SHEET',
          spreadsheetId: null,
          spreadsheetTitle: 'Shared POS',
          sheetName: 'CLEAN DATA',
          headerRow: 1,
          enabled: false,
          shareStatus: 'not_shared',
          columnsMap: {},
          isDefault: true,
        },
      ],
    };

    render(
      <GoogleSheetsSetupInline
        mode="service_account"
        settings={sharedNotConfigured}
        canEdit
        isBusy={false}
        openWizardToken={1}
        onSaved={vi.fn()}
      />,
    );

    expect(screen.getAllByLabelText(/Google Sheets source switch/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/Shared source is not verified/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Verify access/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/Spreadsheet ID or URL/i)).toBeInTheDocument();
  });

  it('does not render source selector in wizard step 2', async () => {
    const user = userEvent.setup();

    render(
      <GoogleSheetsSetupInline
        mode="service_account"
        settings={settings}
        canEdit
        isBusy={false}
        openWizardToken={1}
        onSaved={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: /^Continue$/i }));

    const stepTwoHeading = screen.getByText(/Source: Shared/i);
    const stepTwoPanel = stepTwoHeading.closest('.MuiPaper-root') as HTMLElement | null;
    expect(stepTwoPanel).not.toBeNull();
    if (stepTwoPanel) {
      expect(within(stepTwoPanel).queryByLabelText(/Google Sheets source switch/i)).not.toBeInTheDocument();
    }
  });

  it('shows friendly not_shared message when verify endpoint returns not_shared error', async () => {
    const user = userEvent.setup();
    vi.mocked(settingsApi.verifySharedSheet).mockRejectedValueOnce({
      response: { data: { message: 'not_shared' } },
    });

    const disconnectedSharedSettings: GoogleSheetsSettings = {
      ...settings,
      sharedSheets: [
        {
          profileId: 'shared-1',
          name: 'POS DATA SHEET',
          spreadsheetId: null,
          spreadsheetTitle: 'Shared POS',
          sheetName: 'CLEAN DATA',
          headerRow: 1,
          enabled: false,
          shareStatus: 'not_shared',
          columnsMap: {},
          isDefault: true,
        },
      ],
    };

    render(
      <GoogleSheetsSetupInline
        mode="service_account"
        settings={disconnectedSharedSettings}
        canEdit
        isBusy={false}
        openWizardToken={1}
        onSaved={vi.fn()}
      />,
    );

    await user.type(
      screen.getByLabelText(/Spreadsheet ID or URL/i),
      'https://docs.google.com/spreadsheets/d/1pIY9TZVmfg__BxYqsEMZn71jj1N23enWl4uFLUTplFM/edit',
    );
    await user.click(screen.getByRole('button', { name: /Verify access/i }));

    expect(screen.getByText(/This sheet is not shared with svc@retailsync\.test/i)).toBeInTheDocument();
  });

  it('shows friendly not_shared message when verify returns connected false', async () => {
    const user = userEvent.setup();
    vi.mocked(settingsApi.verifySharedSheet).mockResolvedValueOnce({
      data: {
        data: {
          connected: false,
          shareStatus: 'not_shared',
        },
      },
    } as never);

    const disconnectedSharedSettings: GoogleSheetsSettings = {
      ...settings,
      sharedSheets: [
        {
          profileId: 'shared-1',
          name: 'POS DATA SHEET',
          spreadsheetId: null,
          spreadsheetTitle: 'Shared POS',
          sheetName: 'CLEAN DATA',
          headerRow: 1,
          enabled: false,
          shareStatus: 'not_shared',
          columnsMap: {},
          isDefault: true,
        },
      ],
    };

    render(
      <GoogleSheetsSetupInline
        mode="service_account"
        settings={disconnectedSharedSettings}
        canEdit
        isBusy={false}
        openWizardToken={1}
        onSaved={vi.fn()}
      />,
    );

    await user.type(
      screen.getByLabelText(/Spreadsheet ID or URL/i),
      '1pIY9TZVmfg__BxYqsEMZn71jj1N23enWl4uFLUTplFM',
    );
    await user.click(screen.getByRole('button', { name: /Verify access/i }));

    expect(screen.getByText(/This sheet is not shared with svc@retailsync\.test/i)).toBeInTheDocument();
  });

  it('shows friendly tab_not_found message when verify returns tab_not_found', async () => {
    const user = userEvent.setup();
    vi.mocked(settingsApi.verifySharedSheet).mockRejectedValueOnce({
      response: { data: { message: 'tab_not_found' } },
    });

    const disconnectedSharedSettings: GoogleSheetsSettings = {
      ...settings,
      sharedSheets: [
        {
          profileId: 'shared-1',
          name: 'POS DATA SHEET',
          spreadsheetId: null,
          spreadsheetTitle: 'Shared POS',
          sheetName: 'CLEAN DATA',
          headerRow: 1,
          enabled: false,
          shareStatus: 'unknown',
          columnsMap: {},
          isDefault: true,
        },
      ],
    };

    render(
      <GoogleSheetsSetupInline
        mode="service_account"
        settings={disconnectedSharedSettings}
        canEdit
        isBusy={false}
        openWizardToken={1}
        onSaved={vi.fn()}
      />,
    );

    await user.type(
      screen.getByLabelText(/Spreadsheet ID or URL/i),
      '1pIY9TZVmfg__BxYqsEMZn71jj1N23enWl4uFLUTplFM',
    );
    await user.click(screen.getByRole('button', { name: /Verify access/i }));

    expect(
      screen.getByText(/Selected tab was not found\. Pick a valid tab in the selected spreadsheet and try again\./i),
    ).toBeInTheDocument();
  });

  it('moves directly to step 2 after successful shared verify', async () => {
    const user = userEvent.setup();
    vi.mocked(settingsApi.verifySharedSheet).mockResolvedValueOnce({
      data: {
        data: {
          connected: true,
          shareStatus: 'shared',
        },
      },
    } as never);

    const disconnectedSharedSettings: GoogleSheetsSettings = {
      ...settings,
      sharedSheets: [
        {
          profileId: 'shared-1',
          name: 'POS DATA SHEET',
          spreadsheetId: null,
          spreadsheetTitle: 'Shared POS',
          sheetName: 'CLEAN DATA',
          headerRow: 1,
          enabled: false,
          shareStatus: 'not_shared',
          columnsMap: {},
          isDefault: true,
        },
      ],
    };

    render(
      <GoogleSheetsSetupInline
        mode="service_account"
        settings={disconnectedSharedSettings}
        canEdit
        isBusy={false}
        openWizardToken={1}
        onSaved={vi.fn()}
      />,
    );

    await user.type(
      screen.getByLabelText(/Spreadsheet ID or URL/i),
      '1pIY9TZVmfg__BxYqsEMZn71jj1N23enWl4uFLUTplFM',
    );
    await user.click(screen.getByRole('button', { name: /Verify access/i }));

    expect(screen.getByText(/Source: Shared/i)).toBeInTheDocument();
    expect(screen.queryByText(/Access verified\. Click Continue to choose tab and preview rows\./i)).not.toBeInTheDocument();
  });

  it('keeps continue disabled for shared when share status is unknown until verify succeeds', async () => {
    const user = userEvent.setup();
    vi.mocked(settingsApi.verifySharedSheet).mockResolvedValueOnce({
      data: {
        data: {
          connected: true,
          shareStatus: 'shared',
        },
      },
    } as never);

    const unknownSharedSettings: GoogleSheetsSettings = {
      ...settings,
      sharedSheets: [
        {
          profileId: 'shared-1',
          name: 'POS DATA SHEET',
          spreadsheetId: '1pIY9TZVmfg__BxYqsEMZn71jj1N23enWl4uFLUTplFM',
          spreadsheetTitle: 'Shared POS',
          sheetName: 'CLEAN DATA',
          headerRow: 1,
          enabled: true,
          shareStatus: 'unknown',
          columnsMap: {},
          isDefault: true,
        },
      ],
    };

    render(
      <GoogleSheetsSetupInline
        mode="service_account"
        settings={unknownSharedSettings}
        canEdit
        isBusy={false}
        openWizardToken={1}
        onSaved={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: /^Continue$/i })).toBeDisabled();

    const verifyButton = screen.getByRole('button', { name: /Verify access/i });
    expect(verifyButton).toBeEnabled();
    await user.click(verifyButton);

    await waitFor(() => {
      expect(screen.getByText(/Source: Shared/i)).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /^Continue$/i })).toBeDisabled();
  });

  it('resets step-1 source panel on close and reopen', async () => {
    const user = userEvent.setup();
    const disconnectedSettings: GoogleSheetsSettings = {
      ...settings,
      connected: false,
      sources: [],
      mode: 'service_account',
      sharedSheets: [
        {
          profileId: 'shared-1',
          name: 'POS DATA SHEET',
          spreadsheetId: null,
          spreadsheetTitle: 'Shared POS',
          sheetName: 'CLEAN DATA',
          headerRow: 1,
          enabled: false,
          shareStatus: 'unknown',
          columnsMap: {},
          isDefault: true,
        },
      ],
    };

    const { rerender } = render(
      <GoogleSheetsSetupInline
        mode="service_account"
        settings={disconnectedSettings}
        canEdit
        isBusy={false}
        openWizardToken={1}
        onSaved={vi.fn()}
      />,
    );

    await clickUnselectedOauthToggle(user);
    expect(screen.getByText(/OAuth is not connected\. Connect OAuth to continue\./i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Close setup wizard/i }));

    rerender(
      <GoogleSheetsSetupInline
        mode="service_account"
        settings={disconnectedSettings}
        canEdit
        isBusy={false}
        openWizardToken={2}
        onSaved={vi.fn()}
      />,
    );

    expect(screen.getByText(/Shared source is not verified\./i)).toBeInTheDocument();
    expect(screen.queryByText(/OAuth is not connected\. Connect OAuth to continue\./i)).not.toBeInTheDocument();
  });

  it('auto-selects first spreadsheet in step 2 when none is selected', async () => {
    vi.mocked(settingsApi.listOAuthSpreadsheets).mockResolvedValueOnce({
      data: {
        data: {
          files: [
            {
              id: 'sheet-abc',
              name: 'Sheets DEMO RetailSYNC',
              modifiedTime: null,
            },
          ],
        },
      },
    } as never);

    const emptyOauthSettings: GoogleSheetsSettings = {
      ...settings,
      mode: 'oauth',
      connected: true,
      sources: [],
    };

    render(
      <GoogleSheetsSetupInline
        mode="oauth"
        settings={emptyOauthSettings}
        canEdit
        isBusy={false}
        openWizardToken={1}
        openWizardStep={1}
        openWizardSource="oauth"
        onSaved={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(vi.mocked(settingsApi.listTabsWithSpreadsheetId)).toHaveBeenCalledWith(
        expect.objectContaining({ spreadsheetId: 'sheet-abc' }),
      );
    });
    expect(screen.getByRole('button', { name: /Sheets DEMO RetailSYNC/i })).toBeInTheDocument();
  });

  it('renders tabs when tabs payload uses sheetName instead of title', async () => {
    vi.mocked(settingsApi.listOAuthSpreadsheets).mockResolvedValueOnce({
      data: {
        data: {
          files: [{ id: 'sheet-abc', name: 'Sheet A', modifiedTime: null }],
        },
      },
    } as never);
    vi.mocked(settingsApi.listTabsWithSpreadsheetId).mockResolvedValueOnce({
      data: {
        data: {
          tabs: [{ sheetName: 'Responses', rowCount: 25, columnCount: 8 }],
        },
      },
    } as never);

    const emptyOauthSettings: GoogleSheetsSettings = {
      ...settings,
      mode: 'oauth',
      connected: true,
      sources: [],
    };

    render(
      <GoogleSheetsSetupInline
        mode="oauth"
        settings={emptyOauthSettings}
        canEdit
        isBusy={false}
        openWizardToken={1}
        openWizardStep={1}
        openWizardSource="oauth"
        onSaved={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getAllByText(/Responses/i).length).toBeGreaterThan(0);
    });
  });

  it('keeps tabs visible when clicking the already selected sheet', async () => {
    const user = userEvent.setup();
    vi.mocked(settingsApi.listOAuthSpreadsheets).mockResolvedValueOnce({
      data: {
        data: {
          files: [{ id: 'sheet-abc', name: 'Sheet A', modifiedTime: null }],
        },
      },
    } as never);
    vi.mocked(settingsApi.listTabsWithSpreadsheetId).mockResolvedValueOnce({
      data: {
        data: {
          tabs: [{ title: 'Responses', rowCount: 25, columnCount: 8 }],
        },
      },
    } as never);

    const emptyOauthSettings: GoogleSheetsSettings = {
      ...settings,
      mode: 'oauth',
      connected: true,
      sources: [],
    };

    render(
      <GoogleSheetsSetupInline
        mode="oauth"
        settings={emptyOauthSettings}
        canEdit
        isBusy={false}
        openWizardToken={1}
        openWizardStep={1}
        openWizardSource="oauth"
        onSaved={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText(/Responses/i)).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /Sheet A/i }));

    expect(screen.getAllByText(/Responses/i).length).toBeGreaterThan(0);
  });

  it('uses preview columns as headers when backend returns columns field', async () => {
    vi.mocked(settingsApi.listOAuthSpreadsheets).mockResolvedValueOnce({
      data: {
        data: {
          files: [{ id: 'sheet-abc', name: 'Sheet A', modifiedTime: null }],
        },
      },
    } as never);
    vi.mocked(settingsApi.listTabsWithSpreadsheetId).mockResolvedValueOnce({
      data: {
        data: {
          tabs: [{ title: 'Responses', rowCount: 25, columnCount: 8 }],
        },
      },
    } as never);
    vi.mocked(posApi.previewSheet).mockResolvedValueOnce({
      data: {
        data: {
          columns: ['DATE', 'HIGH TAX', 'LOW TAX'],
          sampleRows: [['2026-02-01', '5420.25', '780.75']],
          suggestions: [],
        },
      },
    } as never);

    const emptyOauthSettings: GoogleSheetsSettings = {
      ...settings,
      mode: 'oauth',
      connected: true,
      sources: [],
    };

    render(
      <GoogleSheetsSetupInline
        mode="oauth"
        settings={emptyOauthSettings}
        canEdit
        isBusy={false}
        openWizardToken={1}
        openWizardStep={1}
        openWizardSource="oauth"
        onSaved={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText(/Columns detected: 3/i)).toBeInTheDocument();
    });
    expect(screen.getByText('DATE')).toBeInTheDocument();
  });
});
