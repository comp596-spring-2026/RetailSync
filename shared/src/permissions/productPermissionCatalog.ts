import type { PermissionSet, PermissionsMap } from './permissions';
import { moduleKeys } from '../constants/modules';

/** Product-facing capability keys for the role editor and route helpers. */
export type ProductCapabilityKey =
  | 'dashboard.show'
  | 'pos.show'
  | 'pos.table'
  | 'pos.analytics'
  | 'pos.saleTax'
  | 'pos.import'
  | 'accounting.show'
  | 'accounting.statements.upload'
  | 'accounting.statements.review'
  | 'accounting.statements.delete'
  | 'quickbooks.show'
  | 'quickbooks.sync'
  | 'quickbooks.post'
  | 'quickbooks.connectDisconnect'
  | 'settings.show'
  | 'settings.manage'
  | 'access.users.view'
  | 'access.users.invite'
  | 'access.users.assignRoles'
  | 'access.users.deactivate'
  | 'access.roles.view'
  | 'access.roles.create'
  | 'access.roles.edit'
  | 'access.roles.delete';

export type ProductCapabilityGroup = {
  key: string;
  label: string;
  capabilities: Array<{
    key: ProductCapabilityKey;
    label: string;
    parentKey?: ProductCapabilityKey;
  }>;
};

export const productCapabilityGroups: ProductCapabilityGroup[] = [
  {
    key: 'core',
    label: 'Core',
    capabilities: [{ key: 'dashboard.show', label: 'Show Dashboard' }]
  },
  {
    key: 'pos',
    label: 'POS',
    capabilities: [
      { key: 'pos.show', label: 'Show POS' },
      { key: 'pos.table', label: 'Table', parentKey: 'pos.show' },
      { key: 'pos.analytics', label: 'Analytics', parentKey: 'pos.show' },
      { key: 'pos.saleTax', label: 'Sales Tax', parentKey: 'pos.show' },
      { key: 'pos.import', label: 'Import POS Data', parentKey: 'pos.show' }
    ]
  },
  {
    key: 'accounting',
    label: 'Accounting',
    capabilities: [
      { key: 'accounting.show', label: 'Show Accounting' },
      {
        key: 'accounting.statements.upload',
        label: 'Upload Statements',
        parentKey: 'accounting.show'
      },
      {
        key: 'accounting.statements.review',
        label: 'Review Statements',
        parentKey: 'accounting.show'
      },
      {
        key: 'accounting.statements.delete',
        label: 'Delete Statements',
        parentKey: 'accounting.show'
      }
    ]
  },
  {
    key: 'quickbooks',
    label: 'QuickBooks',
    capabilities: [
      { key: 'quickbooks.show', label: 'Show QuickBooks' },
      { key: 'quickbooks.sync', label: 'Sync QuickBooks', parentKey: 'quickbooks.show' },
      { key: 'quickbooks.post', label: 'Post to QuickBooks', parentKey: 'quickbooks.show' },
      {
        key: 'quickbooks.connectDisconnect',
        label: 'Connect / Disconnect QuickBooks',
        parentKey: 'quickbooks.show'
      }
    ]
  },
  {
    key: 'settings',
    label: 'Settings',
    capabilities: [
      { key: 'settings.show', label: 'Show Settings' },
      { key: 'settings.manage', label: 'Manage Settings', parentKey: 'settings.show' }
    ]
  },
  {
    key: 'access',
    label: 'Access',
    capabilities: [
      { key: 'access.users.view', label: 'View Users' },
      { key: 'access.users.invite', label: 'Invite Users', parentKey: 'access.users.view' },
      { key: 'access.users.assignRoles', label: 'Assign Roles', parentKey: 'access.users.view' },
      { key: 'access.users.deactivate', label: 'Deactivate Users', parentKey: 'access.users.view' },
      { key: 'access.roles.view', label: 'View Roles' },
      { key: 'access.roles.create', label: 'Create Roles', parentKey: 'access.roles.view' },
      { key: 'access.roles.edit', label: 'Edit Roles', parentKey: 'access.roles.view' },
      { key: 'access.roles.delete', label: 'Delete Roles', parentKey: 'access.roles.view' }
    ]
  }
];

export const ROLE_DELEGATION_FORBIDDEN_MESSAGE =
  'Cannot grant permissions you do not have.';

export const allProductCapabilityKeys = (): ProductCapabilityKey[] =>
  productCapabilityGroups.flatMap((group) => group.capabilities.map((item) => item.key));

const emptySet = (): PermissionSet => ({
  view: false,
  create: false,
  edit: false,
  delete: false,
  actions: []
});

