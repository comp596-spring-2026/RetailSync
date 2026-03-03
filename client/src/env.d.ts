/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string;
  readonly VITE_USE_CONNECTOR_NATIVE_SETTINGS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
