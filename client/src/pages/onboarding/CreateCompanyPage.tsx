import { zodResolver } from '@hookform/resolvers/zod';
import { Autocomplete, Button, CircularProgress, Stack, TextField } from '@mui/material';
import ApartmentIcon from '@mui/icons-material/Apartment';
import DomainAddIcon from '@mui/icons-material/DomainAdd';
import { companyCreateSchema } from '@retailsync/shared';
import { Controller, useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { companyApi } from '../../api';
import { useAppDispatch } from '../../app/store/hooks';
import { fetchMeAndSync } from '../../app/auth/fetchMeAndSync';
import { AuthShell } from '../../components';
import { currencyOptions, SelectOption, timezoneOptions } from '../../lib/constants/companyOptions';
import { useAsyncAction } from '../../lib/hooks/useAsyncAction';

type CompanyForm = z.infer<typeof companyCreateSchema>;

export const CreateCompanyPage = () => {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const {
    register,
    control,
    setValue,
    watch,
    handleSubmit,
    formState: { errors, isSubmitting }
  } = useForm<CompanyForm>({
    resolver: zodResolver(companyCreateSchema),
    defaultValues: {
      timezone: 'America/Los_Angeles',
      currency: 'USD'
    }
  });
  const { loading, runAction } = useAsyncAction();

  const onSubmit = async (values: CompanyForm) => {
    await runAction(
      async () => {
        await companyApi.create(values);
        await fetchMeAndSync(dispatch);
        navigate('/dashboard', { replace: true });
      },
      { successMessage: 'Company created', errorMessage: 'Company creation failed' }
    );
  };

  const timezoneValue = watch('timezone');
  const currencyValue = watch('currency');

  const resolveOption = (options: SelectOption[], value: string | undefined) => {
    if (!value) return null;
    return options.find((option) => option.value === value) ?? null;
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
        <Controller
          control={control}
          name="timezone"
          render={() => (
            <Autocomplete
              options={timezoneOptions}
              value={resolveOption(timezoneOptions, timezoneValue)}
              onChange={(_, option) => setValue('timezone', option?.value ?? '', { shouldValidate: true })}
              isOptionEqualToValue={(option, value) => option.value === value.value}
              getOptionLabel={(option) => option.label}
              renderInput={(params) => (
                <TextField {...params} label="Timezone" error={!!errors.timezone} helperText={errors.timezone?.message} />
              )}
            />
          )}
        />
        <Controller
          control={control}
          name="currency"
          render={() => (
            <Autocomplete
              options={currencyOptions}
              value={resolveOption(currencyOptions, currencyValue)}
              onChange={(_, option) => setValue('currency', option?.value ?? '', { shouldValidate: true })}
              isOptionEqualToValue={(option, value) => option.value === value.value}
              getOptionLabel={(option) => option.label}
              filterOptions={(options, state) => {
                const query = state.inputValue.trim().toLowerCase();
                if (!query) return options;
                return options.filter((option) => option.label.toLowerCase().includes(query) || option.keywords?.includes(query));
              }}
              renderInput={(params) => (
                <TextField {...params} label="Currency" error={!!errors.currency} helperText={errors.currency?.message} />
              )}
            />
          )}
        />
        <Button variant="contained" startIcon={loading ? <CircularProgress size={16} color="inherit" /> : <DomainAddIcon />} type="submit" disabled={isSubmitting || loading}>
          {isSubmitting || loading ? 'Creating...' : 'Create Company'}
        </Button>
      </Stack>
    </AuthShell>
  );
};
