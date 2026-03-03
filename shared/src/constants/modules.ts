export const moduleKeys = [
  'dashboard',
  'pos',
  'items',
  'invoices',
  'inventory',
  'locations',
  'reconciliation',
  'bankStatements',
  'suppliers',
  'reports',
  'users',
  'rolesSettings',
  'accounting',
  'ledger',
  'quickbooks'
] as const;

export type ModuleKey = (typeof moduleKeys)[number];

export const moduleActionCatalog: Record<ModuleKey, string[]> = {
  dashboard: ['refresh'],
  pos: ['import', 'recalculate'],
  items: ['import'],
  invoices: ['confirm', 'reprocess_ocr', 'export'],
  inventory: ['move', 'adjust'],
  locations: ['sync'],
  reconciliation: ['auto_match', 'confirm_match', 'unmatch'],
  bankStatements: ['import', 'parse_pdf', 'confirm', 'lock', 'reprocess'],
  suppliers: ['approve'],
  reports: ['export_csv'],
  users: ['invite', 'assignRole'],
  rolesSettings: ['cloneRole'],
  accounting: ['process', 'confirm', 'lock'],
  ledger: ['post', 'adjust'],
  quickbooks: ['connect', 'sync', 'disconnect']
};
