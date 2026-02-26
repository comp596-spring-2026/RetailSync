import { Navigate, Outlet } from 'react-router-dom';
import { useAppSelector } from '../app/store/hooks';

export const OnboardingGuard = () => {
  const user = useAppSelector((state) => state.auth.user);
  const token = useAppSelector((state) => state.auth.accessToken);

  if (!token) {
    return <Navigate to="/login" replace />;
  }

  if (user?.companyId) {
    return <Navigate to="/dashboard" replace />;
  }

  return <Outlet />;
};
