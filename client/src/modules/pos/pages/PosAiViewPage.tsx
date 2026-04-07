import { useMemo } from 'react';
import type { PosState } from '../state';
import { PosAiAssistantPanel } from '../components/PosAiAssistantPanel';
import type { PosPrimaryAction } from './types';

type PosAiViewPageProps = {
  loading: boolean;
  records: PosState['records'];
  totals: PosState['totals'];
  kpis: PosState['kpis'];
  chartsData: PosState['chartsData'];
  alerts: PosState['alerts'];
  dateRange: PosState['dateRange'];
  primaryAction: PosPrimaryAction;
};

export const PosAiViewPage = ({
  loading,
  records,
  totals,
  kpis,
  chartsData,
  alerts,
  dateRange,
  primaryAction
}: PosAiViewPageProps) => {
  const snapshot = useMemo(
    () => ({
      records,
      totals,
      kpis,
      chartsData,
      alerts,
      dateRange
    }),
    [alerts, chartsData, dateRange, kpis, records, totals]
  );

  return <PosAiAssistantPanel loading={loading} snapshot={snapshot} primaryAction={primaryAction} />;
};
