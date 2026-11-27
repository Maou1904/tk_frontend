// Synthetic camera frames and mocked shop APIs; no physical camera or shop writes.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
const require = createRequire(import.meta.url);
const { MultiFormatWriter, BarcodeFormat } = require('@zxing/library');
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const matrix = new MultiFormatWriter().encode('885000000001', BarcodeFormat.QR_CODE, 320, 320, new Map());
const pixels = [];
for (let y = 0; y < 320; y++) for (let x = 0; x < 320; x++) if (matrix.get(x, y)) pixels.push(y * 320 + x);
const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome' });
const context = await browser.newContext({ viewport: { width: 1024, height: 768 } });
const artifacts = process.env.CAMERA_ARTIFACT_DIR;
if (artifacts) await mkdir(artifacts, { recursive: true });
const errors = [], scans = [];
let cart = [], responseStatus = 200, responseDelay = 0;
await context.addInitScript(({ pixels }) => {
  sessionStorage.setItem('tingkum.authSession.v1', JSON.stringify({ token: 'mock', expiresAt: '2099-01-01', user: { id: 1, username: 'qa', displayName: 'ทดสอบ', role: 'owner', active: true } }));
  const state = window.cameraTest = { calls: 0, detections: ['885000000001'], detectDelay: 0, permissionDelay: 0, deny: false, streams: [], cameras: 1, blank: false, detectedCanvas: false, stopped: 0 };
  Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { configurable: true, value: async () => {
    state.calls++;
    const deny = state.deny, delay = state.permissionDelay;
    if (delay) await new Promise(resolve => setTimeout(resolve, delay));
    if (deny) throw new DOMException('Denied', 'NotAllowedError');
    const source = document.createElement('canvas'); source.width = 640; source.height = 480;
    const ctx = source.getContext('2d');
    const draw = () => {
      ctx.fillStyle = 'white'; ctx.fillRect(0, 0, 640, 480);
      if (!state.blank) { ctx.fillStyle = 'black'; for (const pixel of pixels) ctx.fillRect(160 + pixel % 320, 80 + Math.floor(pixel / 320), 1, 1); }
    };
    draw();
    const stream = source.captureStream(10), timer = setInterval(draw, 100);
    for (const track of stream.getTracks()) {
      const stop = track.stop.bind(track);
      track.stop = () => { clearInterval(timer); state.stopped++; stop(); };
      track.getSettings = () => ({ deviceId: `camera-${state.calls}`, width: 640, height: 480 });
    }
    state.streams.push(stream);
    return stream;
  } });
  Object.defineProperty(navigator.mediaDevices, 'enumerateDevices', { configurable: true, value: async () => Array.from({ length: state.cameras }, (_, i) => ({ kind: 'videoinput', deviceId: `camera-${i + 1}`, label: i ? 'Front camera' : 'Back camera', groupId: '' })) });
  window.BarcodeDetector = class {
    async detect(source) {
      state.detectedCanvas = source instanceof HTMLCanvasElement;
      const values = [...state.detections], delay = state.detectDelay;
      state.detectCalls = (state.detectCalls || 0) + 1;
      if (delay) await new Promise(resolve => setTimeout(resolve, delay));
      return values.map(rawValue => ({ rawValue }));
    }
  };
}, { pixels });
await context.route('**/api/**', async route => {
  const request = route.request(), path = new URL(request.url()).pathname;
  const respond = (data, status = 200) => route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(data) });
  if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
  if (path.endsWith('/cart/scan')) {
    const body = request.postDataJSON(); scans.push(body);
    if (responseDelay) await new Promise(resolve => setTimeout(resolve, responseDelay));
    if (responseStatus !== 200) return respond({ error: 'Mock failure' }, responseStatus);
    cart = [{ id: '1', productId: '1', name: 'น้ำดื่มทดสอบ', barcode: body.barcode, price: 20, quantity: (cart[0]?.quantity || 0) + 1, discount: 0 }];
    return respond({ items: cart });
  }
  if (request.method() !== 'GET') throw new Error(`Unexpected write: ${path}`);
  if (/\/pos-sessions\/.*\/cart$/.test(path)) return respond({ items: cart });
  if (path === '/api/products') return respond([{ id: 1, barcode: '885000000001', name: 'น้ำดื่มทดสอบ', price: 20, stock: 50, active: true }]);
  if (path === '/api/staff') return respond([{ id: 'staff1', name: 'พนักงาน QA', role: 'ขายหน้าร้าน', active: true }]);
  if (/\/app-sessions\/[^/]+$/.test(path)) return respond({ session_id: path.split('/').at(-1), status: 'OPEN', previousClosedSession: null });
  if (path.endsWith('/gas')) return respond({ items: [], jobs: [], pendingReturns: [] });
  if (path === '/api/gas/voice/status') return respond({ enabled: false, provider: 'rules' });
  if (path === '/api/store-settings') return respond({ defaultFee: 2000, electricityFee: 2000, gasDeliveryFee: 0, topupAmount: 10000 });
  return respond([]);
});
const page = await context.newPage();
page.on('pageerror', error => errors.push(error.message));
const panel = page.getByRole('region', { name: 'กล้องสแกนสินค้า', exact: true });
const capture = () => panel.getByRole('button', { name: 'จับภาพสแกน', exact: true });
const status = panel.locator('.pos-camera-status');
const ready = () => capture().waitFor({ state: 'visible' }).then(() => page.waitForFunction(() => document.querySelector('.pos-camera-capture')?.disabled === false));
const closeCamera = () => panel.getByRole('button', { name: 'ปิดกล้องสแกนสินค้า' }).click();
const openCamera = async () => { await page.getByRole('button', { name: 'เปิดกล้อง', exact: true }).click(); await ready(); };
const live = () => page.evaluate(() => window.cameraTest.streams.at(-1).getVideoTracks()[0].readyState);
try {
  await page.goto(process.env.CAMERA_TEST_URL || 'http://127.0.0.1:5178');
  await page.getByRole('button', { name: 'เปิดกล้อง', exact: true }).waitFor();
  await openCamera();
  await page.waitForTimeout(700);
  assert.equal(scans.length, 0, 'Opening the camera never adds a product');
  assert.equal(await page.evaluate(() => window.cameraTest.detectCalls || 0), 0, 'Opening never runs a decoder');
  await capture().click();
  await status.getByText(/เพิ่มบาร์โค้ด 885000000001 แล้ว/).waitFor();
  assert.equal(scans.length, 1);
  assert.equal(scans[0].source, 'mobile');
  assert.equal(await live(), 'live');
  assert.equal(await page.evaluate(() => window.cameraTest.detectedCanvas), true, 'Decoder receives a frozen image');
  await page.waitForTimeout(600);
  assert.equal(scans.length, 1, 'The same barcode stays idle until the next press');
  await capture().click();
  await status.getByText(/เพิ่มบาร์โค้ด/).waitFor();
  assert.equal(scans.length, 2, 'A second deliberate capture can add the same item again');

  for (const [width, height] of [[1024, 768], [768, 1024], [390, 844]]) {
    await page.setViewportSize({ width, height });
    const camera = await panel.boundingBox(), list = await page.locator('.pos-workspace').boundingBox();
    if (width > 600) assert(camera.x + camera.width <= list.x && Math.abs(camera.y - list.y) < 2, `${width}: camera left and bill right`);
    else assert(camera.y + camera.height <= list.y, 'Narrow phones stack without shrinking controls');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert((await capture().boundingBox()).height >= 60);
    if (artifacts) { await panel.scrollIntoViewIfNeeded(); await page.screenshot({ path: `${artifacts}/pos-camera-${width}.png` }); }
  }
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.getByRole('button', { name: /ตะกร้า/ }).click();
  assert.equal(await live(), 'live', 'Checkout keeps the preview alive');
  assert.equal(await page.locator('.pos-camera-capture').isEnabled(), false);
  await page.keyboard.press('Escape');
  await ready();

  // No code or several codes must never add an arbitrary product.
  await page.evaluate(() => { window.cameraTest.blank = true; window.cameraTest.detections = []; });
  await page.waitForTimeout(200);
  await capture().click(); await status.getByText(/อ่านบาร์โค้ดไม่พบ/).waitFor();
  assert.equal(scans.length, 2); assert.equal(await live(), 'live');
  await page.evaluate(() => { window.cameraTest.detections = ['111', '222']; });
  await capture().click(); await status.getByText(/พบหลายบาร์โค้ด/).waitFor();
  assert.equal(scans.length, 2);

  // A double press while decoding or submitting cannot add duplicates.
  await page.evaluate(() => { window.cameraTest.detections = ['885000000001']; window.cameraTest.detectDelay = 400; });
  responseDelay = 400;
  await capture().evaluate(button => { button.click(); button.click(); });
  await panel.getByRole('button', { name: 'กำลังสแกน…' }).waitFor();
  await ready(); assert.equal(scans.length, 3);
  responseDelay = 0;
  await page.evaluate(() => { window.cameraTest.detectDelay = 0; });
  responseStatus = 409;
  await capture().click(); await status.getByText(/เพิ่มสินค้าไม่สำเร็จ/).waitFor();
  await page.locator('.pos-workspace').getByText('สินค้าคงเหลือไม่พอ', { exact: true }).waitFor();
  assert.equal(await live(), 'live');
  responseStatus = 404;
  await capture().click(); await page.locator('.unknown-product-panel').waitFor();
  assert.equal(await page.locator('.pos-camera-capture').isEnabled(), false);
  await page.locator('.unknown-product-actions').getByRole('button', { name: 'ยกเลิก', exact: true }).click();
  responseStatus = 200;
  await ready();

  // Closing/navigating while an asynchronous decoder is pending discards its result.
  await page.evaluate(() => { window.cameraTest.detectDelay = 500; });
  const beforeCancel = scans.length;
  await capture().click(); await closeCamera();
  await page.waitForTimeout(650);
  assert.equal(scans.length, beforeCancel);
  assert.equal(await live(), 'ended');
  await page.evaluate(() => { window.cameraTest.detectDelay = 0; });

  // Real ZXing decoder reads a QR from a synthetic video, with no native detector.
  await page.evaluate(() => { delete window.BarcodeDetector; window.cameraTest.blank = false; });
  await openCamera();
  await capture().click(); await status.getByText(/เพิ่มบาร์โค้ด 885000000001 แล้ว/).waitFor();
  assert.equal(scans.at(-1).barcode, '885000000001');
  assert.equal(await live(), 'live');
  await closeCamera();

  // Permission errors allow retry; delayed permission cannot leave a hidden camera on.
  await page.evaluate(() => { window.cameraTest.deny = true; });
  await page.getByRole('button', { name: 'เปิดกล้อง', exact: true }).click();
  await status.getByText(/ยังไม่ได้อนุญาตสิทธิ์กล้อง/).waitFor();
  assert.equal(await page.locator('.pos-camera-capture').isEnabled(), false);
  await page.evaluate(() => { window.cameraTest.deny = false; });
  await panel.getByRole('button', { name: 'เปิดกล้องอีกครั้ง' }).click(); await ready();
  await closeCamera();
  await page.evaluate(() => { window.cameraTest.permissionDelay = 600; });
  await page.getByRole('button', { name: 'เปิดกล้อง', exact: true }).click();
  await status.getByText('กำลังเปิดกล้อง', { exact: true }).waitFor(); await closeCamera();
  await page.waitForTimeout(800);
  assert.equal(await live(), 'ended');
  await page.evaluate(() => { window.cameraTest.permissionDelay = 0; window.cameraTest.cameras = 2; });
  await openCamera();
  const callsBeforeSwitch = await page.evaluate(() => window.cameraTest.calls);
  await panel.getByRole('button', { name: 'สลับกล้อง', exact: true }).click(); await ready();
  assert.equal(await page.evaluate(() => window.cameraTest.calls), callsBeforeSwitch + 1);
  await page.getByRole('navigation', { name: 'เมนูหลัก' }).getByRole('button', { name: 'ขายแก๊ส', exact: true }).click();
  await panel.waitFor({ state: 'hidden' });
  assert.equal(await live(), 'ended');
  assert.equal(await page.evaluate(() => window.cameraTest.streams.every(stream => stream.getTracks().every(track => track.readyState === 'ended'))), true);
  assert.deepEqual(errors, []);
  console.log('PASS: manual frozen-frame scan, no automatic scans, one item per press, same-item rescan, real ZXing fallback, camera retained, iPad left/right columns, phone layout, duplicate prevention, stock/unknown errors, permission retry, late-permission cleanup, cancelled decoder, camera switch and navigation cleanup. All camera input synthetic and shop APIs mocked.');
} finally { await context.close(); await browser.close(); }
