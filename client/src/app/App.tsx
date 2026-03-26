import { Navigate, Route, Routes } from "react-router-dom";
import { useAppSelector } from "./store/hooks";
import { OnboardingGuard, ProtectedRoute } from "./guards";
import { DashboardLayout } from "./layout/DashboardLayout";
import {
  CreateCompanyPage,
  GoogleAuthSuccessPage,
  JoinCompanyPage,
  LoginPage,
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
import {
  DashboardHomePage,
  InventoryPage,
  InventoryWorkspacePage,
  ItemsPage,
  LocationsPage
} from "../modules/inventory/pages";
import { PosPage } from "../modules/pos/pages";
import { ProcurementHubPage } from "../modules/procurement/pages";
import { RolesPage } from "../modules/rbac/pages";
import { SettingsPage } from "../modules/settings/pages";
import { AccessHubPage, UsersPage } from "../modules/users/pages";
import { ModuleShellPage } from "../layout/ModuleShellPage";
import {
  LedgerPage,
  QuickBooksChecksPage,
  QuickBooksChartOfAccountsPage,
  QuickBooksCustomersPage,
  QuickBooksAccountRegisterPage,
  QuickBooksHomePage,
  QuickBooksDepositsPage,
  QuickBooksOperationsPage,
  QuickBooksExpensesPage,
  QuickBooksReportsPage,
  QuickBooksWriteCreatePage,
  QuickBooksWriteDetailPage,
  QuickBooksWriteEditPage,
  QuickBooksWriteListPage,
  ObservabilityPage,
  QuickBooksTransactionDetailPage,
  StatementDetailPage,
  StatementsPage,
  QuickBooksTransfersPage,
  QuickBooksVendorsPage,
  TaxDashboardPage
} from "../modules/accounting/pages";
import { hasPermission } from "../utils/permissions";

const AccountingIndexRedirect = () => {
  const permissions = useAppSelector((state) => state.auth.permissions);

  if (hasPermission(permissions, 'bankStatements', 'view')) {
    return <Navigate to="statements" replace />;
  }
  if (hasPermission(permissions, 'ledger', 'view')) {
    return <Navigate to="ledger" replace />;
  }
  if (hasPermission(permissions, 'accounting', 'view')) {
    return <Navigate to="observability" replace />;
  }

  return <Navigate to="/403" replace />;
};

const QuickBooksIndexRedirect = () => {
  const permissions = useAppSelector((state) => state.auth.permissions);

  if (hasPermission(permissions, 'quickbooks', 'view')) {
    return <QuickBooksHomePage />;
  }
  if (hasPermission(permissions, 'ledger', 'view')) {
    return <Navigate to="operations" replace />;
  }

  return <Navigate to="/403" replace />;
};

const App = () => {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="/home-demo" element={<HomeDemoPage />} />
      <Route path="/login" element={<LoginPage />} />
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
          <Route path="roles" element={<RolesPage />} />
          <Route path="users" element={<UsersPage />} />
          <Route path="operations" element={<InventoryWorkspacePage />} />
          <Route path="procurement" element={<ProcurementHubPage />} />
          <Route path="access" element={<AccessHubPage />} />
          <Route path="pos" element={<PosPage />} />
          <Route path="items" element={<ItemsPage />} />
          <Route path="invoices" element={<ModuleShellPage module="invoices" />} />
          <Route path="inventory" element={<InventoryPage />} />
          <Route path="locations" element={<LocationsPage />} />
          <Route
            path="reconciliation"
            element={<ModuleShellPage module="reconciliation" />}
          />
          <Route
            path="bankStatements"
            element={<ModuleShellPage module="bankStatements" />}
          />
          <Route path="suppliers" element={<ModuleShellPage module="suppliers" />} />
          <Route path="playground" element={<PlaygroundPage />} />
          <Route
            path="rolesSettings"
            element={<ModuleShellPage module="rolesSettings" />}
          />
          <Route path="accounting">
            <Route index element={<AccountingIndexRedirect />} />
            <Route path="statements" element={<StatementsPage />} />
            <Route path="statements/:statementId" element={<StatementDetailPage />} />
            <Route path="ledger" element={<LedgerPage />} />
            <Route path="registers/:accountId" element={<QuickBooksAccountRegisterPage />} />
            <Route path="transactions">
              <Route index element={<Navigate to="deposits" replace />} />
              <Route path="deposits" element={<QuickBooksDepositsPage />} />
              <Route path="checks" element={<QuickBooksChecksPage />} />
              <Route path="expenses" element={<QuickBooksExpensesPage />} />
              <Route path="transfers" element={<QuickBooksTransfersPage />} />
              <Route path=":type/:qbTxnId" element={<QuickBooksTransactionDetailPage />} />
            </Route>
            <Route path="quickbooks" element={<Navigate to="/dashboard/quickbooks" replace />} />
            <Route path="tax" element={<Navigate to="/dashboard/quickbooks/tax" replace />} />
            <Route path="observability" element={<ObservabilityPage />} />
          </Route>
          <Route path="quickbooks">
            <Route index element={<QuickBooksIndexRedirect />} />
            <Route path="chart-of-accounts" element={<QuickBooksChartOfAccountsPage />} />
            <Route path="customers" element={<QuickBooksCustomersPage />} />
            <Route path="vendors" element={<QuickBooksVendorsPage />} />
            <Route path="reports" element={<QuickBooksReportsPage />} />
            <Route path="operations" element={<QuickBooksOperationsPage />} />
            <Route path="tax" element={<TaxDashboardPage />} />
            <Route path="write">
              <Route index element={<Navigate to="sales-receipt" replace />} />
              <Route path=":txnType" element={<QuickBooksWriteListPage />} />
              <Route path=":txnType/new" element={<QuickBooksWriteCreatePage />} />
              <Route path=":txnType/:qbTxnId" element={<QuickBooksWriteDetailPage />} />
              <Route path=":txnType/:qbTxnId/edit" element={<QuickBooksWriteEditPage />} />
            </Route>
          </Route>
          <Route path="settings" element={<SettingsPage />} />
        </Route>
      </Route>
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
};

export default App;
