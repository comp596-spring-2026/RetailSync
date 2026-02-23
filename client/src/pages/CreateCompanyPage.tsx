import { zodResolver } from '@hookform/resolvers/zod';
import { Button, Stack, TextField } from '@mui/material';
import ApartmentIcon from '@mui/icons-material/Apartment';
import DomainAddIcon from '@mui/icons-material/DomainAdd';
import { companyCreateSchema } from '@retailsync/shared';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { authApi } from '../api/authApi';
import { companyApi } from '../api/companyApi';
import { useAppDispatch } from '../app/hooks';
import { setAuthContext } from '../features/auth/authSlice';
import { setCompany } from '../features/company/companySlice';
import { showSnackbar } from '../features/ui/uiSlice';
import { AuthShell } from '../components/AuthShell';

type CompanyForm = z.infer<typeof companyCreateSchema>;

export const CreateCompanyPage = () => {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting }
  } = useForm<CompanyForm>({ resolver: zodResolver(companyCreateSchema) });

  const onSubmit = async (values: CompanyForm) => {
    try {
      await companyApi.create(values);
      const meRes = await authApi.me();
      dispatch(setAuthContext({ user: meRes.data.data.user, role: meRes.data.data.role, permissions: meRes.data.data.permissions }));
      dispatch(setCompany(meRes.data.data.company));
      dispatch(showSnackbar({ message: 'Company created', severity: 'success' }));
      navigate('/dashboard', { replace: true });
    } catch (error) {
      dispatch(showSnackbar({ message: 'Company creation failed', severity: 'error' }));
      console.error(error);
    }
  };

  return (
    <AuthShell
      title="Create Company"
      subtitle="Set up your business profile and base configuration."
      icon={<ApartmentIcon color="primary" />}
      width={540}
      logoHeight={96}
    >
      <Stack spacing={2} component="form" onSubmit={handleSubmit(onSubmit)}>
        <TextField label="Company Name" {...register('name')} error={!!errors.name} helperText={errors.name?.message} />
        <TextField label="Business Type" {...register('businessType')} error={!!errors.businessType} helperText={errors.businessType?.message} />
        <TextField label="Address" {...register('address')} error={!!errors.address} helperText={errors.address?.message} />
        <TextField label="Phone" {...register('phone')} error={!!errors.phone} helperText={errors.phone?.message} />
        <TextField label="Company Email" {...register('email')} error={!!errors.email} helperText={errors.email?.message} />
        <TextField label="Timezone" {...register('timezone')} error={!!errors.timezone} helperText={errors.timezone?.message} />
        <TextField label="Currency" {...register('currency')} error={!!errors.currency} helperText={errors.currency?.message} />
        <Button variant="contained" startIcon={<DomainAddIcon />} type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Creating...' : 'Create Company'}
        </Button>
      </Stack>
    </AuthShell>
  );
};
