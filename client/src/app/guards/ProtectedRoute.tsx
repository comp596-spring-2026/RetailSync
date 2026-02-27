import { Navigate, Outlet } from 'react-router-dom';
import { useAppSelector } from '../store/hooks';

export const ProtectedRoute = () => {
  const token = useAppSelector((state) => state.auth.accessToken);
  if (!token) {
    return <Navigate to="/401" replace />;
  }

  return <Outlet />;
};
