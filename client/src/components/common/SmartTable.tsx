import SearchIcon from '@mui/icons-material/Search';
import RefreshIcon from '@mui/icons-material/Refresh';
import {
  Alert,
  Box,
  Button,
  InputAdornment,
  Paper,
  Stack,
  TextField,
  Typography
} from '@mui/material';
import {
  DataGrid,
  type GridColDef,
  type GridSortModel,
  type GridValidRowModel
} from '@mui/x-data-grid';
import type { ReactNode } from 'react';

export type SmartTableProps<T extends GridValidRowModel> = {
  columns: GridColDef<T>[];
  rows: T[];
  getRowId: (row: T) => string | number;
  rowCount: number;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  sortModel?: GridSortModel;
  onSortModelChange?: (sortModel: GridSortModel) => void;
  searchValue?: string;
  onSearchValueChange?: (value: string) => void;
  searchPlaceholder?: string;
  filters?: ReactNode;
  onRefresh?: () => void;
  loading?: boolean;
  error?: string | null;
  emptyText?: string;
  checkboxSelection?: boolean;
};

const defaultEmptyText = 'No records found.';

const EmptyOverlay = ({ message }: { message: string }) => (
  <Box sx={{ py: 6, px: 2, textAlign: 'center' }}>
    <Typography variant="subtitle1" fontWeight={700}>
      {message}
    </Typography>
  </Box>
);

export const SmartTable = <T extends GridValidRowModel>({
  columns,
  rows,
  getRowId,
  rowCount,
  page,
  pageSize,
  onPageChange,
  onPageSizeChange,
  sortModel = [],
  onSortModelChange,
  searchValue,
  onSearchValueChange,
  searchPlaceholder = 'Search',
  filters,
  onRefresh,
  loading = false,
  error = null,
  emptyText = defaultEmptyText,
  checkboxSelection = true
}: SmartTableProps<T>) => {
  const hasToolbar = Boolean(onSearchValueChange || filters || onRefresh);

  return (
    <Paper sx={{ p: 2 }}>
      <Stack spacing={2}>
        {hasToolbar ? (
          <Stack
            direction={{ xs: 'column', md: 'row' }}
            spacing={1.5}
            alignItems={{ md: 'center' }}
            justifyContent="space-between"
          >
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} flexWrap="wrap" useFlexGap>
              {onSearchValueChange ? (
                <TextField
                  size="small"
                  value={searchValue ?? ''}
                  onChange={(event) => onSearchValueChange(event.target.value)}
                  placeholder={searchPlaceholder}
                  label={searchPlaceholder}
                  sx={{ minWidth: 240 }}
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <SearchIcon fontSize="small" />
                      </InputAdornment>
                    )
                  }}
                />
              ) : null}
              {filters}
            </Stack>
            {onRefresh ? (
              <Button
                variant="outlined"
                startIcon={<RefreshIcon />}
                onClick={onRefresh}
                disabled={loading}
              >
                Refresh
              </Button>
            ) : null}
          </Stack>
        ) : null}

        {error ? <Alert severity="error">{error}</Alert> : null}

        <Box sx={{ width: '100%' }}>
          <DataGrid
            autoHeight
            rows={rows}
            columns={columns}
            getRowId={getRowId}
            rowCount={rowCount}
            loading={loading}
            paginationMode="server"
            sortingMode="server"
            paginationModel={{ page: Math.max(page - 1, 0), pageSize }}
            onPaginationModelChange={(model) => {
              if (model.pageSize !== pageSize) {
                onPageSizeChange(model.pageSize);
                onPageChange(1);
                return;
              }
              onPageChange(model.page + 1);
            }}
            sortModel={sortModel}
            onSortModelChange={onSortModelChange}
            checkboxSelection={checkboxSelection}
            disableRowSelectionOnClick
            pageSizeOptions={[10, 25, 50, 100]}
            slots={{
              noRowsOverlay: () => <EmptyOverlay message={emptyText} />
            }}
            sx={{
              border: 0,
              '& .MuiDataGrid-columnHeaders': {
                backgroundColor: 'rgba(15, 23, 42, 0.03)'
              }
            }}
          />
        </Box>
      </Stack>
    </Paper>
  );
};

