export const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

export const toIsoDate = (value: Date | string | number) => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
};
