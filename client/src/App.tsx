import { Navigate, Route, Routes } from 'react-router-dom';
import { ProtectedRoute } from './components/ProtectedRoute';
import { OnboardingGuard } from './components/OnboardingGuard';
import { DashboardLayout } from './layouts/DashboardLayout';
import { RegisterPage } from './pages/RegisterPage';
import { LoginPage } from './pages/LoginPage';
import { OnboardingPage } from './pages/OnboardingPage';
import { CreateCompanyPage } from './pages/CreateCompanyPage';
import { JoinCompanyPage } from './pages/JoinCompanyPage';
import { DashboardHomePage } from './pages/DashboardHomePage';
import { ModuleShellPage } from './pages/ModuleShellPage';
import { RolesPage } from './pages/RolesPage';
import { UsersPage } from './pages/UsersPage';
import { PosPage } from './pages/PosPage';
import { ReportsPage } from './pages/ReportsPage';
import { ItemsPage } from './pages/ItemsPage';
import { LocationsPage } from './pages/LocationsPage';
import { InventoryPage } from './pages/InventoryPage';

const App = () => {
  return (
    <Routes>
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/login" element={<LoginPage />} />

      <Route element={<OnboardingGuard />}>
        <Route path="/onboarding" element={<OnboardingPage />} />
        <Route path="/onboarding/create-company" element={<CreateCompanyPage />} />
        <Route path="/onboarding/join-company" element={<JoinCompanyPage />} />
      </Route>

      <Route element={<ProtectedRoute />}>
        <Route path="/dashboard" element={<DashboardLayout />}>
          <Route index element={<DashboardHomePage />} />
          <Route path="roles" element={<RolesPage />} />
          <Route path="users" element={<UsersPage />} />
          <Route path="pos" element={<PosPage />} />
          <Route path="items" element={<ItemsPage />} />
          <Route path="invoices" element={<ModuleShellPage module="invoices" />} />
          <Route path="inventory" element={<InventoryPage />} />
          <Route path="locations" element={<LocationsPage />} />
          <Route path="reconciliation" element={<ModuleShellPage module="reconciliation" />} />
          <Route path="bankStatements" element={<ModuleShellPage module="bankStatements" />} />
          <Route path="suppliers" element={<ModuleShellPage module="suppliers" />} />
          <Route path="reports" element={<ReportsPage />} />
          <Route path="rolesSettings" element={<ModuleShellPage module="rolesSettings" />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
};

export default App;
