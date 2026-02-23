/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string;
  readonly VITE_GOOGLE_OAUTH_ENABLED?: 'true' | 'false';
  readonly VITE_GOOGLE_SERVICE_ACCOUNT_ENABLED?: 'true' | 'false';
  readonly VITE_QUICKBOOKS_ENABLED?: 'true' | 'false';
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
