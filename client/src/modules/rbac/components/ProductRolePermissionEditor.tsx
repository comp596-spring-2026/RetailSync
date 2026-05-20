import {
  Box,
  Checkbox,
  Divider,
  FormControlLabel,
  Paper,
  Stack,
  Typography
} from '@mui/material';
import {
  emptyProductPermissions,
  productCapabilityGroups,
  productPermissionsExceedActor,
  legacyPermissionsToProduct,
  productPermissionsToLegacy,
  ROLE_DELEGATION_FORBIDDEN_MESSAGE,
  type PermissionsMap,
  type ProductCapabilityGroup,
  type ProductCapabilityKey
} from '@retailsync/shared';
import { useMemo } from 'react';

type Props = {
  value: Record<ProductCapabilityKey, boolean>;
  actorPermissions: PermissionsMap;
  readOnly?: boolean;
  embedded?: boolean;
  onChange: (next: Record<ProductCapabilityKey, boolean>) => void;
};

const DASHBOARD_CAPABILITY: ProductCapabilityKey = 'dashboard.show';

const LEFT_COLUMN_GROUP_KEYS = new Set(['core', 'pos', 'accounting', 'settings']);
const RIGHT_COLUMN_GROUP_KEYS = new Set(['quickbooks']);

const ACCESS_SUBSECTIONS = [
  {
    key: 'users',
    label: 'Users',
    capabilities: [
      'access.users.view',
      'access.users.invite',
      'access.users.assignRoles',
      'access.users.deactivate'
    ] as ProductCapabilityKey[]
  },
  {
    key: 'roles',
    label: 'Roles & Permissions',
    capabilities: [
      'access.roles.view',
      'access.roles.create',
      'access.roles.edit',
      'access.roles.delete'
    ] as ProductCapabilityKey[]
  }
] as const;

const capabilityMeta = () => {
  const parents = new Map<ProductCapabilityKey, ProductCapabilityKey | undefined>();
  const children = new Map<ProductCapabilityKey, ProductCapabilityKey[]>();
  const labels = new Map<ProductCapabilityKey, string>();

  for (const group of productCapabilityGroups) {
    for (const capability of group.capabilities) {
      parents.set(capability.key, capability.parentKey);
      labels.set(capability.key, capability.label);
      if (capability.parentKey) {
        const list = children.get(capability.parentKey) ?? [];
        list.push(capability.key);
        children.set(capability.parentKey, list);
      }
    }
  }

  return { parents, children, labels };
};

const { parents: CAPABILITY_PARENT, children: CAPABILITY_CHILDREN, labels: CAPABILITY_LABELS } =
  capabilityMeta();

export const applyCapabilityChange = (
  current: Record<ProductCapabilityKey, boolean>,
  key: ProductCapabilityKey,
  checked: boolean
) => {
  const next = { ...current, [key]: checked };

  if (!checked) {
    for (const childKey of CAPABILITY_CHILDREN.get(key) ?? []) {
      next[childKey] = false;
    }
    return next;
  }

  let parentKey = CAPABILITY_PARENT.get(key);
  while (parentKey) {
    next[parentKey] = true;
    parentKey = CAPABILITY_PARENT.get(parentKey);
  }

  return next;
};

export const ensureUniversalProductPermissions = (
  product: Record<ProductCapabilityKey, boolean>
): Record<ProductCapabilityKey, boolean> => ({
  ...product,
  [DASHBOARD_CAPABILITY]: true
});

/** Defaults for new custom roles: universal dashboard + settings visibility. */
export const createDefaultCustomRoleProductState = () => {
  const product = emptyProductPermissions();
  product[DASHBOARD_CAPABILITY] = true;
  product['settings.show'] = true;
  return product;
};

const checkboxSx = {
  color: 'action.disabled',
  '&.Mui-checked': {
    color: 'success.main'
  },
  '&.Mui-disabled': {
    color: 'action.disabled'
  }
};

type CapabilityRowProps = {
  capabilityKey: ProductCapabilityKey;
  label: string;
  depth: number;
  checked: boolean;
  disabled: boolean;
  readOnly: boolean;
  onToggle: (key: ProductCapabilityKey, checked: boolean) => void;
  helperText?: string;
};

const CapabilityRow = ({
  capabilityKey,
  label,
  depth,
  checked,
  disabled,
  readOnly,
  onToggle,
  helperText
}: CapabilityRowProps) => (
  <Box sx={{ pl: depth * 2.5 }}>
    <FormControlLabel
      sx={{
        alignItems: 'flex-start',
        mx: 0,
        opacity: disabled ? 0.55 : 1
      }}
      control={
        <Checkbox
          size="small"
          checked={checked}
          disabled={disabled}
          inputProps={{ 'aria-label': label }}
          onChange={(event) => onToggle(capabilityKey, event.target.checked)}
          sx={checkboxSx}
        />
      }
      label={
        <Stack spacing={0.25}>
          <Typography variant="body2">{label}</Typography>
          {helperText ? (
            <Typography variant="caption" color="text.secondary">
              {helperText}
            </Typography>
          ) : null}
        </Stack>
      }
    />
  </Box>
);

const GroupSectionDivider = () => (
  <Box sx={{ borderBottom: 1, borderColor: 'divider', mx: 2 }} />
);

