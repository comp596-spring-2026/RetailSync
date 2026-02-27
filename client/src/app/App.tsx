import { Navigate, Route, Routes } from "react-router-dom";
import { OnboardingGuard, ProtectedRoute } from "./guards";
import { DashboardLayout } from "./layout/DashboardLayout";
import { LoginPage } from "../pages/auth/LoginPage";
import { GoogleAuthSuccessPage } from "../pages/auth/GoogleAuthSuccessPage";
import { OnboardingPage } from "../pages/onboarding/OnboardingPage";
import { CreateCompanyPage } from "../pages/onboarding/CreateCompanyPage";
import { JoinCompanyPage } from "../pages/onboarding/JoinCompanyPage";
import { DashboardHomePage } from "../pages/dashboard/DashboardHomePage";
import { ModuleShellPage } from "../pages/dashboard/ModuleShellPage";
import { RolesPage } from "../pages/dashboard/RolesPage";
import { UsersPage } from "../pages/dashboard/UsersPage";
import { PosPage } from "../pages/dashboard/PosPage";
import { ReportsPage } from "../pages/dashboard/ReportsPage";
import { ItemsPage } from "../pages/dashboard/ItemsPage";
import { LocationsPage } from "../pages/dashboard/LocationsPage";
import { InventoryPage } from "../pages/dashboard/InventoryPage";
import { SettingsPage } from "../pages/dashboard/SettingsPage";
import { OperationsHubPage } from "../pages/dashboard/OperationsHubPage";
import { ProcurementHubPage } from "../pages/dashboard/ProcurementHubPage";
import { AccessHubPage } from "../pages/dashboard/AccessHubPage";
import { PlaygroundPage } from "../pages/dashboard/PlaygroundPage";
import { PrivacyPage } from "../pages/legal/PrivacyPage";
import { TermsPage } from "../pages/legal/TermsPage";
import { DataDeletionPage } from "../pages/legal/DataDeletionPage";
import { HomeDemoPage } from "../pages/demo/HomeDemoPage";
import { ForbiddenPage, NotFoundPage, ServerErrorPage, UnauthorizedPage } from "../pages/errors";

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
          <Route path="operations" element={<OperationsHubPage />} />
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
          <Route path="reports" element={<ReportsPage />} />
          <Route path="playground" element={<PlaygroundPage />} />
          <Route
            path="rolesSettings"
            element={<ModuleShellPage module="rolesSettings" />}
          />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
      </Route>
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
};

export default App;
