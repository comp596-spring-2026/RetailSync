import type {
  QuickBooksContactCreateInput,
  QuickBooksContactDetail,
  QuickBooksContactUpdateInput
} from '@retailsync/shared';
import { ensureFreshQuickBooksSecret, requestQuickBooksApi } from '../integrations/quickbooks';
import { QuickBooksReferenceModel } from '../models/QuickBooksReference';

type QuickBooksCrudEntityType = 'customer' | 'vendor';

const entityEndpointMap: Record<QuickBooksCrudEntityType, 'customer' | 'vendor'> = {
  customer: 'customer',
  vendor: 'vendor'
};

const toRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const toTrimmedString = (value: unknown) => {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number') return String(value).trim();
  return '';
};

const readNested = (value: unknown, path: string[]) => {
  let current = value;
  for (const key of path) {
    if (!current || typeof current !== 'object' || !(key in current)) {
      return null;
    }
    current = (current as Record<string, unknown>)[key];
  }
  return current;
};

const toNullableString = (value: unknown): string | null => {
  const trimmed = toTrimmedString(value);
  return trimmed || null;
};

const mapQuickBooksContactDetail = (
  entityType: QuickBooksCrudEntityType,
  raw: Record<string, unknown>
): QuickBooksContactDetail => ({
  id: toTrimmedString(raw.Id),
  qbId: toTrimmedString(raw.Id),
  entityType,
  displayName:
    toNullableString(raw.DisplayName) ??
    toNullableString(raw.CompanyName) ??
    `${toTrimmedString(raw.GivenName)} ${toTrimmedString(raw.FamilyName)}`.trim(),
  companyName: toNullableString(raw.CompanyName),
  givenName: toNullableString(raw.GivenName),
  familyName: toNullableString(raw.FamilyName),
  email:
    toNullableString(readNested(raw, ['PrimaryEmailAddr', 'Address'])) ??
    toNullableString(readNested(raw, ['BillEmail', 'Address'])),
  phone:
    toNullableString(readNested(raw, ['PrimaryPhone', 'FreeFormNumber'])) ??
    toNullableString(readNested(raw, ['Mobile', 'FreeFormNumber'])) ??
    toNullableString(readNested(raw, ['MobilePhone', 'FreeFormNumber'])),
  status: raw.Active === false ? 'inactive' : 'active',
  balance:
    typeof raw.Balance === 'number'
      ? raw.Balance
      : typeof raw.Balance === 'string'
        ? Number(raw.Balance)
        : typeof raw.OpenBalance === 'number'
          ? raw.OpenBalance
          : typeof raw.OpenBalance === 'string'
            ? Number(raw.OpenBalance)
            : null,
  syncToken: toNullableString(raw.SyncToken),
  raw
});

const buildContactBody = (
  input: QuickBooksContactCreateInput | QuickBooksContactUpdateInput
) => {
  const body: Record<string, unknown> = {
    DisplayName: input.displayName
  };

  if (input.companyName?.trim()) body.CompanyName = input.companyName.trim();
  if (input.givenName?.trim()) body.GivenName = input.givenName.trim();
  if (input.familyName?.trim()) body.FamilyName = input.familyName.trim();
  if (input.email?.trim()) body.PrimaryEmailAddr = { Address: input.email.trim() };
  if (input.phone?.trim()) body.PrimaryPhone = { FreeFormNumber: input.phone.trim() };

  return body;
};

const persistQuickBooksReference = async (
  companyId: string,
  entityType: QuickBooksCrudEntityType,
  raw: Record<string, unknown>
) => {
  const qbId = toTrimmedString(raw.Id);
  const displayName =
    toNullableString(raw.DisplayName) ??
    toNullableString(raw.CompanyName) ??
    `${toTrimmedString(raw.GivenName)} ${toTrimmedString(raw.FamilyName)}`.trim();

  if (!qbId || !displayName) {
    return;
  }

  await QuickBooksReferenceModel.findOneAndUpdate(
    {
      companyId,
      entityType,
      qbId
    },
    {
      companyId,
      entityType,
      qbId,
      displayName,
      active: raw.Active !== false,
      raw
    },
    {
      upsert: true,
      new: true
    }
  );
};

const getEntityContainer = (
  entityType: QuickBooksCrudEntityType,
  payload: Record<string, unknown>
) => {
  const key = entityType === 'customer' ? 'Customer' : 'Vendor';
  return toRecord(payload[key]) ?? payload;
};

