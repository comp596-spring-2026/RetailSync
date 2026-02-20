import { ModuleKey, moduleActionCatalog, moduleKeys, PermissionsMap } from '@retailsync/shared';

const makePermission = (
  module: ModuleKey,
  base: Partial<{ view: boolean; create: boolean; edit: boolean; delete: boolean; actions: string[] }>
) => ({
  view: base.view ?? false,
  create: base.create ?? false,
  edit: base.edit ?? false,
  delete: base.delete ?? false,
  actions: base.actions ?? []
});

export const adminPermissions = (): PermissionsMap => {
  const permissions = {} as PermissionsMap;
  for (const module of moduleKeys) {
    permissions[module] = makePermission(module, {
      view: true,
      create: true,
      edit: true,
      delete: true,
      actions: ['*']
    });
  }
  return permissions;
};

export const memberPermissions = (): PermissionsMap => ({
  dashboard: makePermission('dashboard', { view: true, actions: ['refresh'] }),
  pos: makePermission('pos', { view: true, create: true, edit: true, actions: ['import', 'recalculate'] }),
  items: makePermission('items', { view: true, create: true, edit: true, actions: ['import'] }),
  invoices: makePermission('invoices', { view: true, create: true, edit: true, actions: ['confirm'] }),
  inventory: makePermission('inventory', { view: true, create: true, edit: true, actions: ['move'] }),
  locations: makePermission('locations', { view: true, create: true, edit: true }),
  reconciliation: makePermission('reconciliation', { view: true, create: true, actions: ['auto_match', 'confirm_match'] }),
  bankStatements: makePermission('bankStatements', { view: true, create: true, actions: ['import'] }),
  suppliers: makePermission('suppliers', { view: true, create: true, edit: true }),
  reports: makePermission('reports', { view: true, actions: ['export_csv'] }),
  users: makePermission('users', { view: true }),
  rolesSettings: makePermission('rolesSettings', { view: false })
});

export const viewerPermissions = (): PermissionsMap => {
  const permissions = {} as PermissionsMap;
  for (const module of moduleKeys) {
    permissions[module] = makePermission(module, {
      view: true,
      create: false,
      edit: false,
      delete: false,
      actions: []
    });
  }
  return permissions;
};

export const moduleCatalog = moduleActionCatalog;
