export type MappingSuggestion = {
  sourceHeader: string;
  targetField: string;
  score: number;
};

const HEADER_SYNONYMS: Record<string, string[]> = {
  sku: ['sku', 'item sku', 'product sku', 'code', 'item code'],
  qty: ['qty', 'quantity', 'qoh', 'count', 'units'],
  price: ['price', 'unit price', 'amount', 'cost', 'value'],
  date: ['date', 'txn date', 'transaction date', 'day', 'posted date'],
  name: ['name', 'item', 'item name', 'product', 'description'],
  barcode: ['barcode', 'bar code', 'upc', 'ean']
};

const normalizeToken = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ');

const tokenize = (value: string) => normalizeToken(value).split(' ').filter(Boolean);

const isNumericColumn = (cells: string[]) => {
  const present = cells.filter((cell) => cell.trim().length > 0);
  if (present.length === 0) return false;
  const numeric = present.filter((cell) => /^-?\d+(\.\d+)?$/.test(cell.replace(/,/g, '')));
  return numeric.length / present.length >= 0.7;
};

const isDateColumn = (cells: string[]) => {
  const present = cells.filter((cell) => cell.trim().length > 0);
  if (present.length === 0) return false;
  const parsed = present.filter((cell) => !Number.isNaN(new Date(cell).getTime()));
  return parsed.length / present.length >= 0.7;
};

const levenshteinDistance = (left: string, right: string) => {
  const a = normalizeToken(left);
  const b = normalizeToken(right);
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  const curr = new Array<number>(b.length + 1).fill(0);

  for (let i = 1; i <= a.length; i += 1) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= b.length; j += 1) prev[j] = curr[j];
  }

  return prev[b.length];
};

const similarity = (left: string, right: string) => {
  const maxLen = Math.max(normalizeToken(left).length, normalizeToken(right).length);
  if (!maxLen) return 1;
  return 1 - levenshteinDistance(left, right) / maxLen;
};

const scoreHeaderForField = (header: string, sampleCells: string[], targetField: string) => {
  const normalizedHeader = normalizeToken(header);
  const normalizedTarget = normalizeToken(targetField);
  const headerTokens = tokenize(header);
  const targetTokens = tokenize(targetField);
  const synonyms = HEADER_SYNONYMS[normalizedTarget] ?? [normalizedTarget];

  if (synonyms.includes(normalizedHeader)) return 0.98;

  const tokenOverlap = targetTokens.length
    ? targetTokens.filter((token) => headerTokens.includes(token)).length / targetTokens.length
    : 0;

  const synonymTokenHit = synonyms.some((synonym) =>
    tokenize(synonym).every((token) => headerTokens.includes(token))
  )
    ? 0.2
    : 0;

  const distanceScore = similarity(normalizedHeader, normalizedTarget);

  let typeBoost = 0;
  if (normalizedTarget === 'date' && isDateColumn(sampleCells)) typeBoost = 0.25;
  if ((normalizedTarget === 'qty' || normalizedTarget === 'price') && isNumericColumn(sampleCells)) {
    typeBoost = 0.2;
  }

  return Math.min(0.95, 0.5 * tokenOverlap + 0.25 * distanceScore + synonymTokenHit + typeBoost);
};

export const suggestMappings = (
  headers: string[],
  sampleRows: string[][],
  targetFields: string[]
): MappingSuggestion[] => {
  if (!Array.isArray(headers) || headers.length === 0) return [];
  if (!Array.isArray(targetFields) || targetFields.length === 0) return [];

  return headers.map((header, colIndex) => {
    const cells = sampleRows.map((row) => String(row[colIndex] ?? ''));
    const scored = targetFields.map((field) => ({
      field,
      score: scoreHeaderForField(header, cells, field)
    }));
    scored.sort((a, b) => b.score - a.score);
    return {
      sourceHeader: header,
      targetField: scored[0]?.field ?? '',
      score: Number((scored[0]?.score ?? 0).toFixed(2))
    };
  });
};
