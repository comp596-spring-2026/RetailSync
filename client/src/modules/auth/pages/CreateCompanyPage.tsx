import { zodResolver } from '@hookform/resolvers/zod';
import { Alert, Button, CircularProgress, Divider, Stack, TextField } from '@mui/material';
import DomainAddIcon from '@mui/icons-material/DomainAdd';
import LinkIcon from '@mui/icons-material/Link';
import { companyCreateSchema } from '@retailsync/shared';
import { useForm } from 'react-hook-form';
import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { z } from 'zod';
import { useAppDispatch } from '../../../app/store/hooks';
import { AuthShell } from '../../../components';
import { useAsyncAction } from '../../../hooks/useAsyncAction';
import { createCompanyThunk } from '../../users/state';
import { clearRegistrationCompanyDraft, readRegistrationCompanyDraft } from './registrationDraft';
import { companyApi } from '../../users/api';
import { showSnackbar } from '../../../app/store/uiSlice';
import { getDefaultCurrencyFromLocale, getDefaultTimezone } from '../../../constants/companyOptions';

type CompanyForm = z.infer<typeof companyCreateSchema>;

export const CreateCompanyPage = () => {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const dispatch = useAppDispatch();
  const draft = readRegistrationCompanyDraft();
  const {
    register,
    setValue,
    getValues,
    handleSubmit,
    formState: { errors, isSubmitting }
  } = useForm<CompanyForm>({
    resolver: zodResolver(companyCreateSchema),
    defaultValues: {
      name: draft?.name ?? '',
      businessType: draft?.businessType ?? '',
      address: draft?.address ?? '',
      phone: draft?.phone ?? '',
      email: draft?.email ?? '',
      timezone: draft?.timezone ?? getDefaultTimezone(),
      currency: draft?.currency ?? getDefaultCurrencyFromLocale()
    }
  });
  const { loading, runAction } = useAsyncAction();
  const [quickbooksConnected, setQuickbooksConnected] = useState(false);
  const [quickbooksCompanyName, setQuickbooksCompanyName] = useState<string | null>(null);

  useEffect(() => {
    const quickbooksStatus = params.get('quickbooks');
    const reason = params.get('reason');

    if (quickbooksStatus === 'connected') {
      dispatch(showSnackbar({ message: 'QuickBooks connected. Finish creating the company to save it.', severity: 'success' }));
      navigate('/onboarding/create-company', { replace: true });
      return;
    }

    if (quickbooksStatus === 'error') {
      dispatch(showSnackbar({ message: reason ? `QuickBooks connection error: ${reason}` : 'QuickBooks connection error.', severity: 'error' }));
      navigate('/onboarding/create-company', { replace: true });
    }
  }, [dispatch, navigate, params]);

  useEffect(() => {
    let cancelled = false;

    void companyApi.getQuickBooksOnboardingStatus().then((response) => {
      if (cancelled) return;
      const pending = response.data.data.quickbooks;
      setQuickbooksConnected(Boolean(pending?.connected));
      setQuickbooksCompanyName(pending?.companyName ?? null);
      if (pending?.companyName && !getValues('name')) {
        setValue('name', pending.companyName, { shouldDirty: true });
      }
    }).catch(() => {
      if (!cancelled) {
        setQuickbooksConnected(false);
        setQuickbooksCompanyName(null);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [getValues, setValue]);

  const submitCompany = async (values: CompanyForm) => {
    await runAction(
      async () => {
        await dispatch(createCompanyThunk(values)).unwrap();
        clearRegistrationCompanyDraft();
        navigate('/dashboard', { replace: true });
      },
      { successMessage: 'Company created', errorMessage: 'Company creation failed' }
    );
  };

  const onConnectCompany = async () => {
    await runAction(
      async () => {
        const response = await companyApi.startQuickBooksOnboarding('/onboarding/create-company');
        const url = response.data.data.url;
        if (typeof window !== 'undefined') {
          window.location.href = url;
        }
      },
      { errorMessage: 'Could not start QuickBooks connection' }
    );
  };

  return (
    <AuthShell
      title="Create Company"
      subtitle="Set up your business profile, then choose how you want to continue."
      width={540}
      logoHeight={50}
    >
      <Stack
        component="form"
        onSubmit={handleSubmit((values) => submitCompany(values))}
        spacing={3}
      >
        <TextField
          fullWidth
          label="Company Name"
          {...register('name')}
          error={!!errors.name}
          helperText={errors.name?.message}
        />
        <TextField
          fullWidth
          label="Business Type"
          {...register('businessType')}
          error={!!errors.businessType}
          helperText={errors.businessType?.message}
        />
        <TextField label="Address" {...register('address')} error={!!errors.address} helperText={errors.address?.message} />
        <TextField
          fullWidth
          label="Phone"
          {...register('phone')}
          error={!!errors.phone}
          helperText={errors.phone?.message}
        />
        <TextField
          fullWidth
          label="Company Email"
          {...register('email')}
          error={!!errors.email}
          helperText={errors.email?.message}
        />
        {quickbooksConnected && (
          <Alert severity="success">
            QuickBooks connected{quickbooksCompanyName ? `: ${quickbooksCompanyName}` : ''}. Create the company to save this integration.
          </Alert>
        )}
        <Button
          type="submit"
          variant="contained"
          startIcon={loading ? <CircularProgress size={16} color="inherit" /> : <DomainAddIcon />}
          disabled={isSubmitting || loading}
          fullWidth
        >
          {isSubmitting || loading ? 'Creating...' : 'Create company'}
        </Button>
        <Divider sx={{ pt: 1 }}>or</Divider>
        <Button
          variant="outlined"
          startIcon={loading ? <CircularProgress size={16} color="inherit" /> : <LinkIcon />}
          onClick={onConnectCompany}
          disabled={isSubmitting || loading}
          fullWidth
        >
          {loading ? 'Connecting...' : 'Connect company'}
        </Button>
      </Stack>
    </AuthShell>
  );
};
