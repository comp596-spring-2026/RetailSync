export const APP_NAME = 'RetailSync';
export const APP_EMAIL_FROM_NAME = APP_NAME;
export const APP_SYSTEM_EMAIL = 'retailsync.dev@gmail.com';

export const DEFAULT_LOCALE = 'en-US';
export const DEFAULT_TIMEZONE = 'America/Los_Angeles';
export const DEFAULT_CURRENCY_CODE = 'USD';

export const DEFAULT_REGION_CURRENCY_MAP = {
  US: 'USD',
  CA: 'CAD',
  GB: 'GBP',
  AU: 'AUD',
  NZ: 'NZD',
  IN: 'INR',
  JP: 'JPY',
  SG: 'SGD',
  AE: 'AED',
  MX: 'MXN'
} as const;

export const FALLBACK_TIMEZONES = [
  DEFAULT_TIMEZONE,
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
] as const;

export const DEV_CLIENT_ORIGIN = 'http://localhost:4630';
export const DEV_VITE_CLIENT_ORIGIN = 'http://localhost:5173';

export const SMTP_DEFAULTS = {
  host: 'smtp.gmail.com',
  port: 587,
  secure: false,
  from: APP_SYSTEM_EMAIL,
  fromName: APP_EMAIL_FROM_NAME,
  timeoutMs: 10000
} as const;
