const UTC_OFFSET_PATTERN = /^UTC([+-])(\d{1,2}):([0-5]\d)$/i;
const SHORT_UTC_OFFSET_PATTERN = /^([+-])(\d{1,2}):([0-5]\d)$/;
const MIN_OFFSET_MINUTES = -12 * 60;
const MAX_OFFSET_MINUTES = 14 * 60;

const toOffsetParts = (hoursRaw: string, minutesRaw: string) => {
  const hours = Number(hoursRaw);
  const minutes = Number(minutesRaw);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return null;
  if (hours > 14) return null;
  if (hours === 14 && minutes > 0) return null;
  return { hours, minutes };
};

export const normalizeUtcOffset = (value: string): string | null => {
  const raw = value.trim();
  const utcMatch = raw.match(UTC_OFFSET_PATTERN);
  const shortMatch = raw.match(SHORT_UTC_OFFSET_PATTERN);
  const match = utcMatch ?? shortMatch;
  if (!match) return null;

  const sign = match[1] === "-" ? -1 : 1;
  const parts = toOffsetParts(match[2], match[3]);
  if (!parts) return null;

  const totalMinutes = sign * (parts.hours * 60 + parts.minutes);
  if (totalMinutes < MIN_OFFSET_MINUTES || totalMinutes > MAX_OFFSET_MINUTES) {
    return null;
  }

  const signToken = totalMinutes < 0 ? "-" : "+";
  const absMinutes = Math.abs(totalMinutes);
  const hours = Math.floor(absMinutes / 60)
    .toString()
    .padStart(2, "0");
  const minutes = (absMinutes % 60).toString().padStart(2, "0");
  return `UTC${signToken}${hours}:${minutes}`;
};

export const parseUtcOffsetToMinutes = (value: string): number | null => {
  const normalized = normalizeUtcOffset(value);
  if (!normalized) return null;
  const [, signRaw, hoursRaw, minutesRaw] = normalized.match(UTC_OFFSET_PATTERN) ?? [];
  if (!signRaw || !hoursRaw || !minutesRaw) return null;
  const sign = signRaw === "-" ? -1 : 1;
  return sign * (Number(hoursRaw) * 60 + Number(minutesRaw));
};

