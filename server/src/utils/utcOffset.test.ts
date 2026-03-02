import { describe, expect, it } from "vitest";
import { normalizeUtcOffset, parseUtcOffsetToMinutes } from "./utcOffset";

describe("utcOffset utils", () => {
  it("normalizes shorthand offsets to UTC format", () => {
    expect(normalizeUtcOffset("+7:00")).toBe("UTC+07:00");
    expect(normalizeUtcOffset("utc-8:00")).toBe("UTC-08:00");
  });

  it("rejects invalid offset values", () => {
    expect(normalizeUtcOffset("America/Los_Angeles")).toBeNull();
    expect(normalizeUtcOffset("UTC+15:00")).toBeNull();
    expect(normalizeUtcOffset("UTC+14:30")).toBeNull();
  });

  it("parses normalized offsets to minute values", () => {
    expect(parseUtcOffsetToMinutes("UTC+05:30")).toBe(330);
    expect(parseUtcOffsetToMinutes("UTC-08:00")).toBe(-480);
    expect(parseUtcOffsetToMinutes("UTC+00:00")).toBe(0);
  });
});

