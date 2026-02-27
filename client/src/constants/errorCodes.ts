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
  google_oauth_callback_failed:
    'Google Sheets connection failed. Please try again.',
};

export const getAppErrorMessage = (code?: string | null, fallback = 'Something went wrong.'): string => {
  if (!code) return fallback;
  return APP_ERROR_MESSAGES[code] ?? fallback;
};

