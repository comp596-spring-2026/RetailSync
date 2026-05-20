const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0
});

export const formatCurrency = (value: number | null | undefined) => {
  if (value == null || Number.isNaN(value)) return '—';
  return currencyFormatter.format(value);
};

export const formatCurrencyPrecise = (value: number | null | undefined) => {
  if (value == null || Number.isNaN(value)) return '—';
  return value.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });
};
