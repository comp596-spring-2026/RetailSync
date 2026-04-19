import { Navigate, Route, Routes, useLocation, useParams } from "react-router-dom";
import { useAppSelector } from "./store/hooks";
import { OnboardingGuard, ProtectedRoute } from "./guards";
import { DashboardLayout } from "./layout/DashboardLayout";
import {
  AcceptInvitePage,
  CreateCompanyPage,
  ForgotPasswordPage,
  GoogleAuthSuccessPage,
  JoinCompanyPage,
  LoginPage,
  RegisterPage,
  ResetPasswordPage,
  VerifyEmailPage,
  OnboardingPage
} from "../modules/auth/pages";
import {
  DataDeletionPage,
  ForbiddenPage,
  HomeDemoPage,
  NotFoundPage,
  PlaygroundPage,
  PrivacyPage,
  ServerErrorPage,
  TermsPage,
  UnauthorizedPage
} from "../modules/dev/pages";
import { DashboardHomePage } from "./pages/DashboardHomePage";
import { POSWorkspacePage } from "../modules/pos/pages";
import { ProcurementHubPage } from "../modules/procurement/pages";
import { RolesPage } from "../modules/rbac/pages";
import { SettingsPage } from "../modules/settings/pages";
import { AccessWorkspacePage, UsersPage } from "../modules/users/pages";
import { QuickBooksRoutes } from "../modules/quickbooks/QuickBooksRoutes";
import {
  StatementDetailPage,
  StatementsPage,
  TaxDashboardPage
} from "../modules/accounting/pages";
import { hasPermission } from "../utils/permissions";

const AccountingIndexRedirect = () => {
  const permissions = useAppSelector((state) => state.auth.permissions);

  if (hasPermission(permissions, 'bankStatements', 'view')) {
    return <Navigate to="statements" replace />;
  }

  return <Navigate to="/403" replace />;
};

const QuickBooksIndexRedirect = () => {
  const permissions = useAppSelector((state) => state.auth.permissions);

  if (hasPermission(permissions, 'quickbooks', 'view')) {
    return <Navigate to="/dashboard/quickbooks" replace />;
  }

  return <Navigate to="/403" replace />;
};

const AccessIndexRedirect = () => {
  const permissions = useAppSelector((state) => state.auth.permissions);

  if (hasPermission(permissions, 'users', 'view')) {
    return <Navigate to="users" replace />;
  }

  if (hasPermission(permissions, 'rolesSettings', 'view')) {
    return <Navigate to="roles" replace />;
  }

  return <Navigate to="/403" replace />;
};

const AccountingRegisterRedirect = () => {
  const { accountId } = useParams<{ accountId: string }>();
  return <Navigate to={accountId ? `/dashboard/quickbooks/accounts/${accountId}/register` : '/dashboard/quickbooks/accounts'} replace />;
};

const AccountingTransactionsRedirect = () => {
  const location = useLocation();
  const pathname = location.pathname;

  if (pathname.includes('/transactions/deposit')) {
    return <Navigate to={pathname.replace('/dashboard/accounting/transactions/deposit', '/dashboard/quickbooks/money/deposits')} replace />;
  }

  if (pathname.includes('/transactions/check')) {
    return <Navigate to={pathname.replace('/dashboard/accounting/transactions/check', '/dashboard/quickbooks/money/checks')} replace />;
  }

  if (pathname.includes('/transactions/expense')) {
    return <Navigate to={pathname.replace('/dashboard/accounting/transactions/expense', '/dashboard/quickbooks/money/expenses')} replace />;
  }

  if (pathname.includes('/transactions/transfer')) {
    return <Navigate to={pathname.replace('/dashboard/accounting/transactions/transfer', '/dashboard/quickbooks/money/transfers')} replace />;
  }

  if (pathname.includes('/transactions/invoice')) {
    return <Navigate to={pathname.replace('/dashboard/accounting/transactions/invoice', '/dashboard/quickbooks/sales/invoices')} replace />;
  }

  if (pathname.includes('/transactions/payment')) {
    return <Navigate to={pathname.replace('/dashboard/accounting/transactions/payment', '/dashboard/quickbooks/sales/payments')} replace />;
  }

  return <Navigate to="/dashboard/quickbooks/sales" replace />;
};

const App = () => {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="/home-demo" element={<HomeDemoPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/accept-invite" element={<AcceptInvitePage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/verify-email" element={<VerifyEmailPage />} />
      <Route path="/auth/google/success" element={<GoogleAuthSuccessPage />} />
      <Route path="/401" element={<UnauthorizedPage />} />
      <Route path="/403" element={<ForbiddenPage />} />
      <Route path="/404" element={<NotFoundPage />} />
      <Route path="/500" element={<ServerErrorPage />} />
      <Route path="/playground" element={<PlaygroundPage />} />
      <Route path="/privacy" element={<PrivacyPage />} />
      <Route path="/terms" element={<TermsPage />} />
      <Route path="/data-deletion" element={<DataDeletionPage />} />

      <Route element={<OnboardingGuard />}>
        <Route path="/onboarding" element={<OnboardingPage />} />
        <Route
          path="/onboarding/create-company"
          element={<CreateCompanyPage />}
        />
        <Route path="/onboarding/join-company" element={<JoinCompanyPage />} />
      </Route>

      <Route element={<ProtectedRoute />}>
        <Route path="/dashboard" element={<DashboardLayout />}>
          <Route index element={<DashboardHomePage />} />
          <Route path="procurement" element={<ProcurementHubPage />} />
          <Route path="users" element={<Navigate to="/dashboard/access/users" replace />} />
          <Route path="roles" element={<Navigate to="/dashboard/access/roles" replace />} />
          <Route path="access" element={<AccessWorkspacePage />}>
            <Route index element={<AccessIndexRedirect />} />
            <Route path="users" element={<UsersPage showHeader={false} />} />
            <Route path="roles" element={<RolesPage showHeader={false} />} />
            <Route path="settings" element={<Navigate to="/dashboard/settings" replace />} />
          </Route>
          <Route path="pos" element={<POSWorkspacePage />} />
          <Route path="invoices" element={<Navigate to="/dashboard/procurement" replace />} />
          <Route path="reconciliation" element={<Navigate to="/dashboard/accounting" replace />} />
          <Route path="bankStatements" element={<Navigate to="/dashboard/accounting/statements" replace />} />
          <Route path="suppliers" element={<Navigate to="/dashboard/procurement" replace />} />
          <Route path="playground" element={<PlaygroundPage />} />
          <Route path="rolesSettings" element={<Navigate to="/dashboard/access/roles" replace />} />
          <Route path="accounting">
            <Route index element={<AccountingIndexRedirect />} />
            <Route path="statements" element={<StatementsPage />} />
            <Route path="statements/:statementId" element={<StatementDetailPage />} />
            <Route path="ledger" element={<Navigate to="/dashboard/accounting/statements" replace />} />
            <Route path="quickbooks">
              <Route index element={<Navigate to="/dashboard/quickbooks" replace />} />
              <Route path="*" element={<Navigate to="/dashboard/quickbooks" replace />} />
            </Route>
            <Route path="registers/:accountId" element={<AccountingRegisterRedirect />} />
            <Route path="transactions/*" element={<AccountingTransactionsRedirect />} />
            <Route path="tax" element={<TaxDashboardPage />} />
            <Route path="observability" element={<Navigate to="/dashboard/accounting/statements" replace />} />
          </Route>
          <Route path="quickbooks/*" element={<QuickBooksRoutes />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
      </Route>
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
};

export default App;
