export type TrackingPayload = Record<string, unknown>;

const isVitest = import.meta.env.VITEST;
const shouldLogTrackingEvent = import.meta.env.DEV && !isVitest;

export const track = (eventName: string, payload: TrackingPayload = {}) => {
  const event = {
    eventName,
    ts: new Date().toISOString(),
    ...payload,
  };

  if (isVitest) {
    return;
  }

  if (shouldLogTrackingEvent) {
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
