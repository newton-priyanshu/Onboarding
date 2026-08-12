/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY: string;
  /** Default campus slug — legacy/non-prefixed URLs redirect here (Phase 9). */
  readonly VITE_DEFAULT_CAMPUS_SLUG?: string;
  /** Feature flag — when false the app runs as single-tenant with flat URLs. */
  readonly VITE_MULTI_TENANT_ENABLED?: string;
  /** Sentry DSN — when set, error tracking is enabled (audit finding D3). */
  readonly VITE_SENTRY_DSN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
