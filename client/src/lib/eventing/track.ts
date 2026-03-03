export type TrackingPayload = Record<string, unknown>;

const isDev = import.meta.env.DEV;

export const track = (eventName: string, payload: TrackingPayload = {}) => {
  const event = {
    eventName,
    ts: new Date().toISOString(),
    ...payload,
  };

  if (isDev) {
    // eslint-disable-next-line no-console
    console.info('[track]', event);
    return;
  }

  try {
    const body = JSON.stringify(event);
    if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
      navigator.sendBeacon('/api/events', body);
      return;
    }
    void fetch('/api/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
    });
  } catch {
    // Intentionally ignore tracking failures.
  }
};
