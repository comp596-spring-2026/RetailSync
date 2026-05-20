export type IsoDateRange = { start: string; end: string };

const toLocalIso = (date: Date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

export const lastNDaysRange = (days: number): IsoDateRange => {
  const end = new Date();
  const start = new Date(end);
  start.setDate(end.getDate() - (days - 1));
  return { start: toLocalIso(start), end: toLocalIso(end) };
};

export const currentYearRange = (): IsoDateRange => {
  const end = new Date();
  return {
    start: `${end.getFullYear()}-01-01`,
    end: toLocalIso(end)
  };
};
