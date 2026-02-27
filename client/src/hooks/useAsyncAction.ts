import { useState } from 'react';
import { useAppDispatch } from '../app/store/hooks';
import { showSnackbar } from '../slices/ui/uiSlice';
import { extractApiErrorMessage } from '../utils/apiError';

type AsyncFeedback = {
  successMessage?: string;
  errorMessage?: string;
};

export const useAsyncAction = () => {
  const dispatch = useAppDispatch();
  const [loading, setLoading] = useState(false);

  const runAction = async <T>(action: () => Promise<T>, feedback: AsyncFeedback = {}) => {
    setLoading(true);
    try {
      const result = await action();
      if (feedback.successMessage) {
        dispatch(showSnackbar({ message: feedback.successMessage, severity: 'success' }));
      }
      return result;
    } catch (error) {
      dispatch(
        showSnackbar({
          message: extractApiErrorMessage(error, feedback.errorMessage ?? 'Something went wrong'),
          severity: 'error'
        })
      );
      throw error;
    } finally {
      setLoading(false);
    }
  };

  return { loading, runAction };
};


