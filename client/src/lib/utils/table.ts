export const clampPage = (page: number, totalItems: number, rowsPerPage: number) => {
  const totalPages = Math.max(1, Math.ceil(totalItems / Math.max(rowsPerPage, 1)));
  return Math.min(Math.max(page, 0), totalPages - 1);
};

export const paginateRows = <T>(rows: T[], page: number, rowsPerPage: number) => {
  const safeRowsPerPage = Math.max(rowsPerPage, 1);
  const safePage = clampPage(page, rows.length, safeRowsPerPage);
  const start = safePage * safeRowsPerPage;
  return rows.slice(start, start + safeRowsPerPage);
};
