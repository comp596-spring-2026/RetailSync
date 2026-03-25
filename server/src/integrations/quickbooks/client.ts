import { sleep, withRetries } from '../common/retry';
import {
  ensureFreshQuickBooksSecret,
  refreshQuickBooksSecretForCompany
} from './auth';
import {
  QuickBooksAccountRecord,
  QuickBooksApiEnvelope,
  QuickBooksEntityRecord,
  QuickBooksEntityType,
  QuickBooksJournalLineInput,
  QuickBooksReadQueryResult,
  QuickBooksSecretPayload
} from './types';

type QuickBooksTxnCreateResult = {
  txnId: string;
  txnDate: string;
};

const QUICKBOOKS_SANDBOX_API_BASE = 'https://sandbox-quickbooks.api.intuit.com';
const QUICKBOOKS_PROD_API_BASE = 'https://quickbooks.api.intuit.com';
const QUICKBOOKS_RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

const getQuickBooksApiBase = (environment: QuickBooksSecretPayload['environment']) =>
  environment === 'production' ? QUICKBOOKS_PROD_API_BASE : QUICKBOOKS_SANDBOX_API_BASE;

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
      if (value === undefined || value === null || value === '') {
        continue;
      }
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
};

const parseQuickBooksApiBody = async (response: Response) => {
  const raw = await response.text();
  if (!raw) {
    return { raw, parsed: null as Record<string, unknown> | null };
  }
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
  if (!payload) {
    return null;
  }
  const fault = (payload as QuickBooksApiEnvelope).Fault;
  const first = fault?.Error?.[0];
  const message = first?.Detail || first?.Message;
  return message ? String(message) : null;
};

type QuickBooksRequestAttemptError = {
  kind: 'network' | 'response';
  message: string;
  status?: number;
};

const fetchQuickBooksAttempt = async ({
  companyId,
  secret,
  method,
  path,
  query,
  body,
  attempt
}: {
  companyId: string;
  secret: QuickBooksSecretPayload;
  method: 'GET' | 'POST';
  path: string;
  query?: Record<string, string | number | undefined | null>;
  body?: Record<string, unknown>;
  attempt: number;
}) => {
  const attemptStartedAt = Date.now();

  try {
    let result = await performQuickBooksRequest({ secret, method, path, query, body });
    if (result.response.status === 401) {
      const refreshedSecret = await refreshQuickBooksSecretForCompany(companyId);
      result = await performQuickBooksRequest({
        secret: refreshedSecret,
        method,
        path,
        query,
        body
      });
    }

    console.info('[quickbooks.api.request]', {
      companyId,
      method,
      path,
      attempt,
      status: result.response.status,
      latencyMs: Date.now() - attemptStartedAt
    });

    if (!result.response.ok) {
      const fault = parseFaultMessage(result.parsed);
      throw {
        kind: 'response',
        message: `quickbooks_api_failed:${result.response.status}:${fault ?? (result.raw || 'unknown')}`,
        status: result.response.status
      } satisfies QuickBooksRequestAttemptError;
    }

    const fault = parseFaultMessage(result.parsed);
    if (fault) {
      throw {
        kind: 'response',
        message: `quickbooks_api_fault:${fault}`,
        status: result.response.status
      } satisfies QuickBooksRequestAttemptError;
    }

    return result.parsed ?? {};
  } catch (error) {
    if (
      error &&
      typeof error === 'object' &&
      'kind' in error &&
      (error.kind === 'network' || error.kind === 'response')
    ) {
      throw error;
    }

    console.error('[quickbooks.api.request.error]', {
      companyId,
      method,
      path,
      attempt,
      latencyMs: Date.now() - attemptStartedAt
    });
    const message = error instanceof Error ? error.message : String(error);
    throw {
      kind: 'network',
      message: `quickbooks_api_failed:network:${message}`
    } satisfies QuickBooksRequestAttemptError;
  }
};

