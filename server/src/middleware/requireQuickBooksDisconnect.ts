import { requireAnyPermission } from './requireAnyPermission';

/** Disconnect requires the disconnect action (connect-only is legacy paired grant). */
export const requireQuickBooksDisconnect = requireAnyPermission([
  { moduleKey: 'quickbooks', action: 'disconnect' },
  { moduleKey: 'quickbooks', action: 'connect' }
]);
