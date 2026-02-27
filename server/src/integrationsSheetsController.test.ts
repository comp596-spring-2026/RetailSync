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
    getMock.mockResolvedValueOnce({ data: { values: [['header']] } });
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
});
