import { Navigate, Outlet } from 'react-router-dom';
import { WonderLoader } from '../../components';
import { useAppSelector } from '../store/hooks';

export const ProtectedRoute = () => {
  const { accessToken, isContextReady, isRehydrated } = useAppSelector((state) => state.auth);
  const token = accessToken;

  if (!isRehydrated || (token && !isContextReady)) {
    return <WonderLoader fullscreen label="Restoring access..." />;
  }

  if (!token) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
};
