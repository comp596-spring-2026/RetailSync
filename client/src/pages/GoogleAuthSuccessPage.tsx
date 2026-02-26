import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { authApi } from '../api/authApi';
import { useAppDispatch } from '../app/store/hooks';
import { setAccessToken, setAuthContext } from '../features/auth/authSlice';
import { setCompany } from '../features/company/companySlice';
import { showSnackbar } from '../features/ui/uiSlice';
import { WonderLoader } from '../components/WonderLoader';

export const GoogleAuthSuccessPage = () => {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const dispatch = useAppDispatch();

  useEffect(() => {
    const accessToken = params.get('accessToken');
    if (!accessToken) {
      dispatch(showSnackbar({ message: 'Google login failed: access token missing', severity: 'error' }));
      navigate('/login', { replace: true });
      return;
    }

    const complete = async () => {
      try {
        dispatch(setAccessToken(accessToken));
        const meRes = await authApi.me();
        dispatch(
          setAuthContext({
            user: meRes.data.data.user,
            role: meRes.data.data.role,
            permissions: meRes.data.data.permissions
          })
        );
        if (meRes.data.data.company) {
          dispatch(setCompany(meRes.data.data.company));
          navigate('/dashboard', { replace: true });
        } else {
          navigate('/onboarding', { replace: true });
        }
      } catch (error) {
        console.error(error);
        dispatch(showSnackbar({ message: 'Google login failed', severity: 'error' }));
        navigate('/login', { replace: true });
      }
    };

    void complete();
  }, [dispatch, navigate, params]);

  return <WonderLoader label="Completing Google sign-in..." />;
};

