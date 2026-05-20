export const moduleKeys = [
    'dashboard',
    'pos',
    'bankStatements',
    'users',
    'rolesSettings',
    'settings',
    'accounting',
    'ledger',
    'quickbooks'
];
export const moduleActionCatalog = {
    dashboard: ['refresh'],
    pos: ['import', 'recalculate', 'table', 'analytics', 'saleTax'],
    bankStatements: ['import', 'parse_pdf', 'confirm', 'lock', 'reprocess'],
    users: ['invite', 'assignRole'],
    rolesSettings: ['cloneRole'],
    settings: [],
    accounting: ['process', 'confirm', 'lock'],
    ledger: ['post', 'adjust'],
    quickbooks: ['connect', 'sync', 'disconnect', 'post']
};
