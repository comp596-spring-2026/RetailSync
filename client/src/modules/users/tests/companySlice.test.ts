import { describe, expect, it } from 'vitest';
import companyReducer, { clearCompany, setCompany } from '../state/companySlice';

describe('companySlice', () => {
  it('stores company details with setCompany', () => {
    const next = companyReducer(
      undefined,
      setCompany({
        _id: 'company-1',
        name: 'RetailSync HQ',
        code: 'RSHQ',
        businessType: 'retail',
        address: '123 Main St',
        phone: '555-1111',
        email: 'ops@retailsync.test',
        timezone: 'America/Los_Angeles',
        currency: 'USD'
      })
    );

    expect(next.company?.name).toBe('RetailSync HQ');
    expect(next.company?.code).toBe('RSHQ');
  });

  it('clears company state with clearCompany', () => {
    const seeded = companyReducer(
      undefined,
      setCompany({
        _id: 'company-1',
        name: 'RetailSync HQ',
        code: 'RSHQ',
        businessType: 'retail',
        address: '123 Main St',
        phone: '555-1111',
        email: 'ops@retailsync.test',
        timezone: 'America/Los_Angeles',
        currency: 'USD'
      })
    );

    const cleared = companyReducer(seeded, clearCompany());
    expect(cleared.company).toBeNull();
  });
});
