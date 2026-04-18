import {
  DEFAULT_CURRENCY_CODE,
  DEFAULT_REGION_CURRENCY_MAP,
  DEFAULT_TIMEZONE,
  FALLBACK_TIMEZONES
} from '@retailsync/shared';

export type SelectOption = {
  value: string;
  label: string;
  keywords?: string;
};

const timezoneValues =
  typeof Intl !== 'undefined' && 'supportedValuesOf' in Intl
    ? Intl.supportedValuesOf('timeZone')
    : [...FALLBACK_TIMEZONES];

export const timezoneOptions: SelectOption[] = timezoneValues.map((tz) => ({
  value: tz,
  label: tz.replaceAll('_', ' ')
}));

export const getDefaultTimezone = () => {
  if (typeof Intl !== 'undefined') {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (timezone) {
      return timezone;
    }
  }

  return DEFAULT_TIMEZONE;
};

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

export const getDefaultCurrencyFromLocale = () => {
  if (typeof navigator !== 'undefined') {
    const locale = navigator.languages?.[0] ?? navigator.language ?? '';
    const region = locale.split('-')[1]?.toUpperCase() as keyof typeof DEFAULT_REGION_CURRENCY_MAP | undefined;
    if (region && DEFAULT_REGION_CURRENCY_MAP[region]) {
      return DEFAULT_REGION_CURRENCY_MAP[region];
    }
  }

  return DEFAULT_CURRENCY_CODE;
};
