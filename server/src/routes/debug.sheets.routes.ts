import { Router } from 'express';
import { z } from 'zod';
import { getSheetsClient } from '../integrations/google/sheets.client';

const router = Router();

router.get('/read', async (req, res, next) => {
  try {
    const schema = z.object({
      spreadsheetId: z.string().min(5),
      range: z.string().min(1)
    });

    const { spreadsheetId, range } = schema.parse(req.query);

    const sheets = getSheetsClient();
    const resp = await sheets.spreadsheets.values.get({ spreadsheetId, range });

    res.json({ values: resp.data.values ?? [] });
  } catch (err) {
    next(err);
  }
});

router.post('/append', async (req, res, next) => {
  try {
    const schema = z.object({
      spreadsheetId: z.string().min(5),
      range: z.string().min(1),
      values: z.array(z.array(z.any())).min(1)
    });

    const { spreadsheetId, range, values } = schema.parse(req.body);

    const sheets = getSheetsClient();
    const resp = await sheets.spreadsheets.values.append({
      spreadsheetId,
      range,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values }
    });

    res.json({
      updatedRange: resp.data.updates?.updatedRange,
      updatedRows: resp.data.updates?.updatedRows
    });
  } catch (err) {
    next(err);
  }
});

export default router;
