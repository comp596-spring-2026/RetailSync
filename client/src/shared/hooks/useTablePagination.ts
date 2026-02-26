import { useMemo, useState } from 'react';
import { DEFAULT_PAGE, DEFAULT_ROWS_PER_PAGE } from '../constants/pagination';
import { paginateRows } from '../utils/table';

type UseTablePaginationParams<T> = {
  rows: T[];
  initialRowsPerPage?: number;
};

export const useTablePagination = <T>({
  rows,
  initialRowsPerPage = DEFAULT_ROWS_PER_PAGE
}: UseTablePaginationParams<T>) => {
  const [page, setPage] = useState(DEFAULT_PAGE);
  const [rowsPerPage, setRowsPerPage] = useState(initialRowsPerPage);

  const pagedRows = useMemo(
    () => paginateRows(rows, page, rowsPerPage),
    [rows, page, rowsPerPage]
  );

  const onChangePage = (_event: unknown, nextPage: number) => {
    setPage(nextPage);
  };

  const onChangeRowsPerPage = (nextRowsPerPage: number) => {
    setRowsPerPage(nextRowsPerPage);
    setPage(DEFAULT_PAGE);
  };

  return {
    page,
    rowsPerPage,
    rowCount: rows.length,
    pagedRows,
    onChangePage,
    onChangeRowsPerPage
  };
};
