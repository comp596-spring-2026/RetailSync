import { Schema } from 'mongoose';
import { getRequestContext } from '../../config/requestContext';

type TenantPluginOptions = {
  field?: string;
};

type TenantFilter = Record<string, unknown>;

const toIdString = (value: unknown) => {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'object' && value && 'toString' in value && typeof value.toString === 'function') {
    return value.toString();
  }
  return String(value);
};

const ensureTenantOnFilter = (filter: TenantFilter, tenantId: string, field: string) => {
  const existing = filter[field];
  if (existing === undefined) {
    filter[field] = tenantId;
    return;
  }

  const existingId = toIdString(existing);
  if (existingId !== tenantId) {
    throw new Error('Tenant mismatch in query filter');
  }
};

export const tenantPlugin = (schema: Schema, options?: TenantPluginOptions) => {
  const tenantField = options?.field ?? 'companyId';

  const guardedQueryMethods = [
    'find',
    'findOne',
    'count',
    'countDocuments',
    'findOneAndUpdate',
    'findOneAndDelete',
    'findOneAndRemove',
    'updateOne',
    'updateMany',
    'deleteOne',
    'deleteMany'
  ] as const;

  for (const method of guardedQueryMethods) {
    schema.pre(method, function tenantScopeGuard() {
      const filter = (this.getFilter?.() ?? {}) as TenantFilter;
      const context = getRequestContext();
      const tenantId = context?.tenantId;

      if (!tenantId) {
        if (filter[tenantField] === undefined) {
          throw new Error(`Tenant context missing for ${method}`);
        }
        return;
      }

      ensureTenantOnFilter(filter, tenantId, tenantField);
      this.setQuery(filter);
    });
  }

  schema.pre('aggregate', function tenantAggregateGuard() {
    const pipeline = this.pipeline();
    const context = getRequestContext();
    const tenantId = context?.tenantId;

    const firstMatch = pipeline[0]?.$match as TenantFilter | undefined;

    if (!tenantId) {
      if (!firstMatch || firstMatch[tenantField] === undefined) {
        throw new Error('Tenant context missing for aggregate');
      }
      return;
    }

    if (firstMatch && firstMatch[tenantField] !== undefined) {
      const matchId = toIdString(firstMatch[tenantField]);
      if (matchId !== tenantId) {
        throw new Error('Tenant mismatch in aggregate pipeline');
      }
      return;
    }

    pipeline.unshift({ $match: { [tenantField]: tenantId } });
  });
};
