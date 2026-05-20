import {
  ModuleKey,
  PermissionSet,
  PermissionsMap,
  moduleKeys,
  sanitizeModulePermissionSet
} from '@retailsync/shared';
import { adminPermissions, memberPermissions, viewerPermissions } from '../utils/defaultPermissions';

type PartialPermissionSet = Partial<PermissionSet> | null | undefined;

type NormalizeRolePermissionsOptions = {
  roleName?: string | null;
  isSystem?: boolean | null;
  basePermissions?: unknown;
};

type RolePermissionsNormalizationResult = {
  normalized: PermissionsMap;
  missingModules: ModuleKey[];
  changed: boolean;
};

const emptyPermissionSet = (): PermissionSet => ({
  view: false,
  create: false,
  edit: false,
  delete: false,
  actions: []
});

const clonePermissionSet = (permission: PermissionSet): PermissionSet => ({
  view: permission.view,
  create: permission.create,
  edit: permission.edit,
  delete: permission.delete,
  actions: [...permission.actions]
});

const getSystemRoleTemplate = (
  roleName?: string | null,
  isSystem?: boolean | null
): PermissionsMap | null => {
  if (!isSystem) return null;

  const normalized = String(roleName ?? '').trim().toLowerCase();
  if (normalized === 'admin') return adminPermissions();
  if (normalized === 'member') return memberPermissions();
  if (normalized === 'viewer') return viewerPermissions();
  return null;
};

const normalizePermissionSet = (
  value: PartialPermissionSet,
  fallback: PermissionSet,
  base?: PartialPermissionSet
): PermissionSet => ({
  view:
    typeof value?.view === 'boolean'
      ? value.view
      : typeof base?.view === 'boolean'
        ? base.view
        : fallback.view,
  create:
    typeof value?.create === 'boolean'
      ? value.create
      : typeof base?.create === 'boolean'
        ? base.create
        : fallback.create,
  edit:
    typeof value?.edit === 'boolean'
      ? value.edit
      : typeof base?.edit === 'boolean'
        ? base.edit
        : fallback.edit,
  delete:
    typeof value?.delete === 'boolean'
      ? value.delete
      : typeof base?.delete === 'boolean'
        ? base.delete
        : fallback.delete,
  actions: Array.isArray(value?.actions)
    ? value.actions.filter((entry): entry is string => typeof entry === 'string')
    : Array.isArray(base?.actions)
      ? base.actions.filter((entry): entry is string => typeof entry === 'string')
      : [...fallback.actions]
});

export const normalizeRolePermissions = (
  permissions: unknown,
  options: NormalizeRolePermissionsOptions = {}
): PermissionsMap => {
  const template = getSystemRoleTemplate(options.roleName, options.isSystem);
  if (template) {
    const normalized = {} as PermissionsMap;
    for (const moduleKey of moduleKeys) {
      normalized[moduleKey] = sanitizeModulePermissionSet(
        moduleKey,
        clonePermissionSet(template[moduleKey])
      );
    }
    return normalized;
  }

  const source =
    permissions && typeof permissions === 'object'
      ? (permissions as Record<string, PartialPermissionSet>)
      : {};
  const base =
    options.basePermissions && typeof options.basePermissions === 'object'
      ? (options.basePermissions as Record<string, PartialPermissionSet>)
      : {};
  const normalized = {} as PermissionsMap;

  for (const moduleKey of moduleKeys) {
    const fallback = emptyPermissionSet();
    const merged = normalizePermissionSet(source[moduleKey], fallback, base[moduleKey]);
    normalized[moduleKey] = sanitizeModulePermissionSet(moduleKey, merged);
  }

  return normalized;
};

const stableStringify = (value: unknown) => JSON.stringify(value);

export const getRolePermissionsNormalizationResult = (
  permissions: unknown,
  options: NormalizeRolePermissionsOptions = {}
): RolePermissionsNormalizationResult => {
  const normalized = normalizeRolePermissions(permissions, options);
  const missingModules = findMissingPermissionModules(permissions);

  return {
    normalized,
    missingModules,
    changed: stableStringify(permissions) !== stableStringify(normalized)
  };
};

export const findMissingPermissionModules = (permissions: unknown): ModuleKey[] => {
  const source =
    permissions && typeof permissions === 'object'
      ? (permissions as Record<string, unknown>)
      : {};

  return moduleKeys.filter((moduleKey) => !(moduleKey in source));
};

export const rolePermissionsNeedBackfill = (permissions: unknown) =>
  getRolePermissionsNormalizationResult(permissions).changed;