export const emptyPermissionsMap = (): PermissionsMap => {
  const map = {} as PermissionsMap;
  for (const key of moduleKeys) {
    map[key] = emptySet();
  }
  return map;
};

const hasAction = (permission: PermissionSet | undefined, action: string) =>
  Boolean(permission?.actions.includes(action));

const stableStringify = (value: unknown) => JSON.stringify(value);

export const legacyPermissionsToProduct = (
  permissions: Partial<PermissionsMap> | PermissionsMap
): Record<ProductCapabilityKey, boolean> => {
  const map = { ...emptyPermissionsMap(), ...permissions } as PermissionsMap;

  return {
    'dashboard.show': Boolean(map.dashboard?.view),
    'pos.show': Boolean(map.pos?.view),
    'pos.table': hasAction(map.pos, 'table'),
    'pos.analytics': hasAction(map.pos, 'analytics'),
    'pos.saleTax': hasAction(map.pos, 'saleTax'),
    'pos.import': Boolean(map.pos?.create && hasAction(map.pos, 'import')),
    'accounting.show': Boolean(map.accounting?.view || map.bankStatements?.view),
    'accounting.statements.upload': Boolean(map.bankStatements?.create),
    'accounting.statements.review': Boolean(map.bankStatements?.edit),
    'accounting.statements.delete': Boolean(map.bankStatements?.delete),
    'quickbooks.show': Boolean(map.quickbooks?.view),
    'quickbooks.sync': hasAction(map.quickbooks, 'sync'),
    'quickbooks.post': hasAction(map.quickbooks, 'post'),
    'quickbooks.connectDisconnect':
      hasAction(map.quickbooks, 'connect') || hasAction(map.quickbooks, 'disconnect'),
    'settings.show': Boolean(map.settings?.view),
    'settings.manage': Boolean(map.settings?.edit),
    'access.users.view': Boolean(map.users?.view),
    'access.users.invite': hasAction(map.users, 'invite'),
    'access.users.assignRoles': hasAction(map.users, 'assignRole'),
    'access.users.deactivate': Boolean(map.users?.delete),
    'access.roles.view': Boolean(map.rolesSettings?.view),
    'access.roles.create': Boolean(map.rolesSettings?.create),
    'access.roles.edit': Boolean(map.rolesSettings?.edit),
    'access.roles.delete': Boolean(map.rolesSettings?.delete)
  };
};

export const productPermissionsToLegacy = (
  product: Record<ProductCapabilityKey, boolean>
): PermissionsMap => {
  const next = emptyPermissionsMap();

  if (product['dashboard.show']) {
    next.dashboard = { view: true, create: false, edit: false, delete: false, actions: [] };
  }

  if (product['pos.show']) {
    const actions: string[] = [];
    if (product['pos.table']) actions.push('table');
    if (product['pos.analytics']) actions.push('analytics');
    if (product['pos.saleTax']) actions.push('saleTax');
    if (product['pos.import']) actions.push('import');
    next.pos = {
      view: true,
      create: product['pos.import'],
      edit: false,
      delete: false,
      actions
    };
  }

  if (
    product['accounting.show'] ||
    product['accounting.statements.upload'] ||
    product['accounting.statements.review'] ||
    product['accounting.statements.delete']
  ) {
    next.accounting = {
      view: product['accounting.show'],
      create: false,
      edit: false,
      delete: false,
      actions: []
    };
    next.bankStatements = {
      view: product['accounting.show'] || product['accounting.statements.upload'] || product['accounting.statements.review'] || product['accounting.statements.delete'],
      create: product['accounting.statements.upload'],
      edit: product['accounting.statements.review'],
      delete: product['accounting.statements.delete'],
      actions: []
    };
  }

  if (
    product['quickbooks.show'] ||
    product['quickbooks.sync'] ||
    product['quickbooks.post'] ||
    product['quickbooks.connectDisconnect']
  ) {
    const actions: string[] = [];
    if (product['quickbooks.sync']) actions.push('sync');
    if (product['quickbooks.post']) actions.push('post');
    if (product['quickbooks.connectDisconnect']) {
      actions.push('connect', 'disconnect');
    }
    next.quickbooks = {
      view: product['quickbooks.show'] || actions.length > 0,
      create: false,
      edit: product['quickbooks.connectDisconnect'] || product['quickbooks.post'],
      delete: false,
      actions
    };
  }

  if (product['settings.show'] || product['settings.manage']) {
    next.settings = {
      view: product['settings.show'] || product['settings.manage'],
      create: false,
      edit: product['settings.manage'],
      delete: false,
      actions: []
    };
  }

  if (
    product['access.users.view'] ||
    product['access.users.invite'] ||
    product['access.users.assignRoles'] ||
    product['access.users.deactivate']
  ) {
    const userActions: string[] = [];
    if (product['access.users.invite']) userActions.push('invite');
    if (product['access.users.assignRoles']) userActions.push('assignRole');
    next.users = {
      view:
        product['access.users.view'] ||
        userActions.length > 0 ||
        product['access.users.deactivate'],
      create: false,
      edit: product['access.users.assignRoles'],
      delete: product['access.users.deactivate'],
      actions: userActions
    };
  }

  if (
    product['access.roles.view'] ||
    product['access.roles.create'] ||
    product['access.roles.edit'] ||
    product['access.roles.delete']
  ) {
    next.rolesSettings = {
      view:
        product['access.roles.view'] ||
        product['access.roles.create'] ||
        product['access.roles.edit'] ||
        product['access.roles.delete'],
      create: product['access.roles.create'],
      edit: product['access.roles.edit'],
      delete: product['access.roles.delete'],
      actions: []
    };
  }

  return next;
};

