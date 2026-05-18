type ImageInputLogContext = Record<string, unknown>;

const isCanvasLike = (value: unknown): boolean => {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.getContext === 'function' &&
    typeof record.toBuffer === 'function' &&
    typeof record.width === 'number'
  );
};

export const logImageInput = (label: string, value: unknown, context: ImageInputLogContext = {}) => {
  const byteLength =
    Buffer.isBuffer(value) || value instanceof Uint8Array
      ? value.byteLength
      : typeof value === 'string'
        ? value.length
        : undefined;

  // eslint-disable-next-line no-console
  console.info(`[image.input] ${label}`, {
    valueType: value === null ? 'null' : typeof value,
    isBuffer: Buffer.isBuffer(value),
    isUint8Array: value instanceof Uint8Array,
    constructorName: value && typeof value === 'object' ? (value as object).constructor?.name : undefined,
    byteLength,
    isCanvasLike: isCanvasLike(value),
    ...context
  });
};

export const coerceSharpInputBuffer = (label: string, value: unknown): Buffer => {
  logImageInput(label, value);

  if (Buffer.isBuffer(value)) {
    if (value.byteLength === 0) {
      throw new Error(`${label}: empty Buffer is not valid image input for sharp`);
    }
    return value;
  }

  if (value instanceof Uint8Array) {
    const buffer = Buffer.from(value);
    if (buffer.byteLength === 0) {
      throw new Error(`${label}: empty Uint8Array is not valid image input for sharp`);
    }
    return buffer;
  }

  if (typeof value === 'string') {
    return Buffer.from(value);
  }

  if (isCanvasLike(value)) {
    const canvas = value as { toBuffer: (mime?: string) => Buffer };
    const buffer = canvas.toBuffer('image/png');
    logImageInput(`${label}.canvasToBuffer`, buffer, { source: 'canvas.toBuffer' });
    return coerceSharpInputBuffer(`${label}.canvasToBuffer`, buffer);
  }

  throw new Error(
    `${label}: expected Buffer, Uint8Array, file path string, or canvas with toBuffer(); got ${value === null ? 'null' : typeof value}`
  );
};
