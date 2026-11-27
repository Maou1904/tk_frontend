import type { Transfer } from './storeOperations';

export function summarizeTransfers(records: Transfer[]) {
  const active = records.filter((record) => !record.cancelledAt);
  return {
    active,
    count: active.length,
    cancelled: records.length - active.length,
    // Monetary values stay in satang until they are formatted for display.
    principal: active.reduce((sum, record) => sum + record.principal, 0),
    fee: active.reduce((sum, record) => sum + record.fee, 0),
    cashReceived: active.reduce((sum, record) => sum + record.cashReceived, 0),
    change: active.reduce((sum, record) => sum + record.change, 0),
    cashNet: active.reduce((sum, record) => sum + record.cashReceived - record.change, 0),
  };
}

const bucketDateTime = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' });
const localDay = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit' });
const monthDayLabel = new Intl.DateTimeFormat('th-TH', { timeZone: 'Asia/Bangkok', day: '2-digit', month: 'short' });
const monthLabel = new Intl.DateTimeFormat('th-TH', { timeZone: 'Asia/Bangkok', month: 'short' });

export function analyticsBucket(date: Date, period: 'day' | 'month' | 'year') {
  const parts = bucketDateTime.formatToParts(date);
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  const key = period === 'day' ? `${value('hour')}:00`
    : period === 'month' ? `${value('year')}-${value('month')}-${value('day')}`
      : `${value('year')}-${value('month')}`;
  const label = period === 'day' ? key : (period === 'month' ? monthDayLabel : monthLabel).format(date);
  return { key, label };
}


export type AnalyticsSeries = 'ALL' | 'POS' | 'GAS' | 'LOTTERY' | 'TOPUP' | 'TRANSFER' | 'ELECTRICITY';
export type AnalyticsTrendRow = {
  key: string; label: string; total: number; count: number;
  values: Record<AnalyticsSeries, number>;
};
type TrendSale = { channel: 'POS' | 'GAS' | 'LOTTERY' | 'TOPUP'; createdAt: Date; total: number };

// Call with the same eligible sales used by the dashboard totals. Empty slots stay visible.
export function buildAnalyticsTrend(period: 'day' | 'month' | 'year', selected: string, sales: TrendSale[], transfers: Transfer[]): AnalyticsTrendRow[] {
  const pattern = period === 'day' ? /^\d{4}-\d{2}-\d{2}$/ : period === 'month' ? /^\d{4}-\d{2}$/ : /^\d{4}$/;
  if (!pattern.test(selected)) return [];
  const [year, month = 1, day = 1] = selected.split('-').map(Number);
  if (year < 2020 || year > 2100 || month < 1 || month > 12) return [];
  const start = new Date(Date.UTC(year, month - 1, day));
  if (start.getUTCMonth() !== month - 1 || start.getUTCDate() !== day) return [];
  const slots = period === 'day' ? 24 : period === 'month' ? new Date(Date.UTC(year, month, 0)).getUTCDate() : 12;
  const rows = Array.from({ length: slots }, (_, index): AnalyticsTrendRow => {
    const date = period === 'day' ? new Date(`${selected}T${String(index).padStart(2, '0')}:00:00+07:00`)
      : new Date(Date.UTC(year, period === 'year' ? index : month - 1, period === 'month' ? index + 1 : 1));
    const { key, label } = analyticsBucket(date, period);
    return { key, label, total: 0, count: 0, values: { ALL: 0, POS: 0, GAS: 0, LOTTERY: 0, TOPUP: 0, TRANSFER: 0, ELECTRICITY: 0 } };
  });
  const buckets = new Map(rows.map(row => [row.key, row]));
  function add(date: Date, amount: number, series: Exclude<AnalyticsSeries, 'ALL'>) {
    const localDate = localDay.format(date);
    if (!localDate.startsWith(selected)) return;
    const bucket = buckets.get(analyticsBucket(date, period).key);
    if (!bucket) return;
    bucket.values[series] += Math.round(amount * 100);
    bucket.values.ALL += Math.round(amount * 100);
    bucket.count++;
  }
  sales.forEach(sale => add(sale.createdAt, sale.total, sale.channel));
  transfers.filter(row => !row.cancelledAt).forEach(row => add(new Date(row.createdAt), row.fee / 100, row.serviceType === 'ELECTRICITY' ? 'ELECTRICITY' : 'TRANSFER'));
  // Aggregate in satang, then expose baht to the chart and existing Excel export.
  return rows.map(row => ({ ...row, total: row.values.ALL / 100,
    values: Object.fromEntries(Object.entries(row.values).map(([key, value]) => [key, value / 100])) as Record<AnalyticsSeries, number> }));
}

export function paginationPages(page: number, pageCount: number): (number | 'ellipsis')[] {
  if (pageCount <= 7) return Array.from({ length: pageCount }, (_, index) => index + 1);
  const start = Math.max(2, Math.min(page - 1, pageCount - 3));
  const end = Math.min(pageCount - 1, Math.max(page + 1, 4));
  const pages: (number | 'ellipsis')[] = [1];
  if (start > 2) pages.push('ellipsis');
  for (let value = start; value <= end; value++) pages.push(value);
  if (end < pageCount - 1) pages.push('ellipsis');
  return [...pages, pageCount];
}
