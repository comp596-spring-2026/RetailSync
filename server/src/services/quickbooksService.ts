import { env } from '../config/env';
import { IntegrationSecretModel } from '../models/IntegrationSecret';
import { decryptJson, encryptJson } from '../utils/encryption';

export type QuickBooksEnvironment = 'sandbox' | 'production';

export type QuickBooksSecretPayload = {
  accessToken: string;
  refreshToken: string;
  tokenType: string;
  scope: string | null;
  idToken: string | null;
  realmId: string;
  environment: QuickBooksEnvironment;
  companyName: string | null;
  expiresAt: number | null;
  refreshExpiresAt: number | null;
  updatedAt: number;
};

type QuickBooksTokenApiResponse = {
  access_token?: string;
  refresh_token?: string;
  token_type?: string;
  scope?: string;
  id_token?: string;
  expires_in?: number | string;
  x_refresh_token_expires_in?: number | string;
  error?: string;
  error_description?: string;
};

type QuickBooksApiEnvelope = {
  QueryResponse?: Record<string, unknown>;
  Fault?: {
    Error?: Array<{ Message?: string; Detail?: string; code?: string }>;
  };
};

export type QuickBooksAccountRecord = {
  id: string;
  name: string;
  code: string | null;
  accountType: string | null;
  active: boolean;
};

export type QuickBooksEntityType = 'vendor' | 'customer' | 'employee';

export type QuickBooksEntityRecord = {
  id: string;
  displayName: string;
  active: boolean;
  raw: Record<string, unknown>;
};

export type QuickBooksReadQueryResult = Record<string, unknown>;

export type QuickBooksJournalLineInput = {
  accountId: string;
  amount: number;
  postingType: 'Debit' | 'Credit';
  description?: string;
};

type QuickBooksTxnCreateResult = {
  txnId: string;
  txnDate: string;
};

const QUICKBOOKS_AUTHORIZE_URL = 'https://appcenter.intuit.com/connect/oauth2';
const QUICKBOOKS_TOKEN_URL = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer';
const QUICKBOOKS_SANDBOX_API_BASE = 'https://sandbox-quickbooks.api.intuit.com';
const QUICKBOOKS_PROD_API_BASE = 'https://quickbooks.api.intuit.com';
export const QUICKBOOKS_OAUTH_SCOPES =
  'com.intuit.quickbooks.accounting openid profile email';

const ensureQuickBooksConfig = () => {
  if (
    !env.quickbooksClientId ||
    !env.quickbooksClientSecret ||
    !env.quickbooksIntegrationRedirectUri
  ) {
    throw new Error(
      'quickbooks_oauth_not_configured: set QUICKBOOKS_CLIENT_ID, QUICKBOOKS_CLIENT_SECRET, and QUICKBOOKS_INTEGRATION_REDIRECT_URI'
    );
  }
  if (!env.encryptionKey) {
    throw new Error('missing encryption_key');
  }
  return {
    clientId: env.quickbooksClientId,
    clientSecret: env.quickbooksClientSecret,
    redirectUri: env.quickbooksIntegrationRedirectUri
  };
};

const getQuickBooksApiBase = (environment: QuickBooksEnvironment) =>
  environment === 'production' ? QUICKBOOKS_PROD_API_BASE : QUICKBOOKS_SANDBOX_API_BASE;

const parseOptionalNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
};

