export type ConnectorKey = 'pos_daily' | (string & {});

export type ConnectorDefinition = {
  key: ConnectorKey;
  label: string;
  requiredTargets: string[];
};

export const CONNECTORS: Record<string, ConnectorDefinition> = {
  pos_daily: {
    key: 'pos_daily',
    label: 'POS Daily Summary',
    requiredTargets: [
      'date',
      'highTax',
      'lowTax',
      'saleTax',
      'gas',
      'lottery',
      'creditCard',
      'lotteryPayout',
      'cashExpenses'
    ]
  },
};

export const DEFAULT_CONNECTOR_KEY: ConnectorKey = 'pos_daily';

export const getConnectorDefinition = (key: string): ConnectorDefinition => {
  const normalized = String(key ?? '').trim();
  if (!normalized) return CONNECTORS[DEFAULT_CONNECTOR_KEY];
  return CONNECTORS[normalized] ?? {
    key: normalized as ConnectorKey,
    label: normalized,
    requiredTargets: []
  };
};