export const ProductRolePermissionEditor = ({
  value,
  actorPermissions,
  readOnly = false,
  embedded = false,
  onChange
}: Props) => {
  const actorProduct = useMemo(() => legacyPermissionsToProduct(actorPermissions), [actorPermissions]);
  const valueWithUniversal = useMemo(() => ensureUniversalProductPermissions(value), [value]);

  const leftColumnGroups = useMemo(
    () => productCapabilityGroups.filter((group) => LEFT_COLUMN_GROUP_KEYS.has(group.key)),
    []
  );

  const rightColumnGroups = useMemo(
    () => productCapabilityGroups.filter((group) => RIGHT_COLUMN_GROUP_KEYS.has(group.key)),
    []
  );

  const setCapability = (key: ProductCapabilityKey, checked: boolean) => {
    if (readOnly || key === DASHBOARD_CAPABILITY) return;
    if (!actorProduct[key]) return;
    const updated = applyCapabilityChange(valueWithUniversal, key, checked);
    if (productPermissionsExceedActor(updated, actorPermissions)) {
      return;
    }
    onChange(ensureUniversalProductPermissions(updated));
  };

  const renderCapability = (key: ProductCapabilityKey, depth: number) => {
    const parentKey = CAPABILITY_PARENT.get(key);
    const parentEnabled = parentKey ? valueWithUniversal[parentKey] : true;
    const actorHas = actorProduct[key];
    const disabled =
      readOnly || !actorHas || (parentKey ? !parentEnabled : false) || key === DASHBOARD_CAPABILITY;

    return (
      <CapabilityRow
        key={key}
        capabilityKey={key}
        label={CAPABILITY_LABELS.get(key) ?? key}
        depth={depth}
        checked={Boolean(valueWithUniversal[key])}
        disabled={disabled}
        readOnly={readOnly}
        onToggle={setCapability}
      />
    );
  };

  const renderStandardGroup = (group: ProductCapabilityGroup) => {
    if (group.key === 'core') {
      return (
        <Box key={group.key} sx={{ px: 2, py: 1.5 }}>
          <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1 }}>
            {group.label}
          </Typography>
          <CapabilityRow
            capabilityKey={DASHBOARD_CAPABILITY}
            label="Dashboard"
            depth={1}
            checked
            disabled
            readOnly={readOnly}
            onToggle={setCapability}
            helperText="Available to all users"
          />
        </Box>
      );
    }

    const capabilities = group.capabilities.filter((capability) => actorProduct[capability.key]);
    if (capabilities.length === 0) return null;

    return (
      <Box key={group.key} sx={{ px: 2, py: 1.5 }}>
        <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 0.5 }}>
          {group.label}
        </Typography>
        <Stack spacing={0.25}>
          {capabilities.map((capability) =>
            renderCapability(capability.key, capability.parentKey ? 2 : 1)
          )}
        </Stack>
      </Box>
    );
  };

  const renderAccessGroup = () => {
    const subsections = ACCESS_SUBSECTIONS.map((subsection) => ({
      ...subsection,
      visible: subsection.capabilities.filter((key) => actorProduct[key])
    })).filter((subsection) => subsection.visible.length > 0);

    if (subsections.length === 0) return null;

    return (
      <Box sx={{ px: 2, py: 1.5 }} data-testid="permission-tree-access">
        <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1 }}>
          Access
        </Typography>
        <Stack spacing={1.5}>
          {subsections.map((subsection) => (
            <Box key={subsection.key}>
              <Typography
                variant="body2"
                fontWeight={600}
                color="text.secondary"
                sx={{ pl: 1.5, mb: 0.5 }}
              >
                {subsection.label}
              </Typography>
              <Stack spacing={0.25}>
                {subsection.visible.map((key) => renderCapability(key, 2))}
              </Stack>
            </Box>
          ))}
        </Stack>
      </Box>
    );
  };

  const leftSections = leftColumnGroups
    .map((group) => renderStandardGroup(group))
    .filter((section) => section != null);

  const rightSections = [
    ...rightColumnGroups.map((group) => renderStandardGroup(group)).filter((section) => section != null),
    renderAccessGroup()
  ].filter((section) => section != null);

  const treeContent = (
      <Box
        sx={{
          display: 'flex',
          flexDirection: { xs: 'column', md: 'row' },
          alignItems: 'stretch',
          minHeight: 280
        }}
      >
        <Box
          sx={{ flex: 1, minWidth: 0 }}
          data-testid="permission-tree-product"
        >
          <Stack spacing={0} divider={<GroupSectionDivider />}>
            {leftSections}
          </Stack>
        </Box>

        <Divider
          orientation="vertical"
          flexItem
          sx={{ display: { xs: 'none', md: 'block' }, borderColor: 'divider' }}
        />
        <Divider sx={{ display: { xs: 'block', md: 'none' }, borderColor: 'divider' }} />

        <Box
          sx={{ flex: 1, minWidth: 0 }}
          data-testid="permission-tree-right-column"
        >
          {rightSections.length > 0 ? (
            <Stack spacing={0} divider={<GroupSectionDivider />}>
              {rightSections}
            </Stack>
          ) : (
            <Box sx={{ px: 2, py: 1.5 }}>
              <Typography variant="body2" color="text.secondary">
                No QuickBooks or access permissions available for your role.
              </Typography>
            </Box>
          )}
        </Box>
      </Box>
  );

  if (embedded) {
    return (
      <Box data-testid="permission-tree" sx={{ overflow: 'hidden' }}>
        {treeContent}
      </Box>
    );
  }

  return (
    <Paper
      variant="outlined"
      data-testid="permission-tree"
      sx={{
        borderRadius: 2,
        bgcolor: 'background.paper',
        overflow: 'hidden'
      }}
    >
      {treeContent}
    </Paper>
  );
};

export const permissionsMapToProduct = (permissions: PermissionsMap) =>
  ensureUniversalProductPermissions(legacyPermissionsToProduct(permissions));

export const productToPermissionsMap = (product: Record<ProductCapabilityKey, boolean>) =>
  productPermissionsToLegacy(ensureUniversalProductPermissions(product));

export const createEmptyProductState = () => createDefaultCustomRoleProductState();

export { ROLE_DELEGATION_FORBIDDEN_MESSAGE };
