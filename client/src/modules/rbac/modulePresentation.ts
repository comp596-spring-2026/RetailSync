import { ModuleKey } from '@retailsync/shared';
import { QUICKBOOKS_QUICK_ACCESS_ITEMS } from '../quickbooks/constants';

const QUICKBOOKS_ROLE_SURFACES = [
  'QuickBooks hub',
  ...QUICKBOOKS_QUICK_ACCESS_ITEMS.map((item) => item.title),
  'Account registers',
  'Invoice and payment CRUD'
] as const;

export const modulePresentation: Record<
  ModuleKey,
  {
    label: string;
    surfaces: string[];
  }
> = {
  dashboard: {
    label: 'Dashboard',
    surfaces: ['Dashboard home']
  },
  pos: {
    label: 'POS',
    surfaces: ['POS analytics', 'POS table', 'POS AI']
  },
  invoices: {
    label: 'Procurement / Invoices',
    surfaces: ['Procurement invoices']
  },
  reconciliation: {
    label: 'Accounting / Reconciliation',
    surfaces: ['Reconciliation entry points']
  },
  bankStatements: {
    label: 'Accounting / Statements',
    surfaces: ['Statements list', 'Statement detail']
  },
  suppliers: {
    label: 'Procurement / Suppliers',
    surfaces: ['Procurement suppliers']
  },
  reports: {
    label: 'Reports',
    surfaces: ['Exports', 'Reporting endpoints']
  },
  users: {
    label: 'Access / Users',
    surfaces: ['Access users', 'Invites']
  },
  rolesSettings: {
    label: 'Access / Roles',
    surfaces: ['Access roles']
  },
  accounting: {
    label: 'Accounting / Overview',
    surfaces: ['Statements list', 'Statement detail']
  },
  ledger: {
    label: 'Accounting / Ledger',
    surfaces: ['Ledger queue', 'Ledger review']
  },
  quickbooks: {
    label: 'QuickBooks',
    surfaces: [...QUICKBOOKS_ROLE_SURFACES]
  }
};

export const navVisibleRoleModules: ModuleKey[] = [
  'dashboard',
  'pos',
  'bankStatements',
  'reports',
  'users',
  'rolesSettings',
  'quickbooks'
];
