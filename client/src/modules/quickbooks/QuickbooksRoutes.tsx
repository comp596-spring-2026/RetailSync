import { Navigate, useParams, useRoutes } from 'react-router-dom';
import QuickbooksDashboard from './QuickbooksDashboard';
import AccountsPage from './pages/Accounts';
import ContactsPage from './pages/Contacts';
import MoneyPage from './pages/Money';
import OperationsPage from './pages/Operations';
import ReportsPage from './pages/Reports';
import SalesPage from './pages/Sales';
import TaxPage from './pages/Tax';
import {
  QuickBooksAccountRegisterPage,
  QuickBooksChecksPage,
  QuickBooksDepositsPage,
  QuickBooksExpensesPage,
  QuickBooksTransactionDetailPage,
  QuickBooksTransfersPage
} from '../accounting/pages/QuickBooksLiveReadPages';
import {
  QuickBooksMoneyCreatePage,
  QuickBooksMoneyEditPage
} from '../accounting/pages/QuickBooksMoneyPages';
import {
  QuickBooksWriteCreatePage,
  QuickBooksWriteDetailPage,
  QuickBooksWriteEditPage,
  QuickBooksWriteListPage
} from '../accounting/pages/QuickBooksWritePages';

const LegacyQuickBooksRegisterRedirect = () => {
  const { accountId } = useParams<{ accountId: string }>();
  return <Navigate to={accountId ? `/dashboard/quickbooks/accounts/${accountId}/register` : '/dashboard/quickbooks/accounts'} replace />;
};

const LegacyQuickBooksTransactionRedirect = ({
  to
}: {
  to: string;
}) => {
  const { qbTxnId } = useParams<{ qbTxnId?: string }>();
  return <Navigate to={qbTxnId ? `${to}/${qbTxnId}` : to} replace />;
};

