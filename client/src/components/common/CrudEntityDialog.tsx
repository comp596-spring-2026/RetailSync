import { useEffect, useMemo, useState } from 'react';
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Stack,
  TextField
} from '@mui/material';

export type CrudFieldOption = {
  label: string;
  value: string;
};

export type CrudField = {
  key: string;
  label: string;
  required?: boolean;
  multiline?: boolean;
  options?: CrudFieldOption[];
};

type CrudEntityDialogProps = {
  open: boolean;
  title: string;
  fields: CrudField[];
  loading?: boolean;
  initialValues?: Record<string, string>;
  onClose: () => void;
  onSubmit: (values: Record<string, string>) => void;
};

const buildDefaults = (fields: CrudField[], initialValues: Record<string, string> = {}) => {
  return fields.reduce<Record<string, string>>((acc, field) => {
    acc[field.key] = initialValues[field.key] ?? '';
    return acc;
  }, {});
};

export const CrudEntityDialog = ({
  open,
  title,
  fields,
  loading = false,
  initialValues,
  onClose,
  onSubmit
}: CrudEntityDialogProps) => {
  const [values, setValues] = useState<Record<string, string>>(() => buildDefaults(fields, initialValues));
  const [errors, setErrors] = useState<Record<string, string>>({});

  const defaults = useMemo(() => buildDefaults(fields, initialValues), [fields, initialValues]);

  useEffect(() => {
    if (open) {
      setValues(defaults);
      setErrors({});
    }
  }, [defaults, open]);

  const submit = () => {
    const nextErrors = fields.reduce<Record<string, string>>((acc, field) => {
      if (field.required && !values[field.key]?.trim()) {
        acc[field.key] = `${field.label} is required`;
      }
      return acc;
    }, {});

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    onSubmit(values);
  };

  return (
    <Dialog open={open} onClose={loading ? undefined : onClose} fullWidth maxWidth="sm">
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          {fields.map((field) =>
            field.options ? (
              <TextField
                key={field.key}
                select
                label={field.label}
                value={values[field.key] ?? ''}
                onChange={(event) =>
                  setValues((prev) => ({
                    ...prev,
                    [field.key]: event.target.value
                  }))
                }
                error={Boolean(errors[field.key])}
                helperText={errors[field.key]}
              >
                {field.options.map((option) => (
                  <MenuItem key={option.value} value={option.value}>
                    {option.label}
                  </MenuItem>
                ))}
              </TextField>
            ) : (
              <TextField
                key={field.key}
                label={field.label}
                value={values[field.key] ?? ''}
                onChange={(event) =>
                  setValues((prev) => ({
                    ...prev,
                    [field.key]: event.target.value
                  }))
                }
                error={Boolean(errors[field.key])}
                helperText={errors[field.key]}
                multiline={field.multiline}
                minRows={field.multiline ? 3 : undefined}
              />
            )
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={loading}>
          Cancel
        </Button>
        <Button onClick={submit} variant="contained" disabled={loading}>
          {loading ? 'Saving...' : 'Save'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};
