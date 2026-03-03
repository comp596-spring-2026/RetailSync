export type ApexPoint = { x: string; y: number };
export type ApexSeries = Array<{ name: string; data: Array<number | ApexPoint> }>;
export type ApexOptions = Record<string, unknown>;

export const currency = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 2
});

const baseChartOptions: ApexOptions = {
  chart: {
    toolbar: {
      show: true,
      tools: {
        download: true,
        selection: true,
        zoom: true,
        zoomin: true,
        zoomout: true,
        pan: true,
        reset: true
      }
    },
    zoom: { enabled: true, type: 'x', autoScaleYaxis: true },
    animations: { enabled: true }
  },
  grid: {
    borderColor: '#e5e7eb',
    strokeDashArray: 3
  },
  stroke: {
    curve: 'smooth',
    width: 2
  },
  dataLabels: { enabled: false },
  tooltip: {
    y: {
      formatter: (value: number) => currency.format(Number(value ?? 0))
    }
  }
};

export const withCurrencyTooltip = (options: ApexOptions): ApexOptions => ({
  ...baseChartOptions,
  ...options,
  tooltip: {
    ...((baseChartOptions.tooltip as Record<string, unknown>) ?? {}),
    ...((options.tooltip as Record<string, unknown>) ?? {}),
    y: {
      formatter: (value: number) => currency.format(Number(value ?? 0))
    }
  }
});

export const toLineSeries = (name: string, points: ApexPoint[]): ApexSeries => [
  {
    name,
    data: points
  }
];
