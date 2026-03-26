import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { QuickBooksSettings } from '@retailsync/shared';
import { QuickBooksIntegrationCard } from './index';
import type { QuickBooksOAuthWorkspaceStatus } from '../../types/quickbooks';

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
  overrides: Partial<QuickBooksOAuthWorkspaceStatus> = {},
): QuickBooksOAuthWorkspaceStatus => ({
  ok: true,
  reason: null,
  connected: true,
  degraded: false,
  status: 'connected',
  needsReconnect: false,
  environment: 'sandbox',
  realmId: 'realm-1',
  companyName: 'RetailSync QB',
  expiresInSec: 3600,
  health: {
    status: 'healthy',
    checkedAt: '2026-03-16T14:06:00.000Z',
    refreshedAt: '2026-03-16T14:05:00.000Z',
    accessTokenExpiresAt: '2026-03-16T15:06:00.000Z',
    accessTokenExpiresInSec: 3600,
    refreshTokenExpiresAt: '2026-04-16T14:06:00.000Z',
    refreshTokenExpiresInSec: 2678400,
    lastRefreshError: null,
    lastRefreshErrorAt: null,
  },
  ...overrides,
});

const renderCard = ({
  settings = buildSettings(),
  oauthStatus = null,
}: {
  settings?: QuickBooksSettings | null;
  oauthStatus?: QuickBooksOAuthWorkspaceStatus | null;
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

  it('shows degraded state while keeping normal sync actions available', () => {
    const handlers = renderCard({
      settings: buildSettings({
        connected: true,
        companyName: 'RetailSync QB',
        realmId: 'realm-1',
      }),
      oauthStatus: buildOauthStatus({
        ok: false,
        degraded: true,
        status: 'degraded',
        health: {
          status: 'degraded',
          checkedAt: '2026-03-16T14:06:00.000Z',
          refreshedAt: '2026-03-16T14:05:00.000Z',
          accessTokenExpiresAt: '2026-03-16T14:16:00.000Z',
          accessTokenExpiresInSec: 600,
          refreshTokenExpiresAt: '2026-04-16T14:06:00.000Z',
          refreshTokenExpiresInSec: 2678400,
          lastRefreshError: 'Recent token refresh failed',
          lastRefreshErrorAt: '2026-03-16T14:05:00.000Z',
        },
      }),
    });

    expect(screen.getAllByText(/^Degraded$/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Recent token refresh failed/i).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: /Refresh Reference Data/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Refresh Reference Data/i }));
    expect(handlers.onRefreshReferences).toHaveBeenCalledTimes(1);
  });

  it('shows reconnect-required state when oauth repair is needed', () => {
    const handlers = renderCard({
      settings: buildSettings({
        connected: true,
        companyName: 'RetailSync QB',
        realmId: 'realm-1',
      }),
      oauthStatus: buildOauthStatus({
        ok: false,
        status: 'connected',
        needsReconnect: true,
        reason: 'quickbooks_refresh_token_missing',
        expiresInSec: null,
        health: {
          status: 'degraded',
          checkedAt: '2026-03-16T14:06:00.000Z',
          refreshedAt: '2026-03-16T14:05:00.000Z',
          accessTokenExpiresAt: null,
          accessTokenExpiresInSec: null,
          refreshTokenExpiresAt: null,
          refreshTokenExpiresInSec: null,
          lastRefreshError: 'Refresh token is missing',
          lastRefreshErrorAt: '2026-03-16T14:05:00.000Z',
        },
      }),
    });

    expect(screen.getAllByText(/Reconnect required/i).length).toBeGreaterThan(0);
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
