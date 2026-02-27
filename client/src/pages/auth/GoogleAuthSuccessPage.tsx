import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAppDispatch } from '../../app/store/hooks';
import { fetchMeAndSync } from '../../app/auth/fetchMeAndSync';
import { setAccessToken } from '../../slices/auth/authSlice';
import { showSnackbar } from '../../slices/ui/uiSlice';
import { WonderLoader } from '../../components';

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
        const data = await fetchMeAndSync(dispatch);
        navigate(data.company ? '/dashboard' : '/onboarding', { replace: true });
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

