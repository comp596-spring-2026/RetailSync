import RefreshIcon from '@mui/icons-material/Refresh';
import {
  Autocomplete,
  CircularProgress,
  IconButton,
  Stack,
  TextField,
  Tooltip
} from '@mui/material';
import type { QuickBooksHubChartAccount } from '@retailsync/shared';

export const QUICKBOOKS_HUB_MAX_PAGE_SIZE = 100;

type StatementBankAccountAutocompleteProps = {
  label: string;
  placeholder: string;
  value: string;
  onChange: (accountRef: string) => void;
  accounts: QuickBooksHubChartAccount[];
  loading?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
  onCreateNew?: () => void;
  onInputChange?: (value: string) => void;
  helperText?: string;
  required?: boolean;
};

export const chartAccountRefValue = (account: QuickBooksHubChartAccount) =>
  account.qbId?.trim() || account.id;

export const StatementBankAccountAutocomplete = ({
  label,
  placeholder,
  value,
  onChange,
  accounts,
  loading = false,
  refreshing = false,
  onRefresh,
  onCreateNew,
  onInputChange,
  helperText,
  required = false
}: StatementBankAccountAutocompleteProps) => (
  <Stack direction="row" spacing={0.75} alignItems="flex-start">
    <Autocomplete
      size="small"
      openOnFocus
      sx={{ flex: 1 }}
      options={accounts}
      loading={loading}
      getOptionLabel={(option) => option.name}
      isOptionEqualToValue={(option, selected) =>
        chartAccountRefValue(option) === chartAccountRefValue(selected)
      }
      filterOptions={(options, state) => {
        const input = state.inputValue.trim().toLowerCase();
        const matches = input
          ? options.filter((option) => option.name.toLowerCase().includes(input))
          : options;
        if (!onCreateNew) return matches;
        return [
          ...matches,
          {
            id: '__create_bank__',
            qbId: null,
            name: '+ Create new bank account…',
            type: 'bank',
            detailType: null,
            status: 'active' as const,
            balance: null
          }
        ];
      }}
      value={accounts.find((row) => chartAccountRefValue(row) === value) ?? null}
      onInputChange={(_event, inputValue, reason) => {
        if (reason === 'reset') return;
        onInputChange?.(inputValue);
      }}
      onChange={(_event, selected) => {
        if (selected?.id === '__create_bank__') {
          onCreateNew?.();
          return;
        }
        onChange(selected ? chartAccountRefValue(selected) : '');
      }}
      renderInput={(params) => (
        <TextField
          {...params}
          label={label}
          placeholder={placeholder}
          required={required}
          InputLabelProps={{ shrink: true }}
          helperText={helperText}
          InputProps={{
            ...params.InputProps,
            endAdornment: (
              <>
                {loading ? <CircularProgress size={14} /> : null}
                {params.InputProps.endAdornment}
              </>
            )
          }}
        />
      )}
    />
    {onRefresh ? (
      <Tooltip title="Refresh QuickBooks bank accounts">
        <span>
          <IconButton
            size="small"
            aria-label="Refresh QuickBooks bank accounts"
            onClick={onRefresh}
            disabled={refreshing}
            sx={{ mt: 0.5 }}
          >
            {refreshing ? <CircularProgress size={18} /> : <RefreshIcon fontSize="small" />}
          </IconButton>
        </span>
      </Tooltip>
    ) : null}
  </Stack>
);
