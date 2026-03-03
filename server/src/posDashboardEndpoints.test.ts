import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Types } from 'mongoose';

const aggregateMock = vi.fn();
const countDocumentsMock = vi.fn();
const findMock = vi.fn();

vi.mock('./models/POSDailySummary', () => ({
  POSDailySummaryModel: {
    aggregate: (...args: unknown[]) => aggregateMock(...args),
    countDocuments: (...args: unknown[]) => countDocumentsMock(...args),
    find: (...args: unknown[]) => findMock(...args)
  }
}));

const createRes = () => {
  const json = vi.fn();
  const status = vi.fn(() => ({ json }));
  return { status, json };
};

describe('POS dashboard controller helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns paged daily response with totals', async () => {
    const { listPosDailyPaged } = await import('./controllers/posController');

    const rows = [
      {
        _id: '1',
        date: new Date('2026-02-27T00:00:00.000Z'),
        day: 'Fri',
        highTax: 1,
        lowTax: 2,
        saleTax: 3,
        totalSales: 100,
        creditCard: 50,
        cash: 10,
        gas: 20,
        lottery: 5,
        lotteryPayout: 1,
        cashExpenses: 0,
        cashPayout: 0
      }
    ];

    findMock.mockReturnValue({
      sort: () => ({ skip: () => ({ limit: () => Promise.resolve(rows) }) })
    });
    countDocumentsMock.mockResolvedValue(1);
    aggregateMock.mockResolvedValue([
      {
        totalSales: 100,
        creditCard: 50,
        cash: 10,
        gas: 20,
        lottery: 5,
        lotteryPayout: 1,
        cashExpenses: 0,
        cashPayout: 0,
        highTax: 1,
        lowTax: 2,
        saleTax: 3
      }
    ]);

    const req = {
      companyId: 'company-1',
      query: { page: '1', limit: '100', start: '2026-02-01', end: '2026-02-28' }
    } as any;
    const res = createRes() as any;

    await listPosDailyPaged(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const payload = res.status.mock.results[0]?.value?.json.mock.calls[0]?.[0];
    expect(payload.status).toBe('ok');
    expect(payload.data.data).toHaveLength(1);
    expect(payload.data.totalCount).toBe(1);
  });

  it('casts companyId to ObjectId for aggregate match when valid', async () => {
    const { listPosDailyPaged } = await import('./controllers/posController');
    const companyId = new Types.ObjectId().toHexString();

    findMock.mockReturnValue({
      sort: () => ({ skip: () => ({ limit: () => Promise.resolve([]) }) })
    });
    countDocumentsMock.mockResolvedValue(0);
    aggregateMock.mockResolvedValue([]);

    const req = {
      companyId,
      query: { page: '1', limit: '100', start: '2026-02-01', end: '2026-02-28' }
    } as any;
    const res = createRes() as any;

    await listPosDailyPaged(req, res);

    const pipeline = aggregateMock.mock.calls[0]?.[0] as Array<Record<string, unknown>>;
    const match = pipeline?.[0]?.$match as { companyId?: unknown };
    expect(match?.companyId).toBeInstanceOf(Types.ObjectId);
    expect((match?.companyId as Types.ObjectId).toHexString()).toBe(companyId);
  });

  it('returns overview and uses fallback moving average when window aggregation fails', async () => {
    const { getPosOverview } = await import('./controllers/posController');

    const orderedRows = [
      {
        date: new Date('2026-02-25T00:00:00.000Z'),
        totalSales: 100,
        creditCard: 10,
        cash: 5,
        gas: 20,
        lottery: 3,
        lotteryPayout: 1,
        cashExpenses: 0,
        cashPayout: 0,
        saleTax: 4
      },
      {
        date: new Date('2026-02-26T00:00:00.000Z'),
        totalSales: 120,
        creditCard: 20,
        cash: 6,
        gas: 22,
        lottery: 4,
        lotteryPayout: 2,
        cashExpenses: 0,
        cashPayout: 0,
        saleTax: 5
      }
    ];

    aggregateMock
      .mockResolvedValueOnce([
        {
          totalSales: 220,
          creditCard: 30,
          cash: 11,
          gas: 42,
          lottery: 7,
          lotteryPayout: 3,
          saleTax: 9,
          cashExpenses: 0,
          cashPayout: 0,
          count: 2
        }
      ])
      .mockRejectedValueOnce(new Error('window fields unavailable'));

    findMock.mockReturnValue({
      select: () => ({ sort: () => Promise.resolve(orderedRows) })
    });

    const req = {
      companyId: 'company-1',
      query: { start: '2026-02-25', end: '2026-02-26' }
    } as any;
    const res = createRes() as any;

    await getPosOverview(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const payload = res.status.mock.results[0]?.value?.json.mock.calls[0]?.[0];
    expect(payload.status).toBe('ok');
    expect(payload.data.kpis.totalSales).toBe(220);
    expect(Array.isArray(payload.data.sparkline7)).toBe(true);
    expect(payload.data.sparkline7).toHaveLength(2);
  });

  it('returns weekly trend buckets from Monday to Sunday', async () => {
    const { getPosTrend } = await import('./controllers/posController');

    findMock.mockReturnValue({
      select: () => ({
        sort: () =>
          Promise.resolve([
            {
              date: new Date('2026-02-23T00:00:00.000Z'),
              totalSales: 100,
              creditCard: 30,
              cash: 20,
              gas: 40,
              lottery: 10
            },
            {
              date: new Date('2026-02-27T00:00:00.000Z'),
              totalSales: 50,
              creditCard: 10,
              cash: 5,
              gas: 20,
              lottery: 8
            }
          ])
      })
    });

    const req = {
      companyId: 'company-1',
      query: { start: '2026-02-23', end: '2026-03-01', granularity: 'weekly' }
    } as any;
    const res = createRes() as any;

    await getPosTrend(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const payload = res.status.mock.results[0]?.value?.json.mock.calls[0]?.[0];
    expect(payload.status).toBe('ok');
    expect(payload.data.granularity).toBe('weekly');
    expect(payload.data.data).toHaveLength(1);
    expect(payload.data.data[0]).toMatchObject({
      label: 'Week 9 2026',
      range: '2026-02-23 to 2026-03-01',
      totalSales: 150,
      creditCard: 40,
      cash: 25,
      gas: 60,
      lottery: 18
    });
  });

  it('computes moving average fallback helper', async () => {
    const { computeMovingAverageFallback } = await import('./controllers/posController');
    const points = computeMovingAverageFallback([
      { date: new Date('2026-01-01T00:00:00.000Z'), totalSales: 10 },
      { date: new Date('2026-01-02T00:00:00.000Z'), totalSales: 20 },
      { date: new Date('2026-01-03T00:00:00.000Z'), totalSales: 30 }
    ]);

    expect(points.map((point) => point.y)).toEqual([10, 15, 20]);
  });
});