export const fetchQuickBooksCompanyName = async ({
  environment,
  realmId,
  accessToken
}: {
  environment: QuickBooksSecretPayload['environment'];
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
    if (!response.ok) {
      return null;
    }
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
  const secret = await ensureFreshQuickBooksSecret(companyId);
  if (!secret) {
    throw new Error('quickbooks_not_connected');
  }

  try {
    return await withRetries({
      attempts: 3,
      shouldRetry: (error, attempt) =>
        Boolean(
          attempt < 3 &&
            error &&
            typeof error === 'object' &&
            'kind' in error &&
            ((error.kind === 'network') ||
              ('status' in error &&
                typeof error.status === 'number' &&
                QUICKBOOKS_RETRYABLE_STATUS.has(error.status)))
        ),
      onRetry: async (_error, attempt) => {
        await sleep(250 * 2 ** (attempt - 1));
      },
      run: async (attempt) =>
        fetchQuickBooksAttempt({
          companyId,
          secret,
          method,
          path,
          query,
          body,
          attempt
        })
    });
  } catch (error) {
    const message =
      error && typeof error === 'object' && 'message' in error
        ? String(error.message)
        : 'quickbooks_api_failed:retry_exhausted';
    throw new Error(message);
  }
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

  return (await requestQuickBooksApi({
    companyId,
    method: 'GET',
    path: `/v3/company/${secret.realmId}/query`,
    query: {
      query: normalizedQuery,
      minorversion: 75
    }
  })) as QuickBooksReadQueryResult;
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
      ? (payload.QueryResponse.Account as Array<Record<string, unknown>>)
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

const pickDisplayName = (row: Record<string, unknown>) => {
  const displayName = String(row.DisplayName ?? '').trim();
  if (displayName) {
    return displayName;
  }
  const fullyQualifiedName = String(row.FullyQualifiedName ?? '').trim();
  if (fullyQualifiedName) {
    return fullyQualifiedName;
  }
  const givenName = String(row.GivenName ?? '').trim();
  const familyName = String(row.FamilyName ?? '').trim();
  const combined = `${givenName} ${familyName}`.trim();
  if (combined) {
    return combined;
  }
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

const createPurchaseTransaction = async (args: {
  companyId: string;
  txnDate: string;
  amount: number;
  bankAccountId: string;
  categoryAccountId: string;
  payeeRefId?: string;
  memo?: string;
  paymentType: 'Cash' | 'Check';
}): Promise<QuickBooksTxnCreateResult> => {
  const secret = await ensureFreshQuickBooksSecret(args.companyId);
  if (!secret) {
    throw new Error('quickbooks_not_connected');
  }

  const payload = (await requestQuickBooksApi({
    companyId: args.companyId,
    method: 'POST',
    path: `/v3/company/${secret.realmId}/purchase`,
    query: { minorversion: 75 },
    body: {
      TxnDate: args.txnDate,
      PaymentType: args.paymentType,
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

export const createQuickBooksExpenseTransaction = (args: {
  companyId: string;
  txnDate: string;
  amount: number;
  bankAccountId: string;
  categoryAccountId: string;
  payeeRefId?: string;
  memo?: string;
}) => createPurchaseTransaction({ ...args, paymentType: 'Cash' });

export const createQuickBooksCheckTransaction = (args: {
  companyId: string;
  txnDate: string;
  amount: number;
  bankAccountId: string;
  categoryAccountId: string;
  payeeRefId?: string;
  memo?: string;
}) => createPurchaseTransaction({ ...args, paymentType: 'Check' });

export const createQuickBooksDepositTransaction = async (args: {
  companyId: string;
  txnDate: string;
  amount: number;
  bankAccountId: string;
  categoryAccountId: string;
  memo?: string;
}): Promise<QuickBooksTxnCreateResult> => {
  const secret = await ensureFreshQuickBooksSecret(args.companyId);
  if (!secret) {
    throw new Error('quickbooks_not_connected');
  }

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
  if (!secret) {
    throw new Error('quickbooks_not_connected');
  }

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
