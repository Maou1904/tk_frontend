// All shop APIs are mocked. This test never submits an actual sale or stock reset.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome' });
const errors = [];
const artifactDir = process.env.LOTTERY_ARTIFACT_DIR;
if (artifactDir) await mkdir(artifactDir, { recursive: true });
const pending = { id: 'LOTTERY-QA-PENDING', sessionId: 'TK-20261125', channel: 'LOTTERY', createdAt: '2026-11-26T06:00:00Z', customerName: 'ลูกค้าทดสอบ', staffName: 'พนักงานทดสอบ', paymentMethod: 'เงินสด',
  status: 'รอเจ้าของร้านยืนยัน', items: [{ id: '1', ticketId: '1', number: '00', barcode: '00', name: '00', quantity: 1, price: 80, discount: 0 }],
  subtotal: 80, discount: 0, total: 80, cashReceived: 0, change: 0, submittedBy: 2, submittedByName: 'พนักงานทดสอบ', reportedCashReceived: 80, confirmedBy: null, confirmedAt: null };
async function setup(role) {
  const context = await browser.newContext({ viewport: { width: 1024, height: 768 } });
  await context.addInitScript(role => sessionStorage.setItem('tingkum.authSession.v1', JSON.stringify({ token: 'mock-test-token', expiresAt: '2099-01-01', user: { id: role === 'owner' ? 1 : 2, username: 'qa', displayName: 'ทดสอบ', role, active: true } })), role);
  const writes = [];
  let records = role === 'owner' ? [structuredClone(pending)] : [];
  let items = [{ id: 1, number: '00', series: 'เลขท้าย', price: 80, remaining: 2, stockReference: 2, active: true }];
  let cartItems = [{ id: '1', name: '00', barcode: '00', number: '00', price: 80, quantity: 1, discount: 0 }];
  let resetCount = 0;
  await context.route('**/api/**', async route => {
    const request = route.request(), url = new URL(request.url()), path = url.pathname;
    const respond = (data, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data), headers: { 'access-control-allow-origin': '*' } });
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
    if (request.method() !== 'GET') writes.push({ path, body: request.postDataJSON() });
    if (path === '/api/lottery/tickets') return respond(items);
    if (path.endsWith('/lottery/checkout')) { records = [structuredClone(pending)]; cartItems = []; return respond({ sale: pending, cart: { items: [] } }, 201); }
    if (path.endsWith('/LOTTERY-QA-PENDING/confirm')) {
      records = [{ ...pending, status: 'completed', cashReceived: request.postDataJSON().cashReceived, confirmedBy: 1 }];
      return respond(records[0]);
    }
    if (path === '/api/lottery/stock/reset-preview') return respond({ ticketCount: 100, total: 200, pendingCount: 1, version: 'a'.repeat(64) });
    if (path === '/api/lottery/stock/reset') {
      resetCount++;
      if (resetCount === 1) return respond({ error: 'สต็อกเปลี่ยนระหว่างตรวจ กรุณาดูยอดล่าสุดก่อนยืนยันอีกครั้ง', preview: { ticketCount: 100, total: 199, pendingCount: 1, version: 'b'.repeat(64) } }, 409);
      items = [{ ...items[0], remaining: 0, stockReference: 0 }]; cartItems = [];
      return respond({ cleared: 199 });
    }
    if (path === '/api/lottery/pending') return respond(records.filter(record => record.status === 'รอเจ้าของร้านยืนยัน'));
    if (path.endsWith('/sales')) return respond(records);
    if (/\/lottery-sessions\/.*\/cart$/.test(path)) return respond({ items: cartItems });
    if (/\/app-sessions\/[^/]+$/.test(path)) return respond({ session_id: path.split('/').at(-1), status: 'OPEN', previousClosedSession: null });
    if (path.endsWith('/cart')) return respond({ items: [] });
    if (path.endsWith('/gas')) return respond({ items: [], jobs: [], pendingReturns: [] });
    if (path === '/api/store-settings') return respond({ defaultFee: 1000, gasDeliveryFee: 2000, topupAmount: 10000 });
    if (path === '/api/gas/voice/status') return respond({ enabled: false, provider: 'rules' });
    return respond([]);
  });
  const page = await context.newPage(); page.on('pageerror', e => errors.push(e.message));
  await page.goto(process.env.LOTTERY_TEST_URL || 'http://127.0.0.1:5173');
  return { context, page, writes };
}
try {
  const staff = await setup('user');
  const nav = staff.page.getByRole('navigation', { name: 'เมนูหลัก' });
  await nav.getByRole('button', { name: 'สลาก', exact: true }).waitFor();
  await staff.page.waitForFunction(() => document.querySelectorAll('nav button').length === 4, null, { timeout: 5000 });
  assert.equal(await nav.getByRole('button').count(), 4);
  for (const name of ['ขายหน้าร้าน', 'ขายแก๊ส', 'สลาก', 'เติมเงิน']) assert.equal(await nav.getByRole('button', { name, exact: true }).count(), 1);
  await nav.getByRole('button', { name: 'สลาก', exact: true }).click();
  assert.equal(await staff.page.getByRole('button', { name: 'เคลียร์สต็อกงวดเดิม', exact: true }).count(), 0);
  await staff.page.getByLabel('เงินที่แจ้งส่งให้เจ้าของร้านตรวจรับ').fill('80');
  await staff.page.getByRole('button', { name: 'ส่งรายการให้เจ้าของร้านยืนยัน', exact: true }).click();
  await staff.page.getByText('LOTTERY-QA-PENDING', { exact: true }).waitFor();
  assert.equal(await staff.page.getByRole('button', { name: 'ยืนยันว่ารับเงินจริงแล้ว', exact: true }).count(), 0);
  assert.equal(staff.writes.filter(write => write.path.endsWith('/lottery/checkout')).length, 1);
  if (artifactDir) await staff.page.screenshot({ path: `${artifactDir}/lottery-user.png`, fullPage: true });
  await staff.context.close();
  const owner = await setup('owner');
  await owner.page.getByRole('navigation', { name: 'เมนูหลัก' }).getByRole('button', { name: 'สลาก', exact: true }).click();
  const approve = owner.page.getByRole('button', { name: 'ยืนยันว่ารับเงินจริงแล้ว', exact: true });
  await approve.waitFor(); await approve.click();
  assert.equal(owner.writes.filter(write => write.path.endsWith('/confirm')).length, 0);
  assert.equal(await owner.page.getByLabel('เงินที่ตรวจรับจริง (บาท)').inputValue(), '');
  await owner.page.getByLabel('เงินที่ตรวจรับจริง (บาท)').fill('100'); await approve.click();
  await owner.page.getByText('ไม่มีรายการรอยืนยัน', { exact: true }).waitFor();
  assert.equal(owner.writes.find(write => write.path.endsWith('/confirm')).body.cashReceived, 100);
  assert(owner.writes.find(write => write.path.endsWith('/confirm')).path.includes('/TK-20261125/'));
  await owner.page.getByRole('button', { name: 'เคลียร์สต็อกงวดเดิม', exact: true }).click();
  const dialog = owner.page.getByRole('dialog', { name: 'เคลียร์สต็อกสลากเพื่อเปลี่ยนงวด' });
  const resetButton = dialog.getByRole('button', { name: 'ยืนยันเคลียร์สต็อกงวดเดิม', exact: true });
  const check = dialog.getByLabel('ตรวจแล้ว ต้องการให้สต็อกเลข 00–99 เป็นศูนย์', { exact: true });
  await check.waitFor(); assert.equal(await resetButton.isEnabled(), false);
  await check.check(); await resetButton.click();
  await dialog.getByText('สต็อกเปลี่ยนระหว่างตรวจ กรุณาดูยอดล่าสุดก่อนยืนยันอีกครั้ง', { exact: true }).waitFor();
  assert.equal(await resetButton.isEnabled(), false);
  if (artifactDir) await owner.page.screenshot({ path: `${artifactDir}/lottery-reset-review.png`, fullPage: true });
  await check.check(); await resetButton.click(); await dialog.waitFor({ state: 'hidden' });
  assert.equal(owner.writes.filter(write => write.path === '/api/lottery/stock/reset').at(-1).body.expectedVersion, 'b'.repeat(64));
  await owner.context.close();
  assert.deepEqual(errors, []);
  console.log('PASS: staff see four menus, submit lottery orders without approval controls; owner must enter counted cash; reset review requires re-confirmation after stock changes. All APIs mocked.');
} finally { await browser.close(); }
