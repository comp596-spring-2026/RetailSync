export type ConnectorKey = 'pos_daily' | 'inventory_items' | (string & {});

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
  // First version importer supports pos_daily only. This registry entry proves multi-connector config support.
  inventory_items: {
    key: 'inventory_items',
    label: 'Inventory Items',
    requiredTargets: ['sku', 'description']
  }
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
