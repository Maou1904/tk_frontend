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

export function analyticsBucket(date: Date, period: 'day' | 'month' | 'year') {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', hourCycle: 'h23',
  }).formatToParts(date);
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  const key = period === 'day' ? `${value('hour')}:00`
    : period === 'month' ? `${value('year')}-${value('month')}-${value('day')}`
      : `${value('year')}-${value('month')}`;
  const label = period === 'day' ? key : new Intl.DateTimeFormat('th-TH', {
    timeZone: 'Asia/Bangkok', ...(period === 'month' ? { day: '2-digit', month: 'short' } : { month: 'short' }),
  }).format(date);
  return { key, label };
}
