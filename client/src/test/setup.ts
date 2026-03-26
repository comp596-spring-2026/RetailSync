import React from 'react';
import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

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
