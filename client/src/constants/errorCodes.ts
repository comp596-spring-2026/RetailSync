export const APP_ERROR_MESSAGES: Record<string, string> = {
  not_shared: 'Spreadsheet is not shared with the RetailSync service account.',
  not_found: 'Requested resource was not found.',
  tab_not_found: 'The selected sheet tab was not found.',
  validation_failed: 'Please check the highlighted fields and try again.',
  forbidden: 'You do not have permission to perform this action.',
  missing_oauth_callback_params:
    'Google OAuth callback was missing required parameters.',
  google_oauth_not_configured:
    'Google OAuth is not configured on the server.',
  invalid_oauth_state:
    'OAuth state check failed. Please retry connecting Google Sheets.',
  oauth_state_mismatch:
    'OAuth state did not match. Try connecting Google Sheets again.',
  access_token_missing: 'Google did not return an access token.',
  encryption_key_missing:
    'Server encryption key is missing. Set ENCRYPTION_KEY before connecting Google Sheets.',
  encryption_key_invalid:
    'Server ENCRYPTION_KEY is invalid. It must be a base64-encoded 32-byte key.',
  google_invalid_grant:
    'Google OAuth grant is invalid or expired. Retry connect and ensure redirect URI matches.',
  google_redirect_uri_mismatch:
    'Google OAuth redirect URI mismatch. Verify GOOGLE_INTEGRATION_REDIRECT_URI in server and Google Cloud console.',
  google_invalid_client:
    'Google OAuth client credentials are invalid. Check GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET.',
  google_access_denied:
    'Google access was denied during OAuth consent.',
  google_unauthorized_client:
    'Google OAuth client is not authorized for this flow.',
  google_settings_conflict:
    'Failed to persist Google OAuth settings due to a server conflict. Retry once.',
  google_oauth_callback_failed:
    'Google Sheets connection failed. Please try again.',
};

export const getAppErrorMessage = (code?: string | null, fallback = 'Something went wrong.'): string => {
  if (!code) return fallback;
  return APP_ERROR_MESSAGES[code] ?? fallback;
};
