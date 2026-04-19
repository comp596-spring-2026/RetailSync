import { useMemo } from 'react';
import type { PosState } from '../state';
import { POSAssistantPanel } from '../components/POSAssistantPanel';
import type { PosPrimaryAction } from './types';

type POSAssistantPageProps = {
  loading: boolean;
  records: PosState['records'];
  totals: PosState['totals'];
  kpis: PosState['kpis'];
  chartsData: PosState['chartsData'];
  alerts: PosState['alerts'];
  dateRange: PosState['dateRange'];
  primaryAction: PosPrimaryAction;
};

export const POSAssistantPage = ({
  loading,
  records,
  totals,
  kpis,
  chartsData,
  alerts,
  dateRange,
  primaryAction
}: POSAssistantPageProps) => {
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

  return <POSAssistantPanel loading={loading} snapshot={snapshot} primaryAction={primaryAction} />;
};

export default POSAssistantPage;
