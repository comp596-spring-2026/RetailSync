import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { HomeDemoPage } from './HomeDemoPage';

describe('HomeDemoPage', () => {
  it('renders project overview and legal links', () => {
    render(
      <MemoryRouter>
        <HomeDemoPage />
      </MemoryRouter>
    );

    expect(screen.getByRole('heading', { name: 'RetailSync' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /privacy policy/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /terms of service/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Data Deletion' })).toBeInTheDocument();
  });
});
