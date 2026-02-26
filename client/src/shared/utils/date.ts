import moment from 'moment';
import { DateDisplayStyle } from '../types/common';

export const formatDate = (
  input: string | number | Date,
  style: DateDisplayStyle = 'iso'
) => {
  const parsed =
    typeof input === 'string' ? moment(input, moment.ISO_8601, true) : moment(input);

  if (!parsed.isValid()) return '-';
  const stableDate = parsed.utc();

  if (style === 'iso') return stableDate.format('YYYY-MM-DD');
  if (style === 'short') {
    return stableDate.format('MMM D, YYYY');
  }

  return stableDate.format('ddd, MMM D, YYYY');
};
