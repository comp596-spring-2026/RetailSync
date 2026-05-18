import { describe, expect, it, vi } from 'vitest';
import { coerceSharpInputBuffer, logImageInput } from './imageInput';

describe('imageInput', () => {
  it('accepts Buffer input for sharp', () => {
    const buffer = Buffer.from([137, 80, 78, 71]);
    expect(coerceSharpInputBuffer('test', buffer).equals(buffer)).toBe(true);
  });

  it('rejects canvas-like objects only after converting via toBuffer', () => {
    const fakeCanvas = {
      width: 10,
      height: 10,
      getContext: () => ({}),
      toBuffer: () => Buffer.from([137, 80, 78, 71])
    };

    const converted = coerceSharpInputBuffer('canvas', fakeCanvas);
    expect(Buffer.isBuffer(converted)).toBe(true);
  });

  it('rejects invalid input types', () => {
    expect(() => coerceSharpInputBuffer('bad', { foo: 'bar' })).toThrow(/expected Buffer/i);
  });

  it('logs image input metadata', () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    logImageInput('probe', Buffer.from('abc'), { pageNumber: 2 });
    expect(info).toHaveBeenCalled();
    info.mockRestore();
  });
});
