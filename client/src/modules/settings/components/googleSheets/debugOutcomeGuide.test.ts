import { describe, expect, it } from "vitest";
import { detectDebugOutcome, getDebugOutcome } from "./debugOutcomeGuide";

describe("detectDebugOutcome", () => {
  it("detects oauth disconnected", () => {
    expect(detectDebugOutcome("OAuth token is not valid or not connected.")).toBe(
      "oauth_not_connected",
    );
  });

  it("detects oauth expired token edge case", () => {
    expect(detectDebugOutcome("Refresh token revoked and token expired")).toBe(
      "oauth_expired",
    );
  });

  it("detects missing spreadsheet configuration", () => {
    expect(detectDebugOutcome("No active OAuth spreadsheet configured.")).toBe(
      "spreadsheet_not_configured",
    );
  });

  it("detects permission denied variants", () => {
    expect(detectDebugOutcome("403 Permission denied for this spreadsheet")).toBe(
      "permission_denied",
    );
  });

  it("detects sheet or tab missing", () => {
    expect(detectDebugOutcome("tab_not_found")).toBe("sheet_or_tab_not_found");
  });

  it("detects no tabs / empty header", () => {
    expect(detectDebugOutcome("No tabs found in spreadsheet.")).toBe(
      "empty_header_or_no_tabs",
    );
    expect(detectDebugOutcome("Sheet read succeeded but header row is empty.")).toBe(
      "empty_header_or_no_tabs",
    );
  });

  it("detects missing required mapping fields", () => {
    expect(detectDebugOutcome("Missing required mapped fields: date, highTax")).toBe(
      "required_mapping_missing",
    );
  });

  it("detects rate limit and network edge cases", () => {
    expect(detectDebugOutcome("429 rate limit exceeded")).toBe("rate_limited");
    expect(detectDebugOutcome("ECONNRESET: network timeout")).toBe("network_issue");
  });

  it("falls back to unknown", () => {
    expect(detectDebugOutcome("Unexpected parse failure")).toBe("unknown");
    expect(getDebugOutcome("Unexpected parse failure").key).toBe("unknown");
  });
});
