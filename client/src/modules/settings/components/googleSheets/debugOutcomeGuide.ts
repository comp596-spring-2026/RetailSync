export type DebugOutcomeKey =
  | "oauth_not_connected"
  | "oauth_expired"
  | "spreadsheet_not_configured"
  | "permission_denied"
  | "sheet_or_tab_not_found"
  | "empty_header_or_no_tabs"
  | "required_mapping_missing"
  | "rate_limited"
  | "network_issue"
  | "unknown";

export type DebugOutcome = {
  key: DebugOutcomeKey;
  title: string;
  when: string;
  solution: string;
};

export const DEBUG_OUTCOME_GUIDE: DebugOutcome[] = [
  {
    key: "oauth_not_connected",
    title: "Source not connected",
    when: "Debug says token is invalid or account is not connected.",
    solution:
      "Use Shared source if your company already has sheet access. Only reconnect OAuth if this sheet is intentionally configured to use OAuth.",
  },
  {
    key: "oauth_expired",
    title: "OAuth token expired",
    when: "Debug fails with token expired or refresh token errors.",
    solution:
      "If this sheet uses OAuth, reconnect OAuth to refresh credentials. If this sheet uses Shared source, switch to Shared source configuration and retry Debug.",
  },
  {
    key: "spreadsheet_not_configured",
    title: "No spreadsheet configured",
    when: "Debug reports missing active/default spreadsheet.",
    solution: "Open Configure sync, select sheet and tab, save mapping, then rerun Debug.",
  },
  {
    key: "permission_denied",
    title: "Permission denied",
    when: "Google API returns 403, permission denied, or access denied.",
    solution: "Share sheet with the configured account or reconnect with the correct user account.",
  },
  {
    key: "sheet_or_tab_not_found",
    title: "Sheet/tab missing",
    when: "Debug reports not found, tab not found, or spreadsheet not found.",
    solution: "Select an existing spreadsheet and tab, then save configuration.",
  },
  {
    key: "empty_header_or_no_tabs",
    title: "No tabs or empty header",
    when: "Debug finds zero tabs or an empty header row.",
    solution: "Ensure the tab exists and row 1 contains headers, then retry.",
  },
  {
    key: "required_mapping_missing",
    title: "Required mapping missing",
    when: "Debug says required mapped fields are missing.",
    solution: "Update field mapping for required DB fields and save mapping.",
  },
  {
    key: "rate_limited",
    title: "Google API rate limit",
    when: "Google returns 429 or rate limit exceeded.",
    solution: "Wait and retry, or reduce manual debug/sync frequency.",
  },
  {
    key: "network_issue",
    title: "Network/server error",
    when: "Request timeout, DNS, or temporary server connectivity failure.",
    solution: "Retry debug in a few seconds and check server/network health.",
  },
  {
    key: "unknown",
    title: "Unknown failure",
    when: "Error does not match known scenarios.",
    solution: "Use the exact error text to investigate logs and verify sheet settings manually.",
  },
];

export const detectDebugOutcome = (rawMessage?: string | null): DebugOutcomeKey => {
  const message = String(rawMessage ?? "").toLowerCase();
  if (!message) return "unknown";

  if (
    message.includes("oauth token is not valid") ||
    message.includes("not connected")
  ) {
    return "oauth_not_connected";
  }
  if (message.includes("token expired") || message.includes("refresh token")) {
    return "oauth_expired";
  }
  if (
    message.includes("no active oauth spreadsheet configured") ||
    message.includes("no default shared sheet profile configured")
  ) {
    return "spreadsheet_not_configured";
  }
  if (
    message.includes("permission denied") ||
    message.includes("access denied") ||
    message.includes("forbidden") ||
    message.includes("403")
  ) {
    return "permission_denied";
  }
  if (
    message.includes("tab_not_found") ||
    message.includes("tab not found") ||
    message.includes("spreadsheet not found") ||
    message.includes("not_found")
  ) {
    return "sheet_or_tab_not_found";
  }
  if (
    message.includes("no tabs found") ||
    message.includes("header row is empty")
  ) {
    return "empty_header_or_no_tabs";
  }
  if (message.includes("missing required mapped fields")) {
    return "required_mapping_missing";
  }
  if (message.includes("rate limit") || message.includes("429")) {
    return "rate_limited";
  }
  if (
    message.includes("timeout") ||
    message.includes("network") ||
    message.includes("econn") ||
    message.includes("enotfound")
  ) {
    return "network_issue";
  }

  return "unknown";
};

export const getDebugOutcome = (rawMessage?: string | null): DebugOutcome => {
  const key = detectDebugOutcome(rawMessage);
  return (
    DEBUG_OUTCOME_GUIDE.find((entry) => entry.key === key) ??
    DEBUG_OUTCOME_GUIDE[DEBUG_OUTCOME_GUIDE.length - 1]
  );
};
