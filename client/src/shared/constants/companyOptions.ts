export type SelectOption = {
  value: string;
  label: string;
  keywords?: string;
};

const fallbackTimezones = [
  'America/Los_Angeles',
  'America/Denver',
  'America/Chicago',
  'America/New_York',
  'America/Phoenix',
  'America/Anchorage',
  'Pacific/Honolulu',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Asia/Dubai',
  'Asia/Kolkata',
  'Asia/Singapore',
  'Asia/Tokyo',
  'Australia/Sydney',
  'UTC'
];

const timezoneValues =
  typeof Intl !== 'undefined' && 'supportedValuesOf' in Intl
    ? Intl.supportedValuesOf('timeZone')
    : fallbackTimezones;

export const timezoneOptions: SelectOption[] = timezoneValues.map((tz) => ({
  value: tz,
  label: tz.replaceAll('_', ' ')
}));

type CurrencySeed = {
  code: string;
  name: string;
  symbol: string;
};

const currencySeeds: CurrencySeed[] = [
  { code: 'USD', name: 'US Dollar', symbol: '$' },
  { code: 'CAD', name: 'Canadian Dollar', symbol: '$' },
  { code: 'MXN', name: 'Mexican Peso', symbol: '$' },
  { code: 'EUR', name: 'Euro', symbol: 'EUR' },
  { code: 'GBP', name: 'British Pound', symbol: 'GBP' },
  { code: 'INR', name: 'Indian Rupee', symbol: 'INR' },
  { code: 'AED', name: 'UAE Dirham', symbol: 'AED' },
  { code: 'AUD', name: 'Australian Dollar', symbol: '$' },
  { code: 'NZD', name: 'New Zealand Dollar', symbol: '$' },
  { code: 'JPY', name: 'Japanese Yen', symbol: 'JPY' },
  { code: 'CNY', name: 'Chinese Yuan', symbol: 'CNY' },
  { code: 'SGD', name: 'Singapore Dollar', symbol: '$' },
  { code: 'HKD', name: 'Hong Kong Dollar', symbol: '$' },
  { code: 'MYR', name: 'Malaysian Ringgit', symbol: 'MYR' },
  { code: 'THB', name: 'Thai Baht', symbol: 'THB' },
  { code: 'KRW', name: 'South Korean Won', symbol: 'KRW' },
  { code: 'BRL', name: 'Brazilian Real', symbol: 'BRL' },
  { code: 'ARS', name: 'Argentine Peso', symbol: 'ARS' },
  { code: 'CLP', name: 'Chilean Peso', symbol: 'CLP' },
  { code: 'COP', name: 'Colombian Peso', symbol: 'COP' },
  { code: 'CHF', name: 'Swiss Franc', symbol: 'CHF' },
  { code: 'SEK', name: 'Swedish Krona', symbol: 'SEK' },
  { code: 'NOK', name: 'Norwegian Krone', symbol: 'NOK' },
  { code: 'DKK', name: 'Danish Krone', symbol: 'DKK' },
  { code: 'PLN', name: 'Polish Zloty', symbol: 'PLN' },
  { code: 'CZK', name: 'Czech Koruna', symbol: 'CZK' },
  { code: 'ZAR', name: 'South African Rand', symbol: 'ZAR' },
  { code: 'NGN', name: 'Nigerian Naira', symbol: 'NGN' },
  { code: 'KES', name: 'Kenyan Shilling', symbol: 'KES' },
  { code: 'TRY', name: 'Turkish Lira', symbol: 'TRY' },
  { code: 'SAR', name: 'Saudi Riyal', symbol: 'SAR' },
  { code: 'QAR', name: 'Qatari Riyal', symbol: 'QAR' }
];

export const currencyOptions: SelectOption[] = currencySeeds.map((item) => ({
  value: item.code,
  label: `${item.code} (${item.symbol}) - ${item.name}`,
  keywords: `${item.code} ${item.symbol} ${item.name}`.toLowerCase()
}));
