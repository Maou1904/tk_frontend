// Run with Playwright available, or set PLAYWRIGHT_MODULE to its module entry.
// All API calls are mocked; this test never records a sale in a real database.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}) });
const baseUrl = process.env.GAS_VOICE_TEST_URL ?? 'http://127.0.0.1:5173';
const artifactDir = process.env.GAS_VOICE_ARTIFACT_DIR;
if (artifactDir) await mkdir(artifactDir, { recursive: true });
const items = [
  { id: 'ptt15', brand: 'ปตท', name: 'ถังแก๊ส 15 กก.', operation: 'ขายแก๊ส', price: 450, fullStock: 3, emptyStock: 2 },
  { id: 'ptt4', brand: 'ปตท', name: 'ถังแก๊ส 4 กก.', operation: 'ขายแก๊ส', price: 200, fullStock: 2, emptyStock: 0 },
  { id: 'siam4', brand: 'สยาม', name: 'ถังแก๊ส 4 กก.', operation: 'ขายแก๊ส', price: 200, fullStock: 5, emptyStock: 1 },
];
const staff = [{ id: 'driver1', name: 'คนส่งทดสอบ', role: 'ส่งแก๊ส', active: true, phone: '' }];
const writes = [];
const pageErrors = [];
const interpretations = [];

async function setup({ unsupported = false, prefixed = false, ai = false, aiBehavior = 'success' } = {}) {
  const context = await browser.newContext({ viewport: { width: 1024, height: 768 } });
  await context.addInitScript(({ unsupported, prefixed }) => {
    sessionStorage.setItem('tingkum.authSession.v1', JSON.stringify({ token: 'mock-test-token', expiresAt: '2099-01-01', user: { id: 1, username: 'test', displayName: 'ทดสอบ', role: 'owner', active: true } }));
    window.__voice = { instances: [], aborts: 0 };
    class MockSpeechRecognition {
      constructor() { window.__voice.instances.push(this); }
      start() { this.started = true; }
      stop() { this.onend?.(); }
      abort() { window.__voice.aborts++; }
    }
    Object.defineProperty(window, 'SpeechRecognition', { configurable: true, value: unsupported || prefixed ? undefined : MockSpeechRecognition });
    Object.defineProperty(window, 'webkitSpeechRecognition', { configurable: true, value: unsupported ? undefined : MockSpeechRecognition });
    window.__emitVoice = (text, final = true, end = true) => {
      const recognition = window.__voice.instances.at(-1);
      recognition.onresult?.({ results: [{ 0: { transcript: text }, isFinal: final }] });
      if (end) recognition.onend?.();
    };
  }, { unsupported, prefixed });
  await context.route('**/api/**', async (route) => {
    const request = route.request();
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
    const path = new URL(request.url()).pathname;
    if (request.method() !== 'GET' && path !== '/api/gas/voice/parse') writes.push({ method: request.method(), url: request.url() });
    let data = [];
    if (path === '/api/gas/voice/status') data = { enabled: ai, provider: ai ? 'cloudflare' : 'rules' };
    else if (path === '/api/gas/voice/parse') {
      interpretations.push(request.postDataJSON().text);
      if (aiBehavior === 'quota') return route.fulfill({ status: 429, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ code: 'VOICE_AI_LIMIT' }) });
      if (aiBehavior === 'delayed') await new Promise(resolve => setTimeout(resolve, 300));
      data = { source: 'cloudflare', draft: { brand: 'ปตท', items: [{ sizeKg: 15, quantity: 2 }, { sizeKg: 4, quantity: 1 }], customerName: 'คุณเจเจ', address: 'ดอนภูตา', notes: [], errors: aiBehavior === 'clarify' ? ['กรุณายืนยันจำนวนถัง'] : [] } };
    }
    else if (/\/app-sessions\/[^/]+$/.test(path)) data = { session_id: decodeURIComponent(path.split('/').at(-1)), status: 'OPEN', previousClosedSession: null };
    else if (path.endsWith('/gas')) data = { items, jobs: [], pendingReturns: [] };
    else if (path.endsWith('/cart')) data = { items: [] };
    else if (path === '/api/staff') data = staff;
    else if (path === '/api/store-settings') data = { defaultFee: 1000, gasDeliveryFee: 2000, topupAmount: 10000 };
    await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(data) });
  });
  const page = await context.newPage();
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.goto(baseUrl);
  await page.getByRole('navigation', { name: 'เมนูหลัก' }).getByRole('button', { name: 'ขายแก๊ส' }).click();
  await page.getByRole('heading', { name: `พูดรับออร์เดอร์แก๊ส ${ai ? 'AI' : 'ทดลอง'}`, exact: true }).waitFor();
  return { context, page };
}

