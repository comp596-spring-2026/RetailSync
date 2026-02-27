import {
  IconButton,
  InputAdornment,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TablePagination,
  TableRow,
  TextField,
  Tooltip,
  Typography
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import { useMemo, useState } from 'react';
import { useTablePagination } from '../../hooks/useTablePagination';

export type CrudColumn<T> = {
  id: string;
  label: string;
  render: (row: T) => string;
};

type SearchableCrudTableProps<T> = {
  rows: T[];
  columns: CrudColumn<T>[];
  getRowId: (row: T) => string;
  onEdit?: (row: T) => void;
  onDelete?: (row: T) => void;
  searchPlaceholder?: string;
  emptyLabel?: string;
};

const normalize = (value: string) => value.trim().toLowerCase();

export const SearchableCrudTable = <T,>({
  rows,
  columns,
  getRowId,
  onEdit,
  onDelete,
  searchPlaceholder = 'Search records',
  emptyLabel = 'No records found'
}: SearchableCrudTableProps<T>) => {
  const [query, setQuery] = useState('');

  const filteredRows = useMemo(() => {
    const normalizedQuery = normalize(query);
    if (!normalizedQuery) return rows;
    return rows.filter((row) =>
      columns.some((column) => normalize(column.render(row)).includes(normalizedQuery))
    );
  }, [rows, columns, query]);

  const { page, rowsPerPage, rowCount, pagedRows, onChangePage, onChangeRowsPerPage } = useTablePagination({
    rows: filteredRows
  });

  return (
    <Paper sx={{ p: 2 }}>
      <Stack spacing={2}>
        <TextField
          size="small"
          placeholder={searchPlaceholder}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon fontSize="small" />
              </InputAdornment>
            )
          }}
        />
        <Table size="small">
          <TableHead>
            <TableRow>
              {columns.map((column) => (
                <TableCell key={column.id}>{column.label}</TableCell>
              ))}
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {pagedRows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columns.length + 1}>
                  <Typography variant="body2" color="text.secondary">
                    {emptyLabel}
                  </Typography>
                </TableCell>
              </TableRow>
            ) : (
              pagedRows.map((row) => (
                <TableRow key={getRowId(row)}>
                  {columns.map((column) => (
                    <TableCell key={`${getRowId(row)}-${column.id}`}>{column.render(row)}</TableCell>
                  ))}
                  <TableCell align="right">
                    <Tooltip title="Edit">
                      <span>
                        <IconButton size="small" onClick={() => onEdit?.(row)} disabled={!onEdit} aria-label="Edit">
                          <EditOutlinedIcon fontSize="small" />
                        </IconButton>
                      </span>
                    </Tooltip>
                    <Tooltip title="Delete">
                      <span>
                        <IconButton
                          size="small"
                          color="error"
                          onClick={() => onDelete?.(row)}
                          disabled={!onDelete}
                          aria-label="Delete"
                        >
                          <DeleteOutlineIcon fontSize="small" />
                        </IconButton>
                      </span>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        <TablePagination
          component="div"
          count={rowCount}
          page={page}
          rowsPerPage={rowsPerPage}
          onPageChange={onChangePage}
          onRowsPerPageChange={(event) => onChangeRowsPerPage(Number(event.target.value))}
          rowsPerPageOptions={[5, 10, 25]}
        />
      </Stack>
    </Paper>
  );
};
