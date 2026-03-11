import { Navigate, Route, Routes } from "react-router-dom";
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
  ObservabilityPage,
  QuickBooksSyncPage,
  StatementDetailPage,
  StatementsPage,
  TaxDashboardPage
} from "../modules/accounting/pages";

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
            <Route index element={<Navigate to="statements" replace />} />
            <Route path="statements" element={<StatementsPage />} />
            <Route path="statements/:statementId" element={<StatementDetailPage />} />
            <Route path="ledger" element={<LedgerPage />} />
            <Route path="quickbooks" element={<QuickBooksSyncPage />} />
            <Route path="tax" element={<TaxDashboardPage />} />
            <Route path="observability" element={<ObservabilityPage />} />
          </Route>
          <Route path="settings" element={<SettingsPage />} />
        </Route>
      </Route>
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
};

export default App;