export const QuickbooksRoutes = () =>
  useRoutes([
    { index: true, element: <QuickbooksDashboard /> },
    { path: 'accounts', element: <AccountsPage /> },
    { path: 'accounts/:accountId/register', element: <QuickBooksAccountRegisterPage /> },
    { path: 'contacts', element: <ContactsPage /> },
    { path: 'customers', element: <Navigate to="/dashboard/quickbooks/contacts" replace /> },
    { path: 'vendors', element: <Navigate to="/dashboard/quickbooks/contacts" replace /> },
    { path: 'operations', element: <OperationsPage /> },
    { path: 'reports', element: <ReportsPage /> },
    { path: 'tax', element: <TaxPage /> },
    { path: 'sales', element: <SalesPage /> },
    { path: 'sales/invoices', element: <QuickBooksWriteListPage /> },
    { path: 'sales/invoices/new', element: <QuickBooksWriteCreatePage /> },
    { path: 'sales/invoices/:qbTxnId/edit', element: <QuickBooksWriteEditPage /> },
    { path: 'sales/invoices/:qbTxnId', element: <QuickBooksWriteDetailPage /> },
    { path: 'sales/payments', element: <QuickBooksWriteListPage /> },
    { path: 'sales/payments/new', element: <QuickBooksWriteCreatePage /> },
    { path: 'sales/payments/:qbTxnId/edit', element: <QuickBooksWriteEditPage /> },
    { path: 'sales/payments/:qbTxnId', element: <QuickBooksWriteDetailPage /> },
    { path: 'money', element: <MoneyPage /> },
    { path: 'money/deposits', element: <QuickBooksDepositsPage /> },
    { path: 'money/deposits/new', element: <QuickBooksMoneyCreatePage /> },
    { path: 'money/checks', element: <QuickBooksChecksPage /> },
    { path: 'money/checks/new', element: <QuickBooksMoneyCreatePage /> },
    { path: 'money/expenses', element: <QuickBooksExpensesPage /> },
    { path: 'money/expenses/new', element: <QuickBooksMoneyCreatePage /> },
    { path: 'money/transfers', element: <QuickBooksTransfersPage /> },
    { path: 'money/transfers/new', element: <QuickBooksMoneyCreatePage /> },
    { path: 'money/deposits/:qbTxnId/edit', element: <QuickBooksMoneyEditPage /> },
    { path: 'money/deposits/:qbTxnId', element: <QuickBooksTransactionDetailPage /> },
    { path: 'money/checks/:qbTxnId/edit', element: <QuickBooksMoneyEditPage /> },
    { path: 'money/checks/:qbTxnId', element: <QuickBooksTransactionDetailPage /> },
    { path: 'money/expenses/:qbTxnId/edit', element: <QuickBooksMoneyEditPage /> },
    { path: 'money/expenses/:qbTxnId', element: <QuickBooksTransactionDetailPage /> },
    { path: 'money/transfers/:qbTxnId/edit', element: <QuickBooksMoneyEditPage /> },
    { path: 'money/transfers/:qbTxnId', element: <QuickBooksTransactionDetailPage /> },
    { path: 'transactions', element: <Navigate to="/dashboard/quickbooks/sales" replace /> },
    { path: 'transactions/registers/:accountId', element: <LegacyQuickBooksRegisterRedirect /> },
    { path: 'transactions/deposit', element: <Navigate to="/dashboard/quickbooks/money/deposits" replace /> },
    { path: 'transactions/check', element: <Navigate to="/dashboard/quickbooks/money/checks" replace /> },
    { path: 'transactions/expense', element: <Navigate to="/dashboard/quickbooks/money/expenses" replace /> },
    { path: 'transactions/transfer', element: <Navigate to="/dashboard/quickbooks/money/transfers" replace /> },
    { path: 'transactions/deposit/:qbTxnId', element: <LegacyQuickBooksTransactionRedirect to="/dashboard/quickbooks/money/deposits" /> },
    { path: 'transactions/check/:qbTxnId', element: <LegacyQuickBooksTransactionRedirect to="/dashboard/quickbooks/money/checks" /> },
    { path: 'transactions/expense/:qbTxnId', element: <LegacyQuickBooksTransactionRedirect to="/dashboard/quickbooks/money/expenses" /> },
    { path: 'transactions/transfer/:qbTxnId', element: <LegacyQuickBooksTransactionRedirect to="/dashboard/quickbooks/money/transfers" /> },
    { path: 'transactions/invoice', element: <Navigate to="/dashboard/quickbooks/sales/invoices" replace /> },
    { path: 'transactions/invoice/new', element: <Navigate to="/dashboard/quickbooks/sales/invoices/new" replace /> },
    { path: 'transactions/invoice/:qbTxnId/edit', element: <LegacyQuickBooksTransactionRedirect to="/dashboard/quickbooks/sales/invoices" /> },
    { path: 'transactions/invoice/:qbTxnId', element: <LegacyQuickBooksTransactionRedirect to="/dashboard/quickbooks/sales/invoices" /> },
    { path: 'transactions/payment', element: <Navigate to="/dashboard/quickbooks/sales/payments" replace /> },
    { path: 'transactions/payment/new', element: <Navigate to="/dashboard/quickbooks/sales/payments/new" replace /> },
    { path: 'transactions/payment/:qbTxnId/edit', element: <LegacyQuickBooksTransactionRedirect to="/dashboard/quickbooks/sales/payments" /> },
    { path: 'transactions/payment/:qbTxnId', element: <LegacyQuickBooksTransactionRedirect to="/dashboard/quickbooks/sales/payments" /> },
    { path: 'home', element: <Navigate to="/dashboard/quickbooks" replace /> },
    { path: 'chart-of-accounts', element: <Navigate to="/dashboard/quickbooks/accounts" replace /> },
    { path: 'live', element: <Navigate to="/dashboard/quickbooks/money" replace /> },
    { path: 'live/*', element: <Navigate to="/dashboard/quickbooks/money" replace /> },
    { path: 'writes', element: <Navigate to="/dashboard/quickbooks/sales" replace /> },
    { path: 'write', element: <Navigate to="/dashboard/quickbooks/sales" replace /> },
    { path: 'write/*', element: <Navigate to="/dashboard/quickbooks/sales" replace /> },
    { path: '*', element: <Navigate to="/404" replace /> }
  ]);

export default QuickbooksRoutes;
