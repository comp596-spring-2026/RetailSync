import { Navigate, useParams, useRoutes } from 'react-router-dom';
import QuickBooksDashboard from './QuickBooksDashboard';
import AccountsPage from './pages/Accounts';
import AccountRegisterPage from './pages/AccountRegister';
import ChecksPage from './pages/Checks';
import ContactsPage from './pages/Contacts';
import DepositsPage from './pages/Deposits';
import ExpensesPage from './pages/Expenses';
import MoneyCreatePage from './pages/MoneyCreate';
import MoneyEditPage from './pages/MoneyEdit';
import MoneyPage from './pages/Money';
import OperationsPage from './pages/Operations';
import ReportsPage from './pages/Reports';
import SalesPage from './pages/Sales';
import TaxPage from './pages/Tax';
import TransactionDetailPage from './pages/TransactionDetail';
import TransfersPage from './pages/Transfers';
import WriteCreatePage from './pages/WriteCreate';
import WriteDetailPage from './pages/WriteDetail';
import WriteEditPage from './pages/WriteEdit';
import WriteListPage from './pages/WriteList';

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

export const QuickBooksRoutes = () =>
  useRoutes([
    { index: true, element: <QuickBooksDashboard /> },
    { path: 'accounts', element: <AccountsPage /> },
    { path: 'accounts/:accountId/register', element: <AccountRegisterPage /> },
    { path: 'contacts', element: <ContactsPage /> },
    { path: 'customers', element: <Navigate to="/dashboard/quickbooks/contacts" replace /> },
    { path: 'vendors', element: <Navigate to="/dashboard/quickbooks/contacts" replace /> },
    { path: 'operations', element: <OperationsPage /> },
    { path: 'reports', element: <ReportsPage /> },
    { path: 'tax', element: <TaxPage /> },
    { path: 'sales', element: <SalesPage /> },
    { path: 'sales/invoices', element: <WriteListPage /> },
    { path: 'sales/invoices/new', element: <WriteCreatePage /> },
    { path: 'sales/invoices/:qbTxnId/edit', element: <WriteEditPage /> },
    { path: 'sales/invoices/:qbTxnId', element: <WriteDetailPage /> },
    { path: 'sales/payments', element: <WriteListPage /> },
    { path: 'sales/payments/new', element: <WriteCreatePage /> },
    { path: 'sales/payments/:qbTxnId/edit', element: <WriteEditPage /> },
    { path: 'sales/payments/:qbTxnId', element: <WriteDetailPage /> },
    { path: 'money', element: <MoneyPage /> },
    { path: 'money/deposits', element: <DepositsPage /> },
    { path: 'money/deposits/new', element: <MoneyCreatePage /> },
    { path: 'money/checks', element: <ChecksPage /> },
    { path: 'money/checks/new', element: <MoneyCreatePage /> },
    { path: 'money/expenses', element: <ExpensesPage /> },
    { path: 'money/expenses/new', element: <MoneyCreatePage /> },
    { path: 'money/transfers', element: <TransfersPage /> },
    { path: 'money/transfers/new', element: <MoneyCreatePage /> },
    { path: 'money/deposits/:qbTxnId/edit', element: <MoneyEditPage /> },
    { path: 'money/deposits/:qbTxnId', element: <TransactionDetailPage /> },
    { path: 'money/checks/:qbTxnId/edit', element: <MoneyEditPage /> },
    { path: 'money/checks/:qbTxnId', element: <TransactionDetailPage /> },
    { path: 'money/expenses/:qbTxnId/edit', element: <MoneyEditPage /> },
    { path: 'money/expenses/:qbTxnId', element: <TransactionDetailPage /> },
    { path: 'money/transfers/:qbTxnId/edit', element: <MoneyEditPage /> },
    { path: 'money/transfers/:qbTxnId', element: <TransactionDetailPage /> },
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

export default QuickBooksRoutes;