export const getQuickBooksContactDetail = async (args: {
  companyId: string;
  entityType: QuickBooksCrudEntityType;
  qbId: string;
}): Promise<QuickBooksContactDetail> => {
  const endpoint = entityEndpointMap[args.entityType];
  const secret = await ensureFreshQuickBooksSecret(args.companyId);
  if (!secret) {
    throw new Error('quickbooks_not_connected');
  }
  const payload = (await requestQuickBooksApi({
    companyId: args.companyId,
    method: 'GET',
    path: `/v3/company/${secret.realmId}/${endpoint}/${args.qbId}`,
    query: { minorversion: 75 }
  })) as Record<string, unknown>;

  const raw = getEntityContainer(args.entityType, payload);
  return mapQuickBooksContactDetail(args.entityType, raw);
};

const fetchCurrentEntity = async (args: {
  companyId: string;
  entityType: QuickBooksCrudEntityType;
  qbId: string;
}) => {
  const endpoint = entityEndpointMap[args.entityType];
  const secret = await ensureFreshQuickBooksSecret(args.companyId);
  if (!secret) {
    throw new Error('quickbooks_not_connected');
  }

  const payload = (await requestQuickBooksApi({
    companyId: args.companyId,
    method: 'GET',
    path: `/v3/company/${secret.realmId}/${endpoint}/${args.qbId}`,
    query: { minorversion: 75 }
  })) as Record<string, unknown>;

  return {
    secret,
    raw: getEntityContainer(args.entityType, payload)
  };
};

export const createQuickBooksContact = async (args: {
  companyId: string;
  entityType: QuickBooksCrudEntityType;
  input: QuickBooksContactCreateInput;
}): Promise<QuickBooksContactDetail> => {
  const secret = await ensureFreshQuickBooksSecret(args.companyId);
  if (!secret) {
    throw new Error('quickbooks_not_connected');
  }

  const endpoint = entityEndpointMap[args.entityType];
  const payload = (await requestQuickBooksApi({
    companyId: args.companyId,
    method: 'POST',
    path: `/v3/company/${secret.realmId}/${endpoint}`,
    query: { minorversion: 75 },
    body: buildContactBody(args.input)
  })) as Record<string, unknown>;

  const raw = getEntityContainer(args.entityType, payload);
  await persistQuickBooksReference(args.companyId, args.entityType, raw);
  return mapQuickBooksContactDetail(args.entityType, raw);
};

export const updateQuickBooksContact = async (args: {
  companyId: string;
  entityType: QuickBooksCrudEntityType;
  qbId: string;
  input: QuickBooksContactUpdateInput;
}): Promise<QuickBooksContactDetail> => {
  const endpoint = entityEndpointMap[args.entityType];
  const current = await fetchCurrentEntity(args);
  const syncToken = toTrimmedString(current.raw.SyncToken);
  if (!syncToken) {
    throw new Error('quickbooks_api_fault:sync token missing');
  }

  const payload = (await requestQuickBooksApi({
    companyId: args.companyId,
    method: 'POST',
    path: `/v3/company/${current.secret.realmId}/${endpoint}`,
    query: { minorversion: 75 },
    body: {
      Id: args.qbId,
      SyncToken: syncToken,
      sparse: true,
      ...buildContactBody(args.input)
    }
  })) as Record<string, unknown>;

  const raw = getEntityContainer(args.entityType, payload);
  await persistQuickBooksReference(args.companyId, args.entityType, raw);
  return mapQuickBooksContactDetail(args.entityType, raw);
};

export const deleteQuickBooksContact = async (args: {
  companyId: string;
  entityType: QuickBooksCrudEntityType;
  qbId: string;
}): Promise<{ qbId: string; deleted: true }> => {
  const endpoint = entityEndpointMap[args.entityType];
  const current = await fetchCurrentEntity(args);
  const syncToken = toTrimmedString(current.raw.SyncToken);
  if (!syncToken) {
    throw new Error('quickbooks_api_fault:sync token missing');
  }

  const payload = (await requestQuickBooksApi({
    companyId: args.companyId,
    method: 'POST',
    path: `/v3/company/${current.secret.realmId}/${endpoint}`,
    query: { minorversion: 75 },
    body: {
      Id: args.qbId,
      SyncToken: syncToken,
      sparse: true,
      Active: false
    }
  })) as Record<string, unknown>;

  const raw = getEntityContainer(args.entityType, payload);
  await persistQuickBooksReference(args.companyId, args.entityType, raw);
  return {
    qbId: args.qbId,
    deleted: true
  };
};
