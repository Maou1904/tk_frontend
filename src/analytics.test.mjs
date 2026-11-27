import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summarizeTransfers, analyticsBucket, buildAnalyticsTrend, paginationPages } from './analytics.ts';

test('transfer principal, fees, cash and change remain separate; cancellations contribute zero', () => {
  const active = { principal: 100000, fee: 1050, cashReceived: 120000, change: 18950, cancelledAt: null };
  const cancelled = { principal: 900000, fee: 99000, cashReceived: 999000, change: 0, cancelledAt: '2026-11-25' };
  const summary = summarizeTransfers([active, cancelled]);
  assert.equal(summary.count, 1);
  assert.equal(summary.cancelled, 1);
  assert.equal(summary.principal, 100000);
  assert.equal(summary.fee, 1050);
  assert.equal(summary.cashNet, 101050);
  assert.equal(summary.cashReceived - summary.change, summary.principal + summary.fee);
  // A 250 baht sale plus a 10.50 baht fee must not include the 1,000 baht principal.
  assert.equal(250 + summary.fee / 100, 260.5);
  assert.equal(summarizeTransfers([]).fee, 0);
});

test('trend buckets consistently use Bangkok time across day, month and year boundaries', () => {
  const boundary = new Date('2026-12-31T17:00:00Z');
  assert.equal(analyticsBucket(boundary, 'day').key, '00:00');
  assert.equal(analyticsBucket(boundary, 'month').key, '2027-01-01');
  assert.equal(analyticsBucket(boundary, 'year').key, '2027-01');
  assert.equal(analyticsBucket(new Date('2026-12-31T16:59:59Z'), 'day').key, '23:00');
});


test('daily graph includes all 24 Bangkok hours, separate channels and only non-cancelled service fees', () => {
  const rows = buildAnalyticsTrend('day', '2026-11-27', [
    { channel: 'POS', createdAt: new Date('2026-11-26T17:00:00Z'), total: 125.25 },
    { channel: 'GAS', createdAt: new Date('2026-11-27T01:30:00Z'), total: 500 },
    { channel: 'LOTTERY', createdAt: new Date('2026-11-27T17:00:00Z'), total: 999 },
  ], [
    { createdAt: '2026-11-27T01:00:00Z', serviceType: 'TRANSFER', principal: 1000000, fee: 2000, cancelledAt: null },
    { createdAt: '2026-11-27T01:00:00Z', serviceType: 'ELECTRICITY', principal: 123456, fee: 2550, cancelledAt: null },
    { createdAt: '2026-11-27T01:00:00Z', fee: 99000, cancelledAt: '2026-11-27' },
  ]);
  assert.equal(rows.length, 24);
  assert.equal(rows[0].label, '00:00');
  assert.equal(rows[23].label, '23:00');
  assert.equal(rows[1].total, 0);
  assert.equal(rows[8].values.GAS, 500);
  assert.equal(rows[8].values.TRANSFER, 20);
  assert.equal(rows[8].values.ELECTRICITY, 25.5);
  assert.equal(rows[8].total, 545.5);
  assert.equal(rows.reduce((sum,row) => sum+row.total,0), 670.75);
});

test('monthly and yearly graphs keep empty dates, leap days, time boundaries and integer money aggregation', () => {
  const rows = buildAnalyticsTrend('month', '2024-02', [
    { channel: 'TOPUP', createdAt: new Date('2024-02-28T17:00:00Z'), total: 0.1 },
    { channel: 'TOPUP', createdAt: new Date('2024-02-29T16:59:59Z'), total: 0.2 },
    { channel: 'TOPUP', createdAt: new Date('2024-02-29T17:00:00Z'), total: 999 },
  ], []);
  assert.equal(rows.length, 29);
  assert.equal(rows[28].total, 0.3);
  assert.equal(buildAnalyticsTrend('month','2026-02',[],[]).length, 28);
  const yearly = buildAnalyticsTrend('year', '2026', [{ channel: 'POS', createdAt: new Date('2025-12-31T17:00:00Z'), total: 100 }], []);
  assert.equal(yearly.length,12);
  assert.equal(yearly[0].total,100);
  for (const [period,selected] of [['day','2026-02-30'],['month','2026-13'],['year',''],['day','2026-11-']]) assert.deepEqual(buildAnalyticsTrend(period,selected,[],[]),[]);
});

test('pagination always provides first, last and nearby pages without listing hundreds of buttons', () => {
  assert.deepEqual(paginationPages(1,4),[1,2,3,4]);
  assert.deepEqual(paginationPages(1,100),[1,2,3,4,'ellipsis',100]);
  assert.deepEqual(paginationPages(50,100),[1,'ellipsis',49,50,51,'ellipsis',100]);
  assert.deepEqual(paginationPages(100,100),[1,'ellipsis',97,98,99,100]);
});
