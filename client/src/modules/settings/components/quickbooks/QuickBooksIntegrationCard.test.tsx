import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { QuickBooksSettings } from '@retailsync/shared';
import {
  QuickBooksIntegrationCard,
  type QuickBooksOAuthStatus,
} from './index';

const baseSettings: QuickBooksSettings = {
  connected: false,
  environment: 'sandbox',
  realmId: null,
  companyName: null,
  lastPullStatus: 'idle',
  lastPullAt: null,
  lastPullCount: 0,
  lastPullError: null,
  lastPushStatus: 'idle',
  lastPushAt: null,
  lastPushCount: 0,
  lastPushError: null,
  updatedAt: null,
};

const buildSettings = (
  overrides: Partial<QuickBooksSettings> = {},
): QuickBooksSettings => ({
  ...baseSettings,
  ...overrides,
});

const buildOauthStatus = (
  overrides: Partial<QuickBooksOAuthStatus> = {},
): QuickBooksOAuthStatus => ({
  ok: true,
  reason: null,
  environment: 'sandbox',
  realmId: 'realm-1',
  companyName: 'RetailSync QB',
  expiresInSec: 3600,
  ...overrides,
});

const renderCard = ({
  settings = buildSettings(),
  oauthStatus = null,
}: {
  settings?: QuickBooksSettings | null;
  oauthStatus?: QuickBooksOAuthStatus | null;
} = {}) => {
  const handlers = {
    onConnect: vi.fn(),
    onDisconnect: vi.fn(),
    onRefreshReferences: vi.fn(),
    onPostApproved: vi.fn(),
    onRefreshStatus: vi.fn(),
  };

  render(
    <QuickBooksIntegrationCard
      settings={settings}
      oauthStatus={oauthStatus}
      canManageConnection
      canSync
      canRefreshStatus
      canViewHealth
      busy={false}
      loading={false}
      onConnect={handlers.onConnect}
      onDisconnect={handlers.onDisconnect}
      onRefreshReferences={handlers.onRefreshReferences}
      onPostApproved={handlers.onPostApproved}
      onRefreshStatus={handlers.onRefreshStatus}
      initialExpanded
    />,
  );

  return handlers;
};

afterEach(() => {
  cleanup();
});

describe('QuickBooksIntegrationCard', () => {
  it('shows disconnected state with connect CTA', () => {
    const handlers = renderCard();

    expect(screen.getAllByText(/Not configured/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/QuickBooks Company/i)).toBeInTheDocument();
    expect(screen.getByText(/No company connected yet\./i)).toBeInTheDocument();

    const connectButton = screen.getByRole('button', { name: /Connect QuickBooks/i });
    fireEvent.click(connectButton);
    expect(handlers.onConnect).toHaveBeenCalledTimes(1);
  });

  it('shows connected state with refresh and disconnect actions', () => {
    const handlers = renderCard({
      settings: buildSettings({
        connected: true,
        environment: 'production',
        companyName: 'RetailSync QB',
        realmId: 'realm-1',
        lastPullStatus: 'success',
        lastPullAt: '2026-03-16T14:00:00.000Z',
        lastPullCount: 27,
        lastPushStatus: 'success',
        lastPushAt: '2026-03-16T14:05:00.000Z',
        lastPushCount: 8,
        updatedAt: '2026-03-16T14:06:00.000Z',
      }),
      oauthStatus: buildOauthStatus({
        environment: 'production',
      }),
    });

    expect(screen.getAllByText(/^Connected$/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/RetailSync QB • Realm ID realm-1/i)).toBeInTheDocument();
    expect(screen.getAllByText(/^Production$/i).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: /Disconnect QuickBooks/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Refresh Reference Data/i }));
    expect(handlers.onRefreshReferences).toHaveBeenCalledTimes(1);
  });

  it('shows needs-attention state when token is invalid', () => {
    const handlers = renderCard({
      settings: buildSettings({
        connected: true,
        companyName: 'RetailSync QB',
        realmId: 'realm-1',
      }),
      oauthStatus: buildOauthStatus({
        ok: false,
        reason: 'quickbooks_refresh_token_missing',
        expiresInSec: null,
      }),
    });

    expect(screen.getAllByText(/Needs attention/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Refresh token is missing/i).length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('button', { name: /Reconnect QuickBooks/i }));
    expect(handlers.onConnect).toHaveBeenCalledTimes(1);
  });

  it('shows sandbox warning only for sandbox connections', () => {
    renderCard({
      settings: buildSettings({
        connected: true,
        environment: 'sandbox',
        companyName: 'RetailSync Sandbox',
        realmId: 'sandbox-realm',
      }),
      oauthStatus: buildOauthStatus({
        environment: 'sandbox',
        companyName: 'RetailSync Sandbox',
        realmId: 'sandbox-realm',
      }),
    });

    expect(
      screen.getAllByText(/Sandbox mode is active\. Use development credentials and a sandbox QuickBooks company here\./i)
        .length,
    ).toBeGreaterThan(0);
    expect(screen.getAllByText(/^Sandbox$/i).length).toBeGreaterThan(0);
  });
});
