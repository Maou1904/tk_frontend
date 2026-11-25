import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summarizeTransfers, analyticsBucket } from './analytics.ts';

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
