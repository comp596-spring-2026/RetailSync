import type { SvgIconComponent } from '@mui/icons-material';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import AssessmentOutlinedIcon from '@mui/icons-material/AssessmentOutlined';
import ContactsOutlinedIcon from '@mui/icons-material/ContactsOutlined';
import PaidOutlinedIcon from '@mui/icons-material/PaidOutlined';
import ReceiptLongOutlinedIcon from '@mui/icons-material/ReceiptLongOutlined';
import SyncAltOutlinedIcon from '@mui/icons-material/SyncAltOutlined';

export const QUICKBOOKS_BASE_PATH = '/dashboard/quickbooks';

export const QUICKBOOKS_SERVICE_DEFAULTS = {
  page: 1,
  pageSize: 100,
  status: 'active',
  invoiceSort: '-date'
} as const;

export type QuickbooksWorkspaceKey =
  | 'accounts'
  | 'contacts'
  | 'operations'
  | 'reports'
  | 'tax'
  | 'sales'
  | 'money';

export type QuickbooksQuickAccessItem = {
  key: QuickbooksWorkspaceKey;
  title: string;
  description: string;
  to: string;
  section: 'Records' | 'Transactions' | 'Controls';
  icon: SvgIconComponent;
  matchPrefixes: readonly string[];
};

export const QUICKBOOKS_QUICK_ACCESS_ITEMS: readonly QuickbooksQuickAccessItem[] = [
  {
    key: 'accounts',
    title: 'Accounts',
    description: 'Chart of accounts plus register drill-ins.',
    to: `${QUICKBOOKS_BASE_PATH}/accounts`,
    section: 'Records',
    icon: AccountBalanceIcon,
    matchPrefixes: [
      '/dashboard/accounting/quickbooks/chart-of-accounts',
      `${QUICKBOOKS_BASE_PATH}/accounts`,
      `${QUICKBOOKS_BASE_PATH}/chart-of-accounts`
    ]
  },
  {
    key: 'contacts',
    title: 'Contacts',
    description: 'Browse customers and vendors in one place.',
    to: `${QUICKBOOKS_BASE_PATH}/contacts`,
    section: 'Records',
    icon: ContactsOutlinedIcon,
    matchPrefixes: [
      '/dashboard/accounting/quickbooks/customers',
      '/dashboard/accounting/quickbooks/vendors',
      `${QUICKBOOKS_BASE_PATH}/contacts`,
      `${QUICKBOOKS_BASE_PATH}/customers`,
      `${QUICKBOOKS_BASE_PATH}/vendors`
    ]
  },
  {
    key: 'operations',
    title: 'Operations',
    description: 'Track post status, failures, and sync outcomes.',
    to: `${QUICKBOOKS_BASE_PATH}/operations`,
    section: 'Controls',
    icon: SyncAltOutlinedIcon,
    matchPrefixes: [
      '/dashboard/accounting/quickbooks/operations',
      `${QUICKBOOKS_BASE_PATH}/operations`
    ]
  },
  {
    key: 'reports',
    title: 'Reports',
    description: 'Inspect reporting and tax-support outputs.',
    to: `${QUICKBOOKS_BASE_PATH}/reports`,
    section: 'Controls',
    icon: AssessmentOutlinedIcon,
    matchPrefixes: [
      '/dashboard/accounting/quickbooks/reports',
      `${QUICKBOOKS_BASE_PATH}/reports`
    ]
  },
  {
    key: 'tax',
    title: 'Tax',
    description: 'Run tax-focused QuickBooks workflows.',
    to: `${QUICKBOOKS_BASE_PATH}/tax`,
    section: 'Controls',
    icon: PaidOutlinedIcon,
    matchPrefixes: ['/dashboard/accounting/tax', `${QUICKBOOKS_BASE_PATH}/tax`]
  },
  {
    key: 'sales',
    title: 'Sales',
    description: 'Invoices and receive-payment workflows.',
    to: `${QUICKBOOKS_BASE_PATH}/sales`,
    section: 'Transactions',
    icon: ReceiptLongOutlinedIcon,
    matchPrefixes: [
      '/dashboard/accounting/quickbooks/write',
      `${QUICKBOOKS_BASE_PATH}/sales`,
      `${QUICKBOOKS_BASE_PATH}/writes`,
      `${QUICKBOOKS_BASE_PATH}/write`
    ]
  },
  {
    key: 'money',
    title: 'Money',
    description: 'Deposits, checks, expenses, and transfers.',
    to: `${QUICKBOOKS_BASE_PATH}/money`,
    section: 'Transactions',
    icon: PaidOutlinedIcon,
    matchPrefixes: [
      '/dashboard/accounting/registers',
      '/dashboard/accounting/transactions',
      `${QUICKBOOKS_BASE_PATH}/live`,
      `${QUICKBOOKS_BASE_PATH}/transactions`,
      `${QUICKBOOKS_BASE_PATH}/money`
    ]
  }
] as const;

export const QUICKBOOKS_SECTION_DESCRIPTIONS: Record<
  QuickbooksQuickAccessItem['section'],
  string
> = {
  Records: 'Reference data and account structure',
  Transactions: 'Sales and money movement',
  Controls: 'Monitoring and reporting'
};