const clampPermissionSet = (candidate: PermissionSet, actor: PermissionSet): PermissionSet => {
  const actions = candidate.actions.filter((action) => actor.actions.includes(action));
  return {
    view: candidate.view && actor.view,
    create: candidate.create && actor.create,
    edit: candidate.edit && actor.edit,
    delete: candidate.delete && actor.delete,
    actions
  };
};

export const clampPermissionsToActor = (
  candidate: PermissionsMap,
  actor: PermissionsMap
): PermissionsMap => {
  const clamped = emptyPermissionsMap();
  for (const moduleKey of moduleKeys) {
    clamped[moduleKey] = clampPermissionSet(
      candidate[moduleKey] ?? emptySet(),
      actor[moduleKey] ?? emptySet()
    );
  }
  return clamped;
};

export const permissionsExceedActor = (
  candidate: PermissionsMap,
  actor: PermissionsMap
): boolean => {
  const clamped = clampPermissionsToActor(candidate, actor);
  return stableStringify(candidate) !== stableStringify(clamped);
};

export const emptyProductPermissions = (): Record<ProductCapabilityKey, boolean> => {
  const product = {} as Record<ProductCapabilityKey, boolean>;
  for (const key of allProductCapabilityKeys()) {
    product[key] = false;
  }
  return product;
};

export const clampProductPermissionsToActor = (
  candidate: Record<ProductCapabilityKey, boolean>,
  actorLegacy: PermissionsMap
): Record<ProductCapabilityKey, boolean> => {
  const actorProduct = legacyPermissionsToProduct(actorLegacy);
  const legacyCandidate = productPermissionsToLegacy(candidate);
  const legacyActor = productPermissionsToLegacy(actorProduct);
  const clampedLegacy = clampPermissionsToActor(legacyCandidate, legacyActor);
  return legacyPermissionsToProduct(clampedLegacy);
};

export const productPermissionsExceedActor = (
  candidate: Record<ProductCapabilityKey, boolean>,
  actorLegacy: PermissionsMap
): boolean => {
  const legacyCandidate = productPermissionsToLegacy(candidate);
  return permissionsExceedActor(legacyCandidate, actorLegacy);
};

export const adminProductPermissions = (): Record<ProductCapabilityKey, boolean> => {
  const product = emptyProductPermissions();
  for (const key of allProductCapabilityKeys()) {
    product[key] = true;
  }
  return product;
};

export const memberProductPermissions = (): Record<ProductCapabilityKey, boolean> => {
  const product = emptyProductPermissions();
  const enable: ProductCapabilityKey[] = [
    'dashboard.show',
    'pos.show',
    'pos.table',
    'pos.analytics',
    'pos.saleTax',
    'accounting.show',
    'accounting.statements.upload',
    'accounting.statements.review',
    'quickbooks.show',
    'settings.show'
  ];
  for (const key of enable) {
    product[key] = true;
  }
  return product;
};

export const viewerProductPermissions = (): Record<ProductCapabilityKey, boolean> => {
  const product = emptyProductPermissions();
  const enable: ProductCapabilityKey[] = [
    'dashboard.show',
    'pos.show',
    'pos.table',
    'pos.analytics',
    'pos.saleTax',
    'accounting.show',
    'quickbooks.show',
    'settings.show'
  ];
  for (const key of enable) {
    product[key] = true;
  }
  return product;
};
