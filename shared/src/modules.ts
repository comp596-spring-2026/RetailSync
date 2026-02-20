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
  'rolesSettings'
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
  bankStatements: ['import', 'parse_pdf'],
  suppliers: ['approve'],
  reports: ['export_csv'],
  users: ['invite', 'assignRole'],
  rolesSettings: ['cloneRole']
};
