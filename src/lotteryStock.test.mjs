import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lotteryStockLevel } from './lotteryStock.ts';
test('stock colors use each number\'s full stock, not the maximum current stock on the board', () => {
  assert.equal(lotteryStockLevel(0, 10).level, 'empty');
  assert.equal(lotteryStockLevel(1, 10).level, 'low');
  assert.equal(lotteryStockLevel(5, 10).level, 'medium');
  assert.equal(lotteryStockLevel(10, 10).level, 'high');
  assert.equal(lotteryStockLevel(1, 1).level, 'high');
  assert.equal(lotteryStockLevel(1, 2).level, 'medium');
  assert.equal(lotteryStockLevel(-1, 10).level, 'empty');
  assert.equal(lotteryStockLevel(2, 0).level, 'high');
});
