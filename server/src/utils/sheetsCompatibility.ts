import { getConnectorDefinition } from './sheetsConnectors';

export type ColumnMap = Record<string, string>;

export type CompatibilityReport = {
  status: 'compatible' | 'warning' | 'error';
  missingColumns: string[];
  missingTargets: string[];
  duplicateTargets: string[];
  warnings: string[];
};

const normalizeTarget = (target: string) => {
  const trimmed = String(target ?? '').trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('custom:')) {
    return `custom:${trimmed.replace(/^custom:/, '').trim().toLowerCase()}`;
  }
  return trimmed.toLowerCase();
};

export const validateColumnMapOneToOne = (mapping: ColumnMap): { ok: boolean; duplicateTargets: string[] } => {
  const counts = new Map<string, number>();
  for (const value of Object.values(mapping ?? {})) {
    if (!value) continue;
    const normalized = normalizeTarget(value);
    if (!normalized) continue;
    counts.set(normalized, (counts.get(normalized) ?? 0) + 1);
  }

  const duplicateTargets = Array.from(counts.entries())
    .filter(([, count]) => count > 1)
    .map(([key]) => key);

  return {
    ok: duplicateTargets.length === 0,
    duplicateTargets
  };
};

export const computeCompatibility = (params: {
  columns: string[];
  mapping: ColumnMap;
  requiredTargets: string[];
}): CompatibilityReport => {
  const headerSet = new Set((params.columns ?? []).map((column) => String(column).trim()));
  const mappingEntries = Object.entries(params.mapping ?? {});

  const missingColumns = mappingEntries
    .filter(([sourceColumn]) => !headerSet.has(String(sourceColumn).trim()))
    .map(([sourceColumn]) => String(sourceColumn));

  const mappedTargets = new Set(
    mappingEntries
      .map(([, target]) => String(target ?? '').trim())
      .filter(Boolean)
  );

  const missingTargets = (params.requiredTargets ?? []).filter((target) => !mappedTargets.has(target));
  const oneToOne = validateColumnMapOneToOne(params.mapping);

  const warnings: string[] = [];
  if (mappingEntries.length === 0) warnings.push('No mapping entries provided');
  if (missingColumns.length > 0) warnings.push('Some mapped source columns are missing in sheet header');

  if (missingTargets.length > 0 || oneToOne.duplicateTargets.length > 0) {
    return {
      status: 'error',
      missingColumns,
      missingTargets,
      duplicateTargets: oneToOne.duplicateTargets,
      warnings
    };
  }

  if (warnings.length > 0) {
    return {
      status: 'warning',
      missingColumns,
      missingTargets,
      duplicateTargets: oneToOne.duplicateTargets,
      warnings
    };
  }

  return {
    status: 'compatible',
    missingColumns: [],
    missingTargets: [],
    duplicateTargets: [],
    warnings: []
  };
};

export const computeCompatibilityForConnector = (params: {
  connectorKey: string;
  columns: string[];
  mapping: ColumnMap;
}) => {
  const connector = getConnectorDefinition(params.connectorKey);
  return computeCompatibility({
    columns: params.columns,
    mapping: params.mapping,
    requiredTargets: connector.requiredTargets
  });
};
