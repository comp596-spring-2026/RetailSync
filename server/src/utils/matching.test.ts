import { describe, expect, it } from 'vitest';
import { suggestMappings } from './matching';

describe('suggestMappings', () => {
  it('suggests fields by header names and sample types', () => {
    const headers = ['Item SKU', 'Qty', 'Unit Price', 'Txn Date'];
    const sampleRows = [
      ['ABC-1', '2', '11.50', '2026-02-20'],
      ['ABC-2', '3', '7.99', '2026-02-21']
    ];
    const targetFields = ['sku', 'qty', 'price', 'date'];

    const suggestions = suggestMappings(headers, sampleRows, targetFields);

    expect(suggestions).toHaveLength(4);
    expect(suggestions.find((entry) => entry.sourceHeader === 'Item SKU')?.targetField).toBe('sku');
    expect(suggestions.find((entry) => entry.sourceHeader === 'Qty')?.targetField).toBe('qty');
    expect(suggestions.find((entry) => entry.sourceHeader === 'Unit Price')?.targetField).toBe('price');
    expect(suggestions.find((entry) => entry.sourceHeader === 'Txn Date')?.targetField).toBe('date');
  });
});