const requestQuickBooksToken = async (params: URLSearchParams) => {
  const { clientId, clientSecret } = ensureQuickBooksConfig();
  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`, 'utf-8').toString('base64');

  const response = await fetch(QUICKBOOKS_TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basicAuth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json'
    },
    body: params.toString()
  });

  const rawBody = await response.text();
  let payload: QuickBooksTokenApiResponse = {};
  try {
    payload = rawBody ? (JSON.parse(rawBody) as QuickBooksTokenApiResponse) : {};
  } catch {
    payload = {};
  }

  if (!response.ok) {
    const errorCode = String(payload.error ?? '').trim();
    const errorDescription = String(payload.error_description ?? '').trim();
    throw new Error(
      `quickbooks_token_exchange_failed:${errorCode || response.status}:${errorDescription || rawBody || 'unknown'}`
    );
  }

  return payload;
};

const buildQuickBooksApiUrl = ({
  secret,
  path,
  query
}: {
  secret: QuickBooksSecretPayload;
  path: string;
  query?: Record<string, string | number | undefined | null>;
}) => {
  const url = new URL(`${getQuickBooksApiBase(secret.environment)}${path}`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null || value === '') continue;
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
};

const parseQuickBooksApiBody = async (response: Response) => {
  const raw = await response.text();
  if (!raw) return { raw, parsed: null as Record<string, unknown> | null };
  try {
    return { raw, parsed: JSON.parse(raw) as Record<string, unknown> };
  } catch {
    return { raw, parsed: null as Record<string, unknown> | null };
  }
};

const performQuickBooksRequest = async ({
  secret,
  method,
  path,
  query,
  body
}: {
  secret: QuickBooksSecretPayload;
  method: 'GET' | 'POST';
  path: string;
  query?: Record<string, string | number | undefined | null>;
  body?: Record<string, unknown>;
}) => {
  const url = buildQuickBooksApiUrl({ secret, path, query });
  const init: RequestInit = {
    method,
    headers: {
      Authorization: `Bearer ${secret.accessToken}`,
      Accept: 'application/json'
    }
  };
  if (body) {
    (init.headers as Record<string, string>)['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  }

  const response = await fetch(url, init);
  const parsedBody = await parseQuickBooksApiBody(response);
  return {
    response,
    raw: parsedBody.raw,
    parsed: parsedBody.parsed
  };
};

const parseFaultMessage = (payload: Record<string, unknown> | null) => {
  if (!payload) return null;
  const fault = (payload as QuickBooksApiEnvelope).Fault;
  const first = fault?.Error?.[0];
  const message = first?.Detail || first?.Message;
  return message ? String(message) : null;
};

const QUICKBOOKS_RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

const sleep = async (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

export const buildQuickBooksAuthorizationUrl = (state: string) => {
  const { clientId, redirectUri } = ensureQuickBooksConfig();
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    scope: QUICKBOOKS_OAUTH_SCOPES,
    redirect_uri: redirectUri,
    state
  });
  return `${QUICKBOOKS_AUTHORIZE_URL}?${params.toString()}`;
};

export const exchangeQuickBooksAuthorizationCode = async (code: string) => {
  const { redirectUri } = ensureQuickBooksConfig();
  return requestQuickBooksToken(
    new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri
    })
  );
};

export const refreshQuickBooksAccessToken = async (refreshToken: string) => {
  return requestQuickBooksToken(
    new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken
    })
  );
};

export const loadQuickBooksSecret = async (companyId: string) => {
  ensureQuickBooksConfig();
  const secret = await IntegrationSecretModel.findOne({
    companyId,
    provider: 'quickbooks_oauth'
  }).select('+encryptedPayload');
  if (!secret?.encryptedPayload) return null;
  return decryptJson<QuickBooksSecretPayload>(secret.encryptedPayload, env.encryptionKey);
};

export const saveQuickBooksSecret = async (
  companyId: string,
  payload: QuickBooksSecretPayload
) => {
  ensureQuickBooksConfig();
  await IntegrationSecretModel.findOneAndUpdate(
    { companyId, provider: 'quickbooks_oauth' },
    {
      $set: {
        encryptedPayload: encryptJson(payload, env.encryptionKey)
      }
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
};

export const toQuickBooksSecretPayload = ({
  tokenResponse,
  environment,
  realmId,
  previous,
  companyName
}: {
  tokenResponse: QuickBooksTokenApiResponse;
  environment: QuickBooksEnvironment;
  realmId: string;
  previous?: QuickBooksSecretPayload | null;
  companyName?: string | null;
}): QuickBooksSecretPayload => {
  const accessToken = String(tokenResponse.access_token ?? '').trim();
  if (!accessToken) {
    throw new Error('access_token_missing');
  }

  const refreshToken =
    String(tokenResponse.refresh_token ?? '').trim() ||
    String(previous?.refreshToken ?? '').trim();
  if (!refreshToken) {
    throw new Error('quickbooks_refresh_token_missing');
  }

  const now = Date.now();
  const expiresInSec = parseOptionalNumber(tokenResponse.expires_in);
  const refreshExpiresInSec = parseOptionalNumber(tokenResponse.x_refresh_token_expires_in);

  return {
    accessToken,
    refreshToken,
    tokenType: String(tokenResponse.token_type ?? previous?.tokenType ?? 'Bearer'),
    scope:
      typeof tokenResponse.scope === 'string'
        ? tokenResponse.scope
        : (previous?.scope ?? null),
    idToken:
      typeof tokenResponse.id_token === 'string'
        ? tokenResponse.id_token
        : (previous?.idToken ?? null),
    realmId,
    environment,
    companyName: companyName ?? previous?.companyName ?? null,
    expiresAt:
      expiresInSec != null && expiresInSec > 0
        ? now + expiresInSec * 1000
        : (previous?.expiresAt ?? null),
    refreshExpiresAt:
      refreshExpiresInSec != null && refreshExpiresInSec > 0
        ? now + refreshExpiresInSec * 1000
        : (previous?.refreshExpiresAt ?? null),
    updatedAt: now
  };
};

export const isQuickBooksTokenNearExpiry = (
  payload: QuickBooksSecretPayload,
  thresholdSeconds = 45
) => {
  if (!payload.expiresAt) return false;
  return payload.expiresAt <= Date.now() + thresholdSeconds * 1000;
};

export const refreshQuickBooksSecretForCompany = async (companyId: string) => {
  const existing = await loadQuickBooksSecret(companyId);
  if (!existing) {
    throw new Error('quickbooks_not_connected');
  }
  const refreshed = await refreshQuickBooksAccessToken(existing.refreshToken);
  const next = toQuickBooksSecretPayload({
    tokenResponse: refreshed,
    environment: existing.environment,
    realmId: existing.realmId,
    previous: existing
  });
  await saveQuickBooksSecret(companyId, next);
  return next;
};

export const ensureFreshQuickBooksSecret = async (
  companyId: string,
  thresholdSeconds = 45
) => {
  const existing = await loadQuickBooksSecret(companyId);
  if (!existing) return null;
  if (!isQuickBooksTokenNearExpiry(existing, thresholdSeconds)) {
    return existing;
  }
  return refreshQuickBooksSecretForCompany(companyId);
};

export const fetchQuickBooksCompanyName = async ({
  environment,
  realmId,
  accessToken
}: {
  environment: QuickBooksEnvironment;
  realmId: string;
  accessToken: string;
}) => {
  const apiBase = getQuickBooksApiBase(environment);
  const url = `${apiBase}/v3/company/${realmId}/companyinfo/${realmId}?minorversion=75`;
  try {
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json'
      }
    });
    if (!response.ok) return null;
    const body = (await response.json()) as {
      CompanyInfo?: { CompanyName?: string };
      companyInfo?: { companyName?: string };
    };
    const companyName =
      body.CompanyInfo?.CompanyName ?? body.companyInfo?.companyName ?? null;
    return typeof companyName === 'string' && companyName.trim()
      ? companyName.trim()
      : null;
  } catch {
    return null;
  }
};

export const requestQuickBooksApi = async ({
  companyId,
  method,
  path,
  query,
  body
}: {
  companyId: string;
  method: 'GET' | 'POST';
  path: string;
  query?: Record<string, string | number | undefined | null>;
  body?: Record<string, unknown>;
}) => {
  let secret = await ensureFreshQuickBooksSecret(companyId);
  if (!secret) {
    throw new Error('quickbooks_not_connected');
  }

  const maxAttempts = 3;
  for (let attemptNo = 0; attemptNo < maxAttempts; attemptNo += 1) {
    let attempt: Awaited<ReturnType<typeof performQuickBooksRequest>>;
    const attemptStartedAt = Date.now();
    try {
      attempt = await performQuickBooksRequest({ secret, method, path, query, body });
      if (attempt.response.status === 401) {
        secret = await refreshQuickBooksSecretForCompany(companyId);
        attempt = await performQuickBooksRequest({ secret, method, path, query, body });
      }
      // eslint-disable-next-line no-console
      console.info('[quickbooks.api.request]', {
        companyId,
        method,
        path,
        attempt: attemptNo + 1,
        status: attempt.response.status,
        latencyMs: Date.now() - attemptStartedAt
      });
    } catch (error) {
      if (attemptNo < maxAttempts - 1) {
        await sleep(250 * 2 ** attemptNo);
        continue;
      }
      // eslint-disable-next-line no-console
      console.error('[quickbooks.api.request.error]', {
        companyId,
        method,
        path,
        attempt: attemptNo + 1,
        latencyMs: Date.now() - attemptStartedAt
      });
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`quickbooks_api_failed:network:${message}`);
    }

    if (!attempt.response.ok) {
      if (
        QUICKBOOKS_RETRYABLE_STATUS.has(attempt.response.status) &&
        attemptNo < maxAttempts - 1
      ) {
        await sleep(250 * 2 ** attemptNo);
        continue;
      }
      const fault = parseFaultMessage(attempt.parsed);
      throw new Error(
        `quickbooks_api_failed:${attempt.response.status}:${fault ?? (attempt.raw || 'unknown')}`
      );
    }

    const fault = parseFaultMessage(attempt.parsed);
    if (fault) {
      throw new Error(`quickbooks_api_fault:${fault}`);
    }

    return attempt.parsed ?? {};
  }

  throw new Error('quickbooks_api_failed:retry_exhausted');
};

export const runQuickBooksReadQuery = async (
  companyId: string,
  query: string
): Promise<QuickBooksReadQueryResult> => {
  const secret = await ensureFreshQuickBooksSecret(companyId);
  if (!secret) {
    throw new Error('quickbooks_not_connected');
  }

  const normalizedQuery = query.trim().replace(/\s+/g, ' ');
  if (!/^select\s+/i.test(normalizedQuery)) {
    throw new Error('quickbooks_query_must_be_select');
  }

  const payload = (await requestQuickBooksApi({
    companyId,
    method: 'GET',
    path: `/v3/company/${secret.realmId}/query`,
    query: {
      query: normalizedQuery,
      minorversion: 75
    }
  })) as Record<string, unknown>;

  return payload;
};

export const listQuickBooksAccounts = async (companyId: string) => {
  const secret = await ensureFreshQuickBooksSecret(companyId);
  if (!secret) {
    throw new Error('quickbooks_not_connected');
  }
  const allAccounts: QuickBooksAccountRecord[] = [];
  let startPosition = 1;
  const maxResults = 1000;

  while (true) {
    const queryStatement = `select * from Account startposition ${startPosition} maxresults ${maxResults}`;
    const payload = (await requestQuickBooksApi({
      companyId,
      method: 'GET',
      path: `/v3/company/${secret.realmId}/query`,
      query: {
        query: queryStatement,
        minorversion: 75
      }
    })) as QuickBooksApiEnvelope;

    const accountsRaw = Array.isArray(payload.QueryResponse?.Account)
      ? (payload.QueryResponse?.Account as Array<Record<string, unknown>>)
      : [];
    const mapped = accountsRaw
      .map((account) => ({
        id: String(account.Id ?? '').trim(),
        name: String(account.Name ?? '').trim(),
        code:
          typeof account.AcctNum === 'string' && account.AcctNum.trim()
            ? account.AcctNum.trim()
            : null,
        accountType:
          typeof account.AccountType === 'string' ? account.AccountType.trim() : null,
        active: account.Active !== false
      }))
      .filter((account) => Boolean(account.id) && Boolean(account.name));

    allAccounts.push(...mapped);
    if (mapped.length < maxResults) {
      break;
    }
    startPosition += maxResults;
  }

  return allAccounts;
};

export const createQuickBooksJournalEntry = async ({
  companyId,
  txnDate,
  privateNote,
  lines
}: {
  companyId: string;
  txnDate: string;
  privateNote?: string;
  lines: QuickBooksJournalLineInput[];
}) => {
  if (!lines.length) {
    throw new Error('quickbooks_journal_lines_empty');
  }

  const secret = await ensureFreshQuickBooksSecret(companyId);
  if (!secret) {
    throw new Error('quickbooks_not_connected');
  }

  const payload = (await requestQuickBooksApi({
    companyId,
    method: 'POST',
    path: `/v3/company/${secret.realmId}/journalentry`,
    query: {
      minorversion: 75
    },
    body: {
      TxnDate: txnDate,
      PrivateNote: privateNote ?? '',
      Line: lines.map((line) => ({
        DetailType: 'JournalEntryLineDetail',
        Amount: Number(line.amount.toFixed(2)),
        Description: line.description ?? undefined,
        JournalEntryLineDetail: {
          PostingType: line.postingType,
          AccountRef: { value: line.accountId }
        }
      }))
    }
  })) as {
    JournalEntry?: { Id?: string; TxnDate?: string };
  };

  const journalEntryId = String(payload.JournalEntry?.Id ?? '').trim();
  if (!journalEntryId) {
    throw new Error('quickbooks_journal_id_missing');
  }
  return {
    journalEntryId,
    txnDate: String(payload.JournalEntry?.TxnDate ?? txnDate)
  };
};

const pickDisplayName = (row: Record<string, unknown>) => {
  const displayName = String(row.DisplayName ?? '').trim();
  if (displayName) return displayName;
  const fullyQualifiedName = String(row.FullyQualifiedName ?? '').trim();
  if (fullyQualifiedName) return fullyQualifiedName;
  const givenName = String(row.GivenName ?? '').trim();
  const familyName = String(row.FamilyName ?? '').trim();
  const combined = `${givenName} ${familyName}`.trim();
  if (combined) return combined;
  return String(row.Name ?? '').trim();
};

export const listQuickBooksEntities = async (
  companyId: string,
  entityType: QuickBooksEntityType
): Promise<QuickBooksEntityRecord[]> => {
  const secret = await ensureFreshQuickBooksSecret(companyId);
  if (!secret) {
    throw new Error('quickbooks_not_connected');
  }

  const typeMap: Record<QuickBooksEntityType, string> = {
    vendor: 'Vendor',
    customer: 'Customer',
    employee: 'Employee'
  };

  const queryType = typeMap[entityType];
  const all: QuickBooksEntityRecord[] = [];
  let startPosition = 1;
  const maxResults = 1000;

  while (true) {
    const queryStatement = `select * from ${queryType} startposition ${startPosition} maxresults ${maxResults}`;
    const payload = (await requestQuickBooksApi({
      companyId,
      method: 'GET',
      path: `/v3/company/${secret.realmId}/query`,
      query: {
        query: queryStatement,
        minorversion: 75
      }
    })) as QuickBooksApiEnvelope;

    const rowsRaw = Array.isArray(payload.QueryResponse?.[queryType])
      ? (payload.QueryResponse?.[queryType] as Array<Record<string, unknown>>)
      : [];

    const mapped = rowsRaw
      .map((row) => ({
        id: String(row.Id ?? '').trim(),
        displayName: pickDisplayName(row),
        active: row.Active !== false,
        raw: row
      }))
      .filter((row) => Boolean(row.id) && Boolean(row.displayName));

    all.push(...mapped);
    if (mapped.length < maxResults) {
      break;
    }
    startPosition += maxResults;
  }

  return all;
};

const parseTransactionCreateId = (
  payload: Record<string, unknown>,
  key: 'Purchase' | 'Deposit' | 'Transfer'
) => {
  const container = payload[key] as { Id?: string; TxnDate?: string } | undefined;
  const txnId = String(container?.Id ?? '').trim();
  const txnDate = String(container?.TxnDate ?? '').trim();
  if (!txnId) {
    throw new Error(`quickbooks_${key.toLowerCase()}_id_missing`);
  }
  return {
    txnId,
    txnDate
  };
};

export const createQuickBooksExpenseTransaction = async (args: {
  companyId: string;
  txnDate: string;
  amount: number;
  bankAccountId: string;
  categoryAccountId: string;
  payeeRefId?: string;
  memo?: string;
}): Promise<QuickBooksTxnCreateResult> => {
  const secret = await ensureFreshQuickBooksSecret(args.companyId);
  if (!secret) throw new Error('quickbooks_not_connected');

  const payload = (await requestQuickBooksApi({
    companyId: args.companyId,
    method: 'POST',
    path: `/v3/company/${secret.realmId}/purchase`,
    query: { minorversion: 75 },
    body: {
      TxnDate: args.txnDate,
      PaymentType: 'Cash',
      AccountRef: { value: args.bankAccountId },
      PrivateNote: args.memo ?? '',
      EntityRef: args.payeeRefId ? { value: args.payeeRefId } : undefined,
      Line: [
        {
          Amount: Number(Math.abs(args.amount).toFixed(2)),
          Description: args.memo ?? '',
          DetailType: 'AccountBasedExpenseLineDetail',
          AccountBasedExpenseLineDetail: {
            AccountRef: { value: args.categoryAccountId }
          }
        }
      ]
    }
  })) as Record<string, unknown>;

  const parsed = parseTransactionCreateId(payload, 'Purchase');
  return {
    txnId: parsed.txnId,
    txnDate: parsed.txnDate || args.txnDate
  };
};

export const createQuickBooksCheckTransaction = async (args: {
  companyId: string;
  txnDate: string;
  amount: number;
  bankAccountId: string;
  categoryAccountId: string;
  payeeRefId?: string;
  memo?: string;
}): Promise<QuickBooksTxnCreateResult> => {
  const secret = await ensureFreshQuickBooksSecret(args.companyId);
  if (!secret) throw new Error('quickbooks_not_connected');

  const payload = (await requestQuickBooksApi({
    companyId: args.companyId,
    method: 'POST',
    path: `/v3/company/${secret.realmId}/purchase`,
    query: { minorversion: 75 },
    body: {
      TxnDate: args.txnDate,
      PaymentType: 'Check',
      AccountRef: { value: args.bankAccountId },
      PrivateNote: args.memo ?? '',
      EntityRef: args.payeeRefId ? { value: args.payeeRefId } : undefined,
      Line: [
        {
          Amount: Number(Math.abs(args.amount).toFixed(2)),
          Description: args.memo ?? '',
          DetailType: 'AccountBasedExpenseLineDetail',
          AccountBasedExpenseLineDetail: {
            AccountRef: { value: args.categoryAccountId }
          }
        }
      ]
    }
  })) as Record<string, unknown>;

  const parsed = parseTransactionCreateId(payload, 'Purchase');
  return {
    txnId: parsed.txnId,
    txnDate: parsed.txnDate || args.txnDate
  };
};

export const createQuickBooksDepositTransaction = async (args: {
  companyId: string;
  txnDate: string;
  amount: number;
  bankAccountId: string;
  categoryAccountId: string;
  memo?: string;
}): Promise<QuickBooksTxnCreateResult> => {
  const secret = await ensureFreshQuickBooksSecret(args.companyId);
  if (!secret) throw new Error('quickbooks_not_connected');

  const payload = (await requestQuickBooksApi({
    companyId: args.companyId,
    method: 'POST',
    path: `/v3/company/${secret.realmId}/deposit`,
    query: { minorversion: 75 },
    body: {
      TxnDate: args.txnDate,
      PrivateNote: args.memo ?? '',
      DepositToAccountRef: { value: args.bankAccountId },
      Line: [
        {
          Amount: Number(Math.abs(args.amount).toFixed(2)),
          DetailType: 'DepositLineDetail',
          Description: args.memo ?? '',
          DepositLineDetail: {
            AccountRef: { value: args.categoryAccountId }
          }
        }
      ]
    }
  })) as Record<string, unknown>;

  const parsed = parseTransactionCreateId(payload, 'Deposit');
  return {
    txnId: parsed.txnId,
    txnDate: parsed.txnDate || args.txnDate
  };
};

export const createQuickBooksTransferTransaction = async (args: {
  companyId: string;
  txnDate: string;
  amount: number;
  fromAccountId: string;
  toAccountId: string;
  memo?: string;
}): Promise<QuickBooksTxnCreateResult> => {
  const secret = await ensureFreshQuickBooksSecret(args.companyId);
  if (!secret) throw new Error('quickbooks_not_connected');

  const payload = (await requestQuickBooksApi({
    companyId: args.companyId,
    method: 'POST',
    path: `/v3/company/${secret.realmId}/transfer`,
    query: { minorversion: 75 },
    body: {
      TxnDate: args.txnDate,
      Amount: Number(Math.abs(args.amount).toFixed(2)),
      FromAccountRef: { value: args.fromAccountId },
      ToAccountRef: { value: args.toAccountId },
      PrivateNote: args.memo ?? ''
    }
  })) as Record<string, unknown>;

  const parsed = parseTransactionCreateId(payload, 'Transfer');
  return {
    txnId: parsed.txnId,
    txnDate: parsed.txnDate || args.txnDate
  };
};
