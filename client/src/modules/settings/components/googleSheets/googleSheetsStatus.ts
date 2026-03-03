export type SourceType = 'oauth' | 'shared';

export type SourceStatus = 'not_connected' | 'incomplete' | 'ready';
export type AuthorityState = 'none' | 'paused' | 'active_ready';

export type ConnectorSummaryConfig = {
  spreadsheetId: string | null;
  sheetName: string;
  mappedCount: number;
  spreadsheetTitle: string;
  lastSyncAt: string | null;
  enabled?: boolean;
};

type ActiveSourceContext = {
  mode: 'oauth' | 'service_account';
  backendActive?: SourceType | null;
};

type StatusMap = Record<SourceType, SourceStatus>;

type ConfigMap = Record<SourceType, ConnectorSummaryConfig | null>;

export type SummaryModel = {
  activeSource: SourceType | null;
  authorityState: AuthorityState;
  severity: 'info' | 'warning';
  title: string;
  details: string;
  isMisconfigured: boolean;
  ctaLabel: 'Setup sheet' | 'Fix setup' | 'Change settings';
};

const isConnectorReady = (config: ConnectorSummaryConfig | null | undefined) => {
  if (!config) return false;
  if (config.enabled === false) return false;
  return Boolean(config.spreadsheetId) && Boolean(config.sheetName) && config.mappedCount > 0;
};

export const getSourceStatusOAuth = (
  connectorConfig: ConnectorSummaryConfig | null,
  oauthTokensPresent: boolean,
): SourceStatus => {
  if (!oauthTokensPresent) return 'not_connected';
  return isConnectorReady(connectorConfig) ? 'ready' : 'incomplete';
};

export const getSourceStatusShared = (
  connectorConfig: ConnectorSummaryConfig | null,
  sharedConfigured: boolean,
): SourceStatus => {
  if (!sharedConfigured) return 'not_connected';
  return isConnectorReady(connectorConfig) ? 'ready' : 'incomplete';
};

export const getBackendActiveSource = (
  mode: 'oauth' | 'service_account',
  hasOAuthConfig: boolean,
  hasSharedConfig: boolean,
): SourceType | null => {
  if (mode === 'oauth') return hasOAuthConfig ? 'oauth' : null;
  return hasSharedConfig ? 'shared' : null;
};

export const getActiveSource = (
  settings: ActiveSourceContext,
  computedStatuses: StatusMap,
): SourceType | null => {
  const backendActive: SourceType | null =
    settings.backendActive ?? (settings.mode === 'oauth' ? 'oauth' : 'shared');
  if (!backendActive) return null;
  return computedStatuses[backendActive] === 'ready' ? backendActive : null;
};

export const getAuthorityState = (
  activeSource: SourceType | null,
  backendActive: SourceType | null,
  statuses: StatusMap,
): AuthorityState => {
  if (activeSource) return 'active_ready';
  if (backendActive && statuses[backendActive] !== 'ready') return 'paused';
  return 'none';
};

// Named helper kept for UI-level readability in connector cards/components.
export const computeAuthorityState = getAuthorityState;

export const getPrimaryCtaLabel = (
  authorityState: AuthorityState,
): 'Setup sheet' | 'Fix setup' | 'Change settings' => {
  if (authorityState === 'active_ready') return 'Change settings';
  if (authorityState === 'paused') return 'Fix setup';
  return 'Setup sheet';
};

export const getPrimaryCtaWizardStartStep = (authorityState: AuthorityState): 0 | 1 => {
  return authorityState === 'active_ready' ? 1 : 0;
};

export const getSummaryModel = (
  activeSource: SourceType | null,
  statuses: StatusMap,
  configs: ConfigMap,
  backendActive: SourceType | null,
): SummaryModel => {
  const authorityState = getAuthorityState(activeSource, backendActive, statuses);
  const ctaLabel = getPrimaryCtaLabel(authorityState);

  if (authorityState !== 'active_ready') {
    const isMisconfigured = authorityState === 'paused';
    return {
      activeSource: null,
      authorityState,
      severity: isMisconfigured ? 'warning' : 'info',
      isMisconfigured,
      ctaLabel,
      title: isMisconfigured ? 'Sync paused' : 'Setup required',
      details: isMisconfigured
        ? `Active source: ${backendActive === 'oauth' ? 'OAuth' : 'Shared'} • Reason: source is not fully configured`
        : 'No sync configured yet. Choose OAuth or Shared, then select sheet and mapping.',
    };
  }

  const source = activeSource as SourceType;
  const activeConfig = configs[source];
  const sourceLabel = source === 'oauth' ? 'OAuth' : 'Shared';
  const lastSync = activeConfig?.lastSyncAt ? new Date(activeConfig.lastSyncAt).toLocaleString() : '—';

  return {
    activeSource: source,
    authorityState,
    severity: 'info',
    isMisconfigured: false,
    ctaLabel,
    title: `Syncing via ${sourceLabel}`,
    details: `Spreadsheet: ${activeConfig?.spreadsheetTitle || '—'} • Tab: ${activeConfig?.sheetName || '—'} • ${
      activeConfig?.mappedCount ?? 0
    } fields mapped • Last sync: ${lastSync}`,
  };
};

export const getStatusLabel = (status: SourceStatus) => {
  if (status === 'ready') return 'Ready';
  if (status === 'incomplete') return 'Incomplete';
  return 'Not connected';
};

export const getStatusColor = (status: SourceStatus): 'success' | 'warning' | 'default' => {
  if (status === 'ready') return 'success';
  if (status === 'incomplete') return 'warning';
  return 'default';
};