async function applyText(page, text) {
  await page.getByLabel('ข้อความที่พูด · แก้ไขหรือพิมพ์เองได้').fill(text);
  await page.getByRole('button', { name: 'กรอกฟอร์มจากข้อความ' }).click();
}

try {
  const { context, page } = await setup();
  await page.getByRole('button', { name: 'แตะเพื่อพูด' }).click();
  assert.equal(await page.evaluate(() => window.__voice.instances.at(-1).lang), 'th-TH');
  await page.evaluate(() => window.__emitVoice('เอ่อ ส่งแก๊สถังใหญ่ บ้านคุณสมชายปตท.'));
  await page.getByRole('button', { name: 'ย้อนกลับ · แก้ไขถัง' }).waitFor();
  assert.equal(await page.getByLabel('ชื่อลูกค้า', { exact: true }).inputValue(), 'คุณสมชาย');
  assert.equal(await page.getByLabel('ชื่อที่อยู่ / จุดหมายปลายทาง').inputValue(), 'บ้านคุณสมชาย');
  assert.match(await page.locator('.gas-details-panel').innerText(), /ปตท · ถังแก๊ส 15 กก. × 1/);
  assert.match(await page.locator('.gas-voice-feedback').innerText(), /ไม่ได้บอกจำนวน ใช้ 1 ถัง/);
  assert.match(await page.locator('.gas-return-control strong').innerText(), /0 \/ 1/);
  assert.equal(await page.locator('.gas-net-total strong').innerText(), '฿470.00');
  assert.equal(writes.length, 0);

  // One utterance selects both sizes, with distinct quantities and one destination.
  await page.getByRole('button', { name: 'แตะเพื่อพูด' }).click();
  await page.evaluate(() => window.__emitVoice('ปตท ถังใหญ่ 2 ถัง ถังเล็ก 1 ถัง ส่งที่หลังวัด'));
  assert.equal(await page.getByLabel('ชื่อลูกค้า', { exact: true }).inputValue(), 'หลังวัด');
  assert.equal(await page.getByLabel('ชื่อที่อยู่ / จุดหมายปลายทาง').inputValue(), 'หลังวัด');
  assert.match(await page.locator('.gas-details-panel').innerText(), /15 กก. × 2, ถังแก๊ส 4 กก. × 1/);
  assert.equal(await page.locator('.gas-net-total strong').innerText(), '฿1,120.00');
  assert.match(await page.locator('.gas-return-control strong').innerText(), /0 \/ 3/);
  await applyText(page, 'ปตท ถังใหญ่ 1 ถัง ถังเล็ก 3 ถัง ส่งที่บ้านผิด');
  assert.match(await page.locator('.gas-voice-feedback').innerText(), /ฟอร์มยังไม่เปลี่ยน/);
  assert.match(await page.locator('.gas-details-panel').innerText(), /15 กก. × 2, ถังแก๊ส 4 กก. × 1/);
  assert.equal(await page.getByLabel('ชื่อลูกค้า', { exact: true }).inputValue(), 'หลังวัด');
  await applyText(page, 'ปตท ถังใหญ่กับถังเล็กอย่างละ 2 ถัง ลูกค้าคุณสมชาย ส่งที่อู่ช่างชัย');
  assert.equal(await page.getByLabel('ชื่อลูกค้า', { exact: true }).inputValue(), 'คุณสมชาย');
  assert.equal(await page.getByLabel('ชื่อที่อยู่ / จุดหมายปลายทาง').inputValue(), 'อู่ช่างชัย');
  assert.match(await page.locator('.gas-details-panel').innerText(), /15 กก. × 2, ถังแก๊ส 4 กก. × 2/);
  await page.getByLabel('เบอร์โทรศัพท์ (ถ้ามี)').fill('0812345678');
  await applyText(page, 'ปตท ถังใหญ่ 1 ถัง ถังเล็ก 1 ถัง');
  assert.equal(await page.getByLabel('ชื่อลูกค้า', { exact: true }).inputValue(), '');
  assert.equal(await page.getByLabel('ชื่อที่อยู่ / จุดหมายปลายทาง').inputValue(), '');
  assert.equal(await page.getByLabel('เบอร์โทรศัพท์ (ถ้ามี)').inputValue(), '');
  assert.equal(await page.getByRole('button', { name: 'ทำรายการแก๊ส', exact: true }).isDisabled(), true);
  await applyText(page, 'ส่งแก๊ส ปตท ถังใหญ่ บ้านคุณสมชาย');

  await applyText(page, 'ส่งปตทถังใหญ่ 1 ถังให้คุณเจเจที่ดอนภูตา');
  assert.equal(await page.getByLabel('ชื่อลูกค้า', { exact: true }).inputValue(), 'คุณเจเจ');
  assert.equal(await page.getByLabel('ชื่อที่อยู่ / จุดหมายปลายทาง').inputValue(), 'ดอนภูตา');
  await applyText(page, 'ส่งแก๊ส ปตท ถังใหญ่ บ้านคุณสมชาย');

  // Stop processes final text exactly once; interim speech alone cannot fill a form.
  await page.getByRole('button', { name: 'แตะเพื่อพูด' }).click();
  assert.equal(await page.getByRole('button', { name: 'ทำรายการแก๊ส', exact: true }).isDisabled(), true);
  await page.evaluate(() => window.__emitVoice('สยาม ถังเล็ก บ้านป้าสมศรี', true, false));
  assert.equal(await page.getByLabel('ชื่อลูกค้า', { exact: true }).inputValue(), 'คุณสมชาย');
  await page.getByRole('button', { name: 'พูดเสร็จแล้ว' }).click();
  assert.equal(await page.getByLabel('ชื่อลูกค้า', { exact: true }).inputValue(), 'ป้าสมศรี');
  await page.getByLabel('เบอร์โทรศัพท์ (ถ้ามี)').fill('0812345678');
  await applyText(page, 'ส่งแก๊ส ปตท ถังใหญ่ ส่งที่หลังวัด');
  assert.equal(await page.getByLabel('ชื่อลูกค้า', { exact: true }).inputValue(), 'หลังวัด');
  assert.equal(await page.getByLabel('เบอร์โทรศัพท์ (ถ้ามี)').inputValue(), '');
  assert.equal(await page.getByLabel('ชื่อที่อยู่ / จุดหมายปลายทาง').inputValue(), 'หลังวัด');
  assert.equal(await page.getByRole('button', { name: 'ทำรายการแก๊ส', exact: true }).isDisabled(), false);

  await applyText(page, 'ส่งแก๊ส ปตท ถังใหญ่ บ้านคุณสมชาย');
  for (const invalid of ['ส่งแก๊ส ปตท ถังใหญ่ 9 ถัง บ้านคุณผิด', 'ส่งแก๊ส ปตท สยาม ถังใหญ่ บ้านคุณผิด', 'ส่งแก๊ส สยาม ถังใหญ่ บ้านคุณผิด']) {
    await applyText(page, invalid);
    assert.match(await page.locator('.gas-voice-feedback').innerText(), /ฟอร์มยังไม่เปลี่ยน/);
    assert.equal(await page.getByLabel('ชื่อลูกค้า', { exact: true }).inputValue(), 'คุณสมชาย');
    assert.match(await page.locator('.gas-details-panel').innerText(), /ปตท · ถังแก๊ส 15 กก. × 1/);
  }
  await page.getByRole('button', { name: 'แตะเพื่อพูด' }).click();
  await page.evaluate(() => window.__emitVoice('สยาม ถังเล็ก บ้านคุณผิด', false));
  assert.equal(await page.getByLabel('ชื่อลูกค้า', { exact: true }).inputValue(), 'คุณสมชาย');
  await page.getByRole('button', { name: 'แตะเพื่อพูด' }).click();
  await page.evaluate(() => window.__voice.instances.at(-1).onerror({ error: 'not-allowed' }));
  assert.match(await page.locator('.gas-voice-feedback').innerText(), /ยังไม่ได้อนุญาตไมโครโฟน/);
  assert.equal(await page.getByLabel('ชื่อลูกค้า', { exact: true }).inputValue(), 'คุณสมชาย');
  await page.getByRole('button', { name: 'แตะเพื่อพูด' }).click();
  await page.evaluate(() => window.__emitVoice('สยาม ถังเล็ก บ้านคุณผิด', true, false));
  await page.getByRole('button', { name: 'ยกเลิกการฟัง' }).click();
  assert.equal(await page.getByLabel('ชื่อลูกค้า', { exact: true }).inputValue(), 'คุณสมชาย');

  // Both iPad orientations and a small phone remain within the viewport.
  for (const viewport of [{ width: 1024, height: 768 }, { width: 768, height: 1024 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    await page.getByRole('heading', { name: 'พูดรับออร์เดอร์แก๊ส ทดลอง' }).scrollIntoViewIfNeeded();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, JSON.stringify(viewport));
    const mic = await page.getByRole('button', { name: 'แตะเพื่อพูด' }).boundingBox();
    assert.ok(mic.height >= 56);
    if (artifactDir) await page.screenshot({ path: `${artifactDir}/gas-voice-${viewport.width}.png`, fullPage: true });
  }
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.getByRole('button', { name: 'ย้อนกลับ · แก้ไขถัง' }).click();
  assert.equal(await page.getByRole('button', { name: 'ปตท', exact: true }).getAttribute('aria-pressed'), 'true');
  await page.getByRole('button', { name: 'ถัดไป · กรอกรายละเอียด' }).click();
  assert.equal(await page.getByLabel('ชื่อลูกค้า', { exact: true }).inputValue(), 'คุณสมชาย');
  await page.getByRole('button', { name: 'แตะเพื่อพูด' }).click();
  await page.getByRole('navigation', { name: 'เมนูหลัก' }).getByRole('button', { name: 'ขายหน้าร้าน' }).click();
  assert.ok(await page.evaluate(() => window.__voice.aborts > 0));
  assert.equal(await page.locator('.gas-voice-panel').count(), 0);
  await context.close();

  const fallback = await setup({ unsupported: true });
  assert.equal(await fallback.page.getByRole('button', { name: 'แตะเพื่อพูด' }).isDisabled(), true);
  await applyText(fallback.page, 'ส่งแก๊ส สยาม ถังเล็ก สองถัง บ้านป้าสมศรี');
  assert.equal(await fallback.page.getByLabel('ชื่อลูกค้า', { exact: true }).inputValue(), 'ป้าสมศรี');
  await fallback.context.close();

  const prefixed = await setup({ prefixed: true });
  await prefixed.page.getByRole('button', { name: 'แตะเพื่อพูด' }).click();
  await prefixed.page.evaluate(() => window.__emitVoice('ส่งแก๊ส ปตท ถังใหญ่ บ้านคุณสมชาย'));
  assert.equal(await prefixed.page.getByLabel('ชื่อลูกค้า', { exact: true }).inputValue(), 'คุณสมชาย');
  await prefixed.context.close();

  const ai = await setup({ ai: true });
  await applyText(ai.page, 'ส่งปตทถังใหญ่ 2 ถัง ถังเล็ก 1 ถังให้คุณเจเจที่ดอนภูตา');
  await ai.page.getByText('AI ช่วยแยกข้อความ', { exact: false }).waitFor();
  assert.equal(await ai.page.getByLabel('ชื่อลูกค้า', { exact: true }).inputValue(), 'คุณเจเจ');
  assert.equal(await ai.page.getByLabel('ชื่อที่อยู่ / จุดหมายปลายทาง').inputValue(), 'ดอนภูตา');
  assert.match(await ai.page.locator('.gas-details-panel').innerText(), /15 กก. × 2, ถังแก๊ส 4 กก. × 1/);
  await ai.context.close();

  const quota = await setup({ ai: true, aiBehavior: 'quota' });
  await applyText(quota.page, 'ส่งปตทถังใหญ่ 1 ถังให้คุณเจเจที่ดอนภูตา');
  await quota.page.getByText('AI ยังไม่พร้อม ใช้การแยกคำพื้นฐาน', { exact: false }).waitFor();
  assert.equal(await quota.page.getByLabel('ชื่อลูกค้า', { exact: true }).inputValue(), 'คุณเจเจ');
  await quota.context.close();

  const clarify = await setup({ ai: true, aiBehavior: 'clarify' });
  await applyText(clarify.page, 'ส่งปตทถังใหญ่ 2 ถัง ถังเล็ก 1 ถังให้คุณเจเจที่ดอนภูตา');
  await clarify.page.getByText('กรุณายืนยันจำนวนถัง', { exact: false }).waitFor();
  assert.equal(await clarify.page.locator('.gas-details-panel').count(), 0);
  await clarify.context.close();

  const delayed = await setup({ ai: true, aiBehavior: 'delayed' });
  await applyText(delayed.page, 'ส่งปตทถังใหญ่ 2 ถัง ถังเล็ก 1 ถังให้คุณเจเจที่ดอนภูตา');
  await delayed.page.getByRole('button', { name: 'ยกเลิกการแยกข้อความ' }).click();
  await delayed.page.waitForTimeout(400);
  assert.equal(await delayed.page.locator('.gas-details-panel').count(), 0);
  assert.match(await delayed.page.locator('.gas-voice-feedback').innerText(), /ยกเลิกการแยกข้อความแล้ว/);
  await delayed.context.close();
  assert.deepEqual(pageErrors, []);
  assert.deepEqual(writes, []);
  assert.equal(interpretations.length, 4);
  console.log('Gas voice browser checks passed: speech events, AI extraction, quota fallback, clarification, cancellation, stock, navigation and iPad layouts. No sale writes.');
} finally {
  await browser.close();
}
