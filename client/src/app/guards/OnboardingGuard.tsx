import { Navigate, Outlet } from 'react-router-dom';
import { WonderLoader } from '../../components';
import { useAppSelector } from '../store/hooks';

export const OnboardingGuard = () => {
  const user = useAppSelector((state) => state.auth.user);
  const { accessToken, isContextReady, isRehydrated } = useAppSelector((state) => state.auth);

  if (!isRehydrated || (accessToken && !isContextReady)) {
    return <WonderLoader fullscreen label="Restoring access..." />;
  }

  if (!accessToken) {
    return <Navigate to="/login" replace />;
  }

  if (user?.companyId) {
    return <Navigate to="/dashboard" replace />;
  }

  return <Outlet />;
};
