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
  let settings = { defaultFee: 1000, electricityFee: 1550, gasDeliveryFee: 2000, topupAmount: 10000 };
  let electricityRecords = [];
  let electricityAttempts = 0;
  let approvalAttempts = 0;
  await context.route('**/api/**', async route => {
    const request = route.request(), url = new URL(request.url()), path = url.pathname;
    const respond = (data, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data), headers: { 'access-control-allow-origin': '*' } });
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
    if (request.method() !== 'GET') writes.push({ path, body: request.postDataJSON() });
    if (path.endsWith('/electricity')) {
      if (request.method() === 'POST') {
        electricityAttempts++;
        if (electricityAttempts === 1) return respond({ error: 'ทดสอบบันทึกไม่สำเร็จ กรุณาลองใหม่' }, 500);
        const body = request.postDataJSON();
        const record = { ...body, serviceType: 'ELECTRICITY', change: body.cashReceived - body.principal - body.fee, createdAt: '2026-11-27T06:00:00Z', staff: 'Owner QA', cancelledAt: null, cancelReason: null };
        electricityRecords.push(record);
        return respond(record, 201);
      }
      const totals = { records: electricityRecords.length, count: electricityRecords.length, principal: 0, fee: 0, cash: 0, change: 0 };
      electricityRecords.forEach(row => { totals.principal += row.principal; totals.fee += row.fee; totals.cash += row.cashReceived; totals.change += row.change; });
      return respond({ records: electricityRecords, totals, defaultFee: settings.electricityFee });
    }
    if (path.endsWith('/transfers')) return respond({ records: [], totals: { records: 0, count: 0, principal: 0, fee: 0, cash: 0, change: 0 }, defaultFee: settings.defaultFee });
    if (path === '/api/store-settings') {
      if (request.method() === 'PUT') settings = request.postDataJSON();
      return respond(settings);
    }
    if (path === '/api/lottery/tickets') return respond(items);
    if (path.endsWith('/lottery/checkout')) { records = [structuredClone(pending)]; cartItems = []; return respond({ sale: pending, cart: { items: [] } }, 201); }
    if (path.endsWith('/LOTTERY-QA-PENDING/confirm')) {
      if (++approvalAttempts === 1) return respond({ error: 'ทดสอบยืนยันรับเงินไม่สำเร็จ ลองอีกครั้ง' }, 500);
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
  await staff.page.getByRole('button', { name: /เงินที่แจ้งส่งให้เจ้าของร้านตรวจรับ/ }).click();
  const cashDialog = staff.page.getByRole('dialog', { name: 'รับเงินสลาก', exact: true });
  const cashInput = cashDialog.getByLabel('เงินที่รับจริง (บาท)', { exact: true });
  const cashConfirm = cashDialog.getByRole('button', { name: 'ยืนยันยอดรับเงิน', exact: true });
  assert.equal(await cashConfirm.isEnabled(), false);
  for (const [label, amount] of [['รับพอดี','80.00'],['100','100.00'],['200','200.00'],['500','500.00'],['1,000','1000.00']]) {
    await cashDialog.getByRole('button', { name: label, exact: true }).click();
    assert.equal(await cashInput.inputValue(), amount);
  }
  await cashDialog.getByRole('button', { name: 'ล้าง', exact: true }).click();
  for (const digit of ['5','0']) await cashDialog.getByRole('button', { name: digit, exact: true }).click();
  assert.equal(await cashConfirm.isEnabled(), false);
  await cashInput.focus();
  await staff.page.keyboard.press('Shift+Tab');
  assert.equal(await staff.page.evaluate(() => Boolean(document.activeElement?.closest('[role=dialog]'))), true);
  await staff.page.keyboard.press('Escape');
  assert.equal(staff.writes.filter(write => write.path.endsWith('/lottery/checkout')).length, 0);
  await staff.page.getByRole('button', { name: /เงินที่แจ้งส่งให้เจ้าของร้านตรวจรับ/ }).click();
  await cashDialog.getByRole('button', { name: '200', exact: true }).click();
  if (artifactDir) {
    for (const [width, height] of [[1024,768],[768,1024],[390,844]]) {
      await staff.page.setViewportSize({ width, height });
      const box = await cashDialog.boundingBox();
      assert(box.x >= 0 && box.y >= 0 && box.x + box.width <= width + 1 && box.y + box.height <= height + 1);
      assert.equal(await staff.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      await staff.page.screenshot({ path: `${artifactDir}/lottery-cash-${width}.png`, fullPage: true });
    }
    await staff.page.setViewportSize({ width: 1024, height: 768 });
  }
  await cashConfirm.click();
  await staff.page.getByRole('button', { name: 'ส่งรายการให้เจ้าของร้านยืนยัน', exact: true }).click();
  await staff.page.getByText('LOTTERY-QA-PENDING', { exact: true }).waitFor();
  assert.equal(await staff.page.getByRole('button', { name: 'ยืนยันว่ารับเงินจริงแล้ว', exact: true }).count(), 0);
  assert.equal(staff.writes.filter(write => write.path.endsWith('/lottery/checkout')).length, 1);
  await staff.page.locator('.transaction-completion').getByText('ส่งรายการแล้ว', {exact:true}).waitFor();
  assert.equal(await staff.page.locator('.transaction-completion-change').count(), 0);
  if (artifactDir) await staff.page.screenshot({ path: `${artifactDir}/lottery-user.png`, fullPage: true });
  await staff.context.close();
  const owner = await setup('owner');
  await owner.page.getByRole('navigation', { name: 'เมนูหลัก' }).getByRole('button', { name: 'สลาก', exact: true }).click();
  const approve = owner.page.getByRole('button', { name: 'ยืนยันว่ารับเงินจริงแล้ว', exact: true });
  await approve.waitFor(); await approve.click();
  const approvalDialog = owner.page.getByRole('dialog', { name: 'ตรวจรับเงินสลาก', exact: true });
  assert.equal(owner.writes.filter(write => write.path.endsWith('/confirm')).length, 0);
  const approveCash = approvalDialog.getByRole('button', { name: 'ยืนยันว่ารับเงินจริงแล้ว', exact: true });
  assert.equal(await approveCash.isEnabled(), false);
  await approvalDialog.getByLabel('เงินที่รับจริง (บาท)').fill('79.99');
  assert.equal(await approveCash.isEnabled(), false);
  await approvalDialog.getByRole('button', { name: '100', exact: true }).click();
  await approveCash.click();
  await approvalDialog.getByRole('alert').filter({ hasText: 'ทดสอบยืนยันรับเงินไม่สำเร็จ' }).waitFor();
  assert.equal(await approvalDialog.getByLabel('เงินที่รับจริง (บาท)').inputValue(), '100.00');
  await approveCash.click();
  await owner.page.getByText('ไม่มีรายการรอยืนยัน', { exact: true }).waitFor();
  assert.equal(owner.writes.find(write => write.path.endsWith('/confirm')).body.cashReceived, 100);
  await owner.page.locator('.transaction-completion-change').getByText('฿20.00', {exact:true}).waitFor();
  await owner.page.getByRole('button', {name:'ปิดข้อความสำเร็จ',exact:true}).click();
  assert(owner.writes.find(write => write.path.endsWith('/confirm')).path.includes('/TK-20261125/'));
  assert.equal(await owner.page.getByRole('button', { name: 'เคลียร์สต็อกงวดเดิม', exact: true }).count(), 0);
  await owner.page.getByRole('navigation', { name: 'เมนูหลัก' }).getByRole('button', { name: 'สต็อก', exact: true }).click();
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
  const ownerNav = owner.page.getByRole('navigation', { name: 'เมนูหลัก' });
  await ownerNav.getByRole('button', { name: 'จ่ายค่าไฟ', exact: true }).click();
  await owner.page.getByRole('heading', { name: 'บันทึกรับจ่ายค่าไฟ', exact: true }).waitFor();
  const bill = owner.page.getByLabel('ยอดค่าไฟ (บาท)', { exact: true });
  const fee = owner.page.getByLabel('ค่าบริการ (บาท)', { exact: true });
  await owner.page.waitForFunction(() => document.querySelector('.transfer-page input')?.disabled === false);
  assert.equal(await fee.inputValue(), '15.50');
  await bill.focus();
  for (const digit of ['1','2','3','.','4','5']) await owner.page.locator('.cash-dial').getByRole('button', { name: digit, exact: true }).click();
  assert.equal(await bill.inputValue(), '123.45');
  await fee.fill('20');
  await owner.page.getByLabel('เลขผู้ใช้ไฟ / เลขอ้างอิง (ถ้ามี)').fill('METER-QA');
  await owner.page.getByRole('button', { name: /สรุปรายการ/ }).click();
  await owner.page.locator('.electricity-rounding-summary').waitFor();
  assert.match(await owner.page.locator('.electricity-rounding-summary').innerText(), /123\.45/);
  assert.match(await owner.page.locator('.electricity-rounding-summary').innerText(), /0\.55/);
  assert.match(await owner.page.locator('.fee-ticket').first().innerText(), /144\.00/);
  await owner.page.getByRole('button', { name: 'ย้อนกลับ', exact: true }).click();
  assert.equal(await bill.inputValue(), '123.45');
  assert.equal(await fee.inputValue(), '20');
  await owner.page.getByRole('button', { name: /สรุปรายการ/ }).click();
  const saveElectricity = owner.page.getByRole('button', { name: 'รับเงิน', exact: true });
  assert.equal(await saveElectricity.isEnabled(), false);
  await owner.page.getByRole('button', { name: '100 บาท', exact: true }).click();
  assert.equal(await saveElectricity.isEnabled(), false);
  await owner.page.getByLabel('เงินสดที่รับจริง (บาท)').fill('143.45');
  assert.equal(await saveElectricity.isEnabled(), false, 'The unrounded subtotal is insufficient');
  await owner.page.getByRole('button', { name: 'รับพอดี', exact: true }).click();
  assert.equal(await owner.page.getByLabel('เงินสดที่รับจริง (บาท)').inputValue(), '144.00');
  assert.equal(await saveElectricity.isEnabled(), true);
  await owner.page.getByRole('button', { name: '200 บาท', exact: true }).click();
  assert.equal(await saveElectricity.isEnabled(), true);
  if (artifactDir) {
    for (const [width, height] of [[1024,768],[768,1024]]) {
      await owner.page.setViewportSize({ width, height });
      assert.equal(await owner.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      await owner.page.screenshot({ path: `${artifactDir}/electricity-${width}.png`, fullPage: true });
    }
    await owner.page.setViewportSize({ width: 1024, height: 768 });
  }
  await saveElectricity.click();
  await owner.page.getByRole('alert').filter({ hasText: 'ทดสอบบันทึกไม่สำเร็จ' }).waitFor();
  assert.equal(Number(await owner.page.getByLabel('เงินสดที่รับจริง (บาท)').inputValue()), 200);
  assert.equal(await owner.page.locator('.transaction-completion').count(), 0);
  await saveElectricity.click();
  await owner.page.getByText(/บันทึกแล้ว · ยอดค่าไฟ/).waitFor();
  const electricityWrites = owner.writes.filter(write => write.path.endsWith('/electricity'));
  assert.equal(electricityWrites.length, 2);
  assert.deepEqual(electricityWrites[0].body, electricityWrites[1].body);
  assert.equal(electricityWrites[1].body.principal, 12345);
  assert.equal(electricityWrites[1].body.fee, 2055);
  assert.equal(electricityWrites[1].body.rounding, 55);
  assert.equal(electricityWrites[1].body.cashReceived, 20000);
  assert.equal(electricityWrites[1].body.reference, 'METER-QA');
  await owner.page.locator('.transaction-completion-change').getByText('฿56.00', { exact: true }).waitFor();
  assert.equal(await fee.inputValue(), '15.50');
  assert.equal(await bill.inputValue(), '');
  await ownerNav.getByRole('button', { name: 'ตั้งค่า', exact: true }).click();
  const defaultElectricity = owner.page.getByLabel('ค่าบริการจ่ายค่าไฟต่อรายการ (บาท)', { exact: true });
  await defaultElectricity.waitFor();
  await defaultElectricity.fill('25');
  await owner.page.getByRole('button', { name: 'บันทึกการตั้งค่า', exact: true }).click();
  await owner.page.getByText('บันทึกการตั้งค่าแล้ว', { exact: true }).waitFor();
  assert.equal(owner.writes.find(write => write.path === '/api/store-settings').body.electricityFee, 2500);
  await ownerNav.getByRole('button', { name: 'จ่ายค่าไฟ', exact: true }).click();
  await owner.page.waitForFunction(() => document.querySelectorAll('.transfer-page .operation-form-grid input')[1]?.value === '25.00');
  await ownerNav.getByRole('button', { name: 'รับโอนเงิน', exact: true }).click();
  await owner.page.waitForFunction(() => document.querySelectorAll('.transfer-page .operation-form-grid input')[1]?.value === '10.00');
  await owner.page.getByText('ยังไม่มีรายการรับโอนในรอบนี้', { exact: true }).waitFor();
  await owner.page.getByLabel('ยอดที่ลูกค้าต้องการโอน (บาท)').fill('123.45');
  await owner.page.getByRole('button', { name: 'กสิกรไทย', exact: true }).click();
  await owner.page.getByRole('button', { name: /สรุปรายการ/ }).click();
  assert.equal(await owner.page.locator('.electricity-rounding-summary').count(), 0);
  await owner.page.getByRole('button', { name: 'รับพอดี', exact: true }).click();
  assert.equal(await owner.page.getByLabel('เงินสดที่รับจริง (บาท)').inputValue(), '133.45', 'Transfer still accepts satang without rounding');
  await ownerNav.getByRole('button', { name: 'จ่ายค่าไฟ', exact: true }).click();
  for (const [amount, serviceFee, expected] of [['123.45', '10', '134.00'], ['100.00', '10', '110.00'], ['100.01', '0', '101.00'], ['100.99', '0', '101.00'], ['123.45', '15.50', '139.00'], ['0.01', '0', '1.00']]) {
    await bill.fill(amount); await fee.fill(serviceFee);
    await owner.page.getByRole('button', { name: /สรุปรายการ/ }).click();
    assert.match(await owner.page.locator('.fee-ticket').first().innerText(), new RegExp(expected.replace('.', '\\.')));
    await owner.page.getByRole('button', { name: 'รับพอดี', exact: true }).click();
    assert.equal(await owner.page.getByLabel('เงินสดที่รับจริง (บาท)').inputValue(), expected);
    await owner.page.getByRole('button', { name: 'ย้อนกลับ', exact: true }).click();
    assert.equal(await bill.inputValue(), amount, 'The original utility bill is retained');
    assert.equal(await fee.inputValue(), serviceFee, 'The configured fee never accumulates rounding');
  }
  await owner.context.close();
  assert.deepEqual(errors, []);
  console.log('PASS: staff see four menus, submit lottery orders without approval controls; lottery keypad validates cash and all shortcuts; owner approves in popup; reset appears only in stock and review requires re-confirmation after stock changes. Electricity keypad, fees, back navigation, underpayment, safe retries and independent settings passed. All APIs mocked.');
} finally { await browser.close(); }
