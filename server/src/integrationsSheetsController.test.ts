import type { Request, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const findOneAndUpdateMock = vi.fn();
const getMock = vi.fn();

vi.mock('./models/IntegrationSettings', () => ({
  IntegrationSettingsModel: {
    findOneAndUpdate: (...args: unknown[]) => findOneAndUpdateMock(...args)
  }
}));

vi.mock('./integrations/google/sheets.client', () => ({
  getSheetsClientForCompany: async () => ({
    spreadsheets: {
      get: (...args: unknown[]) => getMock(...args),
      values: {
        get: (...args: unknown[]) => getMock(...args)
      }
    }
  })
}));

const createResponse = () => {
  const status = vi.fn();
  const json = vi.fn();
  const res = {
    status: (code: number) => {
      status(code);
      return res;
    },
    json: (payload: unknown) => {
      json(payload);
      return res;
    }
  } as unknown as Response;
  return { res, status, json };
};

const baseSettings = {
  googleSheets: {
    sharedConfig: {
      spreadsheetId: 'sheet-1',
      sheetName: 'Sheet1'
    },
    updatedAt: new Date()
  },
  save: vi.fn().mockResolvedValue(undefined)
};

describe('integrationsSheetsController', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findOneAndUpdateMock.mockResolvedValue(baseSettings);
  });

  it('lists spreadsheet tabs', async () => {
    const { listSpreadsheetTabs } = await import('./controllers/integrationsSheetsController');
    getMock.mockResolvedValueOnce({
      data: {
        spreadsheetId: 'sheet-1',
        properties: { title: 'RetailSync Sheet' },
        sheets: [{ properties: { title: 'Sheet1', sheetId: 1, index: 0, gridProperties: { rowCount: 10, columnCount: 5 } } }]
      }
    });
    const { res, status, json } = createResponse();
    const req = { user: { companyId: 'company-1', id: 'user-1' } } as unknown as Request;

    await listSpreadsheetTabs(req, res);

    expect(status).toHaveBeenCalledWith(200);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'ok',
        data: expect.objectContaining({
          spreadsheetId: 'sheet-1',
          tabs: expect.any(Array)
        })
      })
    );
  });

  it('verifies shared sheet and sets connected status', async () => {
    const { verifySharedSheetsConfig } = await import('./controllers/integrationsSheetsController');
    getMock
      .mockResolvedValueOnce({
        data: {
          properties: { title: 'RetailSync Shared Sheet' },
          sheets: [{ properties: { sheetId: 1, title: 'Sheet1' } }]
        }
      })
      .mockResolvedValueOnce({ data: { values: [['header']] } });
    const { res, status, json } = createResponse();
    const req = { user: { companyId: 'company-1', id: 'user-1' } } as unknown as Request;

    await verifySharedSheetsConfig(req, res);

    expect(status).toHaveBeenCalledWith(200);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'ok',
        data: expect.objectContaining({
          connected: true
        })
      })
    );
  });

  it('falls back to first available tab when configured sheetName is invalid', async () => {
    const { verifySharedSheetsConfig } = await import('./controllers/integrationsSheetsController');
    findOneAndUpdateMock.mockResolvedValue({
      googleSheets: {
        sharedConfig: {
          spreadsheetId: 'sheet-1',
          sheetName: 'Sheet1'
        },
        sharedSheets: [
          {
            profileId: 'profile-1',
            name: 'POS DATA SHEET',
            spreadsheetId: 'sheet-1',
            sheetName: 'Sheet1',
            enabled: true,
            isDefault: true
          }
        ],
        updatedAt: new Date()
      },
      save: vi.fn().mockResolvedValue(undefined)
    });
    getMock
      .mockResolvedValueOnce({
        data: {
          properties: { title: 'RetailSync Shared Sheet' },
          sheets: [{ properties: { sheetId: 1, title: 'CLEAN DATA' } }]
        }
      })
      .mockResolvedValueOnce({ data: { values: [['header']] } });

    const { res, status, json } = createResponse();
    const req = { user: { companyId: 'company-1', id: 'user-1' } } as unknown as Request;

    await verifySharedSheetsConfig(req, res);

    expect(status).toHaveBeenCalledWith(200);
    expect(getMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        spreadsheetId: 'sheet-1',
        range: 'CLEAN DATA!A1:Z6'
      })
    );
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'ok',
        data: expect.objectContaining({
          connected: true,
          sheetName: 'CLEAN DATA'
        })
      })
    );
  });

  it('verifies shared sheet using sharedConfig spreadsheetId fallback when shared profile id is missing', async () => {
    const { verifySharedSheetsConfig } = await import('./controllers/integrationsSheetsController');
    findOneAndUpdateMock.mockResolvedValue({
      googleSheets: {
        sharedConfig: {
          spreadsheetId: 'sheet-1',
          sheetName: 'Sheet1'
        },
        sharedSheets: [
          {
            profileId: 'profile-1',
            name: 'POS DATA SHEET',
            spreadsheetId: null,
            sheetName: 'Sheet1',
            enabled: true,
            isDefault: true
          }
        ],
        updatedAt: new Date()
      },
      save: vi.fn().mockResolvedValue(undefined)
    });
    getMock
      .mockResolvedValueOnce({
        data: {
          properties: { title: 'RetailSync Shared Sheet' },
          sheets: [{ properties: { sheetId: 1, title: 'Sheet1' } }]
        }
      })
      .mockResolvedValueOnce({ data: { values: [['header']] } });

    const { res, status, json } = createResponse();
    const req = { user: { companyId: 'company-1', id: 'user-1' } } as unknown as Request;

    await verifySharedSheetsConfig(req, res);

    expect(status).toHaveBeenCalledWith(200);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'ok',
        data: expect.objectContaining({
          connected: true
        })
      })
    );
  });

  it('returns not_shared when service account has no permission', async () => {
    const { verifySharedSheetsConfig } = await import('./controllers/integrationsSheetsController');
    findOneAndUpdateMock.mockResolvedValue({
      googleSheets: {
        sharedConfig: {
          spreadsheetId: 'sheet-1',
          sheetName: 'Sheet1'
        },
        sharedSheets: [
          {
            profileId: 'profile-1',
            name: 'POS DATA SHEET',
            spreadsheetId: 'sheet-1',
            sheetName: 'Sheet1',
            enabled: true,
            isDefault: true
          }
        ],
        updatedAt: new Date()
      },
      save: vi.fn().mockResolvedValue(undefined)
    });
    getMock.mockRejectedValueOnce(new Error('403 Forbidden: permission denied'));

    const { res, status, json } = createResponse();
    const req = { user: { companyId: 'company-1', id: 'user-1' } } as unknown as Request;

    await verifySharedSheetsConfig(req, res);

    expect(status).toHaveBeenCalledWith(403);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'error',
        message: 'not_shared'
      })
    );
  });

  it('returns not_found when spreadsheet does not exist', async () => {
    const { verifySharedSheetsConfig } = await import('./controllers/integrationsSheetsController');
    findOneAndUpdateMock.mockResolvedValue({
      googleSheets: {
        sharedConfig: {
          spreadsheetId: 'sheet-missing',
          sheetName: 'Sheet1'
        },
        sharedSheets: [
          {
            profileId: 'profile-1',
            name: 'POS DATA SHEET',
            spreadsheetId: 'sheet-missing',
            sheetName: 'Sheet1',
            enabled: true,
            isDefault: true
          }
        ],
        updatedAt: new Date()
      },
      save: vi.fn().mockResolvedValue(undefined)
    });
    getMock.mockRejectedValueOnce(new Error('404 not found'));

    const { res, status, json } = createResponse();
    const req = { user: { companyId: 'company-1', id: 'user-1' } } as unknown as Request;

    await verifySharedSheetsConfig(req, res);

    expect(status).toHaveBeenCalledWith(404);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'error',
        message: 'not_found'
      })
    );
  });

  it('does not fail verification when preview range parsing fails', async () => {
    const { verifySharedSheetsConfig } = await import('./controllers/integrationsSheetsController');
    findOneAndUpdateMock.mockResolvedValue({
      googleSheets: {
        sharedConfig: {
          spreadsheetId: 'sheet-1',
          sheetName: 'CLEAN DATA'
        },
        sharedSheets: [
          {
            profileId: 'profile-1',
            name: 'POS DATA SHEET',
            spreadsheetId: 'sheet-1',
            sheetName: 'CLEAN DATA',
            enabled: true,
            isDefault: true
          }
        ],
        updatedAt: new Date()
      },
      save: vi.fn().mockResolvedValue(undefined)
    });
    getMock
      .mockResolvedValueOnce({
        data: {
          properties: { title: 'RetailSync Shared Sheet' },
          sheets: [{ properties: { sheetId: 1, title: 'CLEAN DATA' } }]
        }
      })
      .mockRejectedValueOnce(new Error('Unable to parse range: CLEAN DATA!A1:Z6'));

    const { res, status, json } = createResponse();
    const req = { user: { companyId: 'company-1', id: 'user-1' } } as unknown as Request;

    await verifySharedSheetsConfig(req, res);

    expect(status).toHaveBeenCalledWith(200);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'ok',
        data: expect.objectContaining({
          connected: true,
          preview: []
        })
      })
    );
  });
});
