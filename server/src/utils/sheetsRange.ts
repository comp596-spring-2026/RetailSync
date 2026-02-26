export const escapeSheetName = (name: string) => {
  if (!name) return 'Sheet1';
  const sanitized = name.replace(/'/g, "''");
  return /\s|!|,|'/.test(sanitized) ? `'${sanitized}'` : sanitized;
};

export const buildRange = (sheetName: string, headerRow = 1, maxRows = 20) => {
  const safeName = escapeSheetName(sheetName);
  const normalizedHeaderRow = Number.isFinite(headerRow) && headerRow > 0 ? headerRow : 1;
  const normalizedMaxRows = Number.isFinite(maxRows) && maxRows > 0 ? maxRows : 20;
  const endRow = normalizedHeaderRow + normalizedMaxRows;
  return `${safeName}!A${normalizedHeaderRow}:Z${endRow}`;
};

export const normalizeRows = (values: unknown[][] | undefined) => {
  if (!values) return [] as string[][];
  return values.map((row) =>
    row.map((cell) => (cell === null || cell === undefined ? '' : String(cell)))
  );
};
