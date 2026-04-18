export const moduleKeys = [
    'dashboard',
    'pos',
    'invoices',
    'reconciliation',
    'bankStatements',
    'suppliers',
    'reports',
    'users',
    'rolesSettings',
    'accounting',
    'ledger',
    'quickbooks'
];
export const moduleActionCatalog = {
    dashboard: ['refresh'],
    pos: ['import', 'recalculate'],
    invoices: ['confirm', 'reprocess_ocr', 'export'],
    reconciliation: ['auto_match', 'confirm_match', 'unmatch'],
    bankStatements: ['import', 'parse_pdf', 'confirm', 'lock', 'reprocess'],
    suppliers: ['approve'],
    reports: ['export_csv'],
    users: ['invite', 'assignRole'],
    rolesSettings: ['cloneRole'],
    accounting: ['process', 'confirm', 'lock'],
    ledger: ['post', 'adjust'],
    quickbooks: ['connect', 'sync', 'disconnect', 'post']
};
