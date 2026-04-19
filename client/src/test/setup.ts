import React from 'react';
import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

const benignClientTestWarningPatterns = [
  /React Router Future Flag Warning/,
  /No reducer provided for key "(auth|company|users|rbac|settings|pos|ui)"/
];

const shouldIgnoreBenignClientTestWarning = (args: unknown[]) => {
  const message = args
    .map((value) => {
      if (typeof value === 'string') {
        return value;
      }

      if (value instanceof Error) {
        return value.message;
      }

      return '';
    })
    .filter(Boolean)
    .join(' ');

  return benignClientTestWarningPatterns.some((pattern) => pattern.test(message));
};

const originalConsoleWarn = console.warn.bind(console);
const originalConsoleError = console.error.bind(console);

vi.spyOn(console, 'warn').mockImplementation((...args: Parameters<typeof console.warn>) => {
  if (shouldIgnoreBenignClientTestWarning(args)) {
    return;
  }

  originalConsoleWarn(...args);
});

vi.spyOn(console, 'error').mockImplementation((...args: Parameters<typeof console.error>) => {
  if (shouldIgnoreBenignClientTestWarning(args)) {
    return;
  }

  originalConsoleError(...args);
});

vi.mock('@mui/x-data-grid', () => {
  const DataGrid = ({
    rows = [],
    columns = [],
    slots
  }: {
    rows?: Array<Record<string, unknown>>;
    columns?: Array<Record<string, unknown>>;
    slots?: { noRowsOverlay?: () => React.ReactNode };
  }) => {
    if (!rows.length && slots?.noRowsOverlay) {
      return React.createElement(React.Fragment, null, slots.noRowsOverlay());
    }

    return React.createElement(
      'div',
      { 'data-testid': 'mock-data-grid' },
      rows.map((row, rowIndex) =>
        React.createElement(
          'div',
          { key: String(row.id ?? rowIndex) },
          columns.map((column, columnIndex) => {
            const field = String(column.field ?? columnIndex);
            const value = row[field];
            const content =
              typeof column.renderCell === 'function'
                ? column.renderCell({ value, row, field })
                : value == null
                  ? ''
                  : String(value);
            return React.createElement('div', { key: `${field}-${columnIndex}` }, content);
          })
        )
      )
    );
  };

  return {
    DataGrid
  };
});

if (typeof window !== 'undefined' && !('ResizeObserver' in window)) {
  class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }

  // @ts-expect-error jsdom does not provide ResizeObserver
  window.ResizeObserver = ResizeObserver;
}

if (typeof window !== 'undefined' && !window.matchMedia) {
  window.matchMedia = ((query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false
    }) as MediaQueryList);
}
