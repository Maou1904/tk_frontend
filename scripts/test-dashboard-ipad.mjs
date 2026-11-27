// All shop API calls are mocked; never writes shop data.
import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome' });
const artifactDir = process.env.DASHBOARD_ARTIFACT_DIR;
if (artifactDir) await mkdir(artifactDir, { recursive: true });
const errors = [], writes = [];
const context = await browser.newContext({ viewport: { width: 1024, height: 768 }, acceptDownloads: true });
await context.addInitScript(() => sessionStorage.setItem('tingkum.authSession.v1', JSON.stringify({ token:'mock', expiresAt:'2099-01-01', user:{ id:1, username:'qa', displayName:'ทดสอบ', role:'owner', active:true } })));
let sales = [], transferRows = [], failTopup = true, topups = [];
let posCart = [{id:'1',productId:'1',name:'สินค้า QA',barcode:'885000000001',price:80,quantity:1,discount:0}];
const channels = ['POS','GAS','LOTTERY','TOPUP'];
function fixture(period, date) {
  return Array.from({ length: 180 }, (_,index) => ({
    id: `SALE-${String(index).padStart(3,'0')}`, channel: channels[index % 4],
    createdAt: new Date(`${period === 'day' ? date : period === 'month' ? `${date}-${String(index%28+1).padStart(2,'0')}` : `${date}-${String(index%12+1).padStart(2,'0')}-01`}T${String(index%24).padStart(2,'0')}:00:00+07:00`).toISOString(),
    customerName:'ลูกค้าทดสอบ', staffName:'พนักงานทดสอบ', paymentMethod:'เงินสด',
    status: index === 0 ? 'ยกเลิก' : index === 2 ? 'รอเจ้าของร้านยืนยัน' : 'สำเร็จ',
    items:[{ id:'1', name:'สินค้าทดสอบ', quantity:1, price:100+index, discount:0 }],
    subtotal:100+index, discount:0, total:100+index, cashReceived:100+index, change:0,
  }));
}
await context.route('**/api/**', async route => {
  const request = route.request(), url = new URL(request.url()), path = url.pathname;
  const respond = (data,status=200) => route.fulfill({ status,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify(data) });
  if (request.method() === 'OPTIONS') return route.fulfill({status:204,headers:{'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'*'}});
  if (request.method() !== 'GET') writes.push({path,body:request.postDataJSON()});
  if (path === '/api/products') return respond([{id:1,barcode:'885000000001',name:'สินค้า QA',price:80,cost:40,stock:10,min_stock:0,unit:'ชิ้น',active:true}]);
  if (path === '/api/staff') return respond([{id:'staff1',name:'พนักงาน QA',role:'ขายหน้าร้าน',active:true,phone:''}]);
  if (path.endsWith('/pos/checkout')) {
    const body=request.postDataJSON();
    const sale={id:'POS-QA',channel:'POS',createdAt:'2026-11-27T06:00:00Z',customerName:'ลูกค้า QA',staffName:'พนักงาน QA',paymentMethod:'เงินสด',status:'สำเร็จ',items:posCart,subtotal:80,discount:0,total:80,cashReceived:body.cashReceived,change:body.cashReceived-80};
    const receipt={...sale,billDiscount:0}; posCart=[];
    return respond({sale,receipt,cart:{items:[]},printRequest:{id:'PRINT-QA',receipt}},201);
  }
  if (/\/pos-sessions\/.*\/cart$/.test(path)) return respond({items:posCart});
  if (path === '/api/analytics/sales') {
    const period=url.searchParams.get('period'), date=url.searchParams.get(period==='day'?'date':period==='month'?'month':'year');
    sales = date === '2026-11-26' ? [] : fixture(period,date);
    transferRows = sales.length ? [
      { id:'TRANSFER', serviceType:'TRANSFER', principal:10000000, fee:2000, cashReceived:10002000, change:0, createdAt:sales[1].createdAt, cancelledAt:null, staff:'Owner' },
      { id:'ELECTRICITY', serviceType:'ELECTRICITY', principal:1000000, fee:2550, cashReceived:1002550, change:0, createdAt:sales[1].createdAt, cancelledAt:null, staff:'Owner' },
      { id:'CANCELLED', principal:9990000, fee:99000, cashReceived:10089000, change:0, createdAt:sales[1].createdAt, cancelledAt:'2026-11-27', staff:'Owner' },
    ] : [];
    return respond({sales,transfers:transferRows,startDate:period==='day'?date:period==='month'?`${date}-01`:`${date}-01-01`,endDate:'2027-01-01'});
  }
  if (path.endsWith('/topups')) {
    if (request.method() === 'POST') {
      if (failTopup) { failTopup=false; return respond({error:'ทดสอบบันทึกไม่สำเร็จ'},500); }
      const body=request.postDataJSON();
      const record={...body,id:'TOPUP-QA',createdAt:'2026-11-27T01:00:00Z',paid:false,toppedUp:false};
      topups.push(record); return respond(record,201);
    }
    return respond(topups);
  }
  if (path.endsWith('/electricity')) {
    if (request.method() === 'POST') { const body=request.postDataJSON(); return respond({...body,id:'ELECTRICITY-QA',change:body.cashReceived-body.principal-body.fee},201); }
    return respond({records:[],totals:{records:0,count:0,principal:0,fee:0,cash:0,change:0},defaultFee:2000});
  }
  if (/\/app-sessions\/[^/]+$/.test(path)) return respond({session_id:path.split('/').at(-1),status:'OPEN',previousClosedSession:null});
  if (path.endsWith('/cart')) return respond({items:[]});
  if (path.endsWith('/gas')) return respond({items:[],jobs:[],pendingReturns:[]});
  if (path === '/api/store-settings') return respond({defaultFee:2000,electricityFee:2000,gasDeliveryFee:0,topupAmount:10000});
  if (path === '/api/gas/voice/status') return respond({enabled:false,provider:'rules'});
  return respond([]);
});
const page = await context.newPage();
page.on('pageerror',error=>errors.push(error.message));
const nav = page.getByRole('navigation',{name:'เมนูหลัก'});
try {
  await page.goto(process.env.DASHBOARD_TEST_URL || 'http://127.0.0.1:5178');
  await nav.getByRole('button',{name:'แดชบอร์ด',exact:true}).click();
  await page.getByLabel('วันที่',{exact:true}).fill('2026-11-27');
  const salesPanel=page.locator('.analytics-sales-panel');
  await salesPanel.getByText(/^180 รายการ/).waitFor();
  assert.equal(await salesPanel.locator('tbody tr').count(),20);
  const total=sales.filter(sale=>!['ยกเลิก','รอเจ้าของร้านยืนยัน'].includes(sale.status)).reduce((sum,sale)=>sum+sale.total,0)+45.5;
  const totalText=new Intl.NumberFormat('th-TH',{style:'currency',currency:'THB'}).format(total);
  assert.equal(await page.getByTestId('trend-series-total').innerText(),totalText);
  assert.equal(await page.locator('.analytics-chart-point-picker option').count(),24);
  await page.getByRole('group',{name:'เลือกยอดขายในกราฟ'}).getByRole('button',{name:'ค่าบริการค่าไฟ',exact:true}).click();
  assert.equal(await page.getByTestId('trend-series-total').innerText(),'฿25.50');
  await page.getByLabel('เลือกชั่วโมงในกราฟ',{exact:true}).selectOption('1');
  assert.equal(await page.getByTestId('trend-point-value').innerText(),'฿25.50');
  await page.getByRole('group',{name:'เลือกยอดขายในกราฟ'}).getByRole('button',{name:'รวมทั้งหมด',exact:true}).click();
  await salesPanel.getByRole('button',{name:'หน้าที่ 2',exact:true}).click();
  assert.equal(await salesPanel.locator('tbody tr').count(),20);
  assert.match(await salesPanel.locator('tbody tr').first().innerText(),/SALE-020/);
  assert.equal(await page.getByTestId('trend-series-total').innerText(),totalText);
  await salesPanel.getByRole('button',{name:'หน้าที่ 9',exact:true}).click();
  assert.match(await salesPanel.locator('tbody tr').first().innerText(),/SALE-160/);
  assert.equal(await salesPanel.getByRole('button',{name:'ถัดไป',exact:true}).isEnabled(),false);
  await page.getByLabel('จำนวนรายการขายต่อหน้า',{exact:true}).selectOption('50');
  assert.equal(await salesPanel.locator('tbody tr').count(),50);
  assert.match(await salesPanel.locator('tbody tr').first().innerText(),/SALE-000/);
  await salesPanel.getByRole('button',{name:'หน้าที่ 4',exact:true}).click();
  assert.equal(await salesPanel.locator('tbody tr').count(),30);
  if (artifactDir) {
    await salesPanel.locator('.analytics-pagination').scrollIntoViewIfNeeded();
    await page.screenshot({path:`${artifactDir}/sales-pagination.png`});
  }
  const downloadPromise=page.waitForEvent('download');
  await page.getByRole('button',{name:/ส่งออก Excel/}).click();
  const download=await downloadPromise;
  const exported=await readFile(await download.path(),'utf8');
  assert(exported.includes('SALE-000') && exported.includes('SALE-179'));
  await page.getByRole('button',{name:'รายเดือน',exact:true}).click();
  await page.getByLabel('เดือน',{exact:true}).fill('2026-02');
  await page.waitForFunction(()=>document.querySelectorAll('.analytics-chart-point-picker option').length===28);
  assert.match(await salesPanel.locator('tbody tr').first().innerText(),/SALE-000/);
  await page.getByRole('button',{name:'รายปี',exact:true}).click();
  await page.getByLabel('ปี',{exact:true}).fill('2026');
  await page.waitForFunction(()=>document.querySelectorAll('.analytics-chart-point-picker option').length===12);
  if (artifactDir) for (const [width,height] of [[1024,768],[768,1024],[390,844]]) {
    await page.setViewportSize({width,height});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    await page.locator('.analytics-time-panel').scrollIntoViewIfNeeded();
    await page.screenshot({path:`${artifactDir}/dashboard-${width}.png`});
  }
  await page.getByRole('button',{name:'รายวัน',exact:true}).click();
  await page.getByLabel('วันที่',{exact:true}).fill('2026-11-26');
  await salesPanel.getByText('ยังไม่มีรายการขายในช่วงนี้',{exact:true}).waitFor();
  assert.equal(await salesPanel.locator('tbody tr').count(),0);
  assert.equal(await page.getByTestId('trend-series-total').innerText(),'฿0.00');

  await page.setViewportSize({width:1024,height:768});
  await nav.getByRole('button',{name:'เติมเงิน',exact:true}).click();
  const phone=page.getByLabel('เบอร์มือถือ',{exact:true});
  await phone.waitFor();
  for (const [width,height] of [[1024,768],[768,1024]]) {
    await page.setViewportSize({width,height});
    const left=await page.locator('.topup-entry-choices').boundingBox(),right=await page.locator('.topup-entry-number').boundingBox();
    assert(left.x+left.width<=right.x && Math.abs(left.y-right.y)<2);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    const key=page.locator('.topup-keypad button').first();
    assert((await key.boundingBox()).height>=60);
    const colors=await key.evaluate(node=>({key:getComputedStyle(node).backgroundColor,parent:getComputedStyle(node.parentElement).backgroundColor}));
    assert.notEqual(colors.key,colors.parent);
    if (artifactDir) await page.screenshot({path:`${artifactDir}/topup-${width}.png`});
  }
  await page.getByRole('button',{name:'AIS',exact:true}).click();
  await page.locator('.topup-quick-grid').getByRole('button',{name:'200',exact:true}).click();
  for (const digit of '0812345678') await page.locator('.topup-keypad').getByRole('button',{name:digit,exact:true}).click();
  assert.equal(await phone.inputValue(),'0812345678');
  await page.getByRole('button',{name:'ยืนยันรายการ',exact:true}).click();
  await page.getByText('เพิ่มรายการเติมเงินลง tingkum_db ไม่สำเร็จ',{exact:true}).waitFor();
  assert.equal(await page.locator('.transaction-completion').count(),0);
  assert.equal(await phone.inputValue(),'0812345678');
  await page.getByRole('button',{name:'ยืนยันรายการ',exact:true}).click();
  await page.locator('.transaction-completion').getByText('บันทึกรายการเติมเงินแล้ว',{exact:true}).waitFor();
  assert.equal(await page.locator('.transaction-completion-change').count(),0);
  assert.equal(writes.filter(write=>write.path.endsWith('/topups')).at(-1).body.amount,200);
  await page.getByRole('button',{name:'ปิดข้อความสำเร็จ',exact:true}).click();
  await nav.getByRole('button',{name:'จ่ายค่าไฟ',exact:true}).click();
  await page.getByLabel('ยอดค่าไฟ (บาท)',{exact:true}).fill('123.45');
  await page.getByRole('button',{name:/สรุปรายการ/}).click();
  await page.getByRole('button',{name:'200 บาท',exact:true}).click();
  const exactCash = page.getByRole('button',{name:'รับพอดี',exact:true});
  for (const [width,height] of [[1024,768],[768,1024]]) {
    await page.setViewportSize({width,height});
    const exactBox=await exactCash.boundingBox(),denomination=await page.getByRole('button',{name:'100 บาท',exact:true}).boundingBox();
    assert(exactBox.width>denomination.width*3 && exactBox.height>denomination.height);
    const dial=page.locator('.cash-dial');
    const enterBox=await dial.getByRole('button',{name:'รับเงิน',exact:true}).boundingBox();
    const deleteBox=await dial.getByRole('button',{name:'ลบ',exact:true}).boundingBox();
    const digitBox=await dial.getByRole('button',{name:'1',exact:true}).boundingBox();
    assert(deleteBox.y<enterBox.y && enterBox.height>digitBox.height*1.8);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    if (artifactDir) await page.screenshot({path:`${artifactDir}/cash-enter-${width}.png`});
  }
  await exactCash.click();
  assert.equal(await page.getByLabel('เงินสดที่รับจริง (บาท)').inputValue(),'143.45');
  await page.getByRole('button',{name:'200 บาท',exact:true}).click();
  await page.locator('.cash-dial').getByRole('button',{name:'0',exact:true}).focus();
  await page.keyboard.press('Enter');
  await page.locator('.transaction-completion-change').getByText('฿56.55',{exact:true}).waitFor();
  const noticeBox=await page.locator('.transaction-completion').boundingBox();
  const viewport=page.viewportSize();
  // Wait past the entry animation before inspecting the center or exporting an image.
  await page.waitForTimeout(600);
  const centered=await page.locator('.transaction-completion').boundingBox();
  assert(Math.abs(centered.x+centered.width/2-viewport.width/2)<2);
  assert(Math.abs(centered.y+centered.height/2-viewport.height/2)<2);
  assert(noticeBox.width>0);
  if (artifactDir) await page.screenshot({path:`${artifactDir}/completion-change.png`});
  await page.locator('.transaction-completion').waitFor({state:'hidden',timeout:7000});
  await nav.getByRole('button',{name:'ขายหน้าร้าน',exact:true}).click();
  await page.setViewportSize({width:390,height:844});
  await page.getByRole('button',{name:/ตะกร้า/}).click();
  const checkout=page.getByRole('dialog');
  await checkout.getByRole('button',{name:'ยืนยันรายการ',exact:true}).click();
  await checkout.getByRole('button',{name:'พนักงาน QA',exact:true}).click();
  await checkout.getByRole('button',{name:'ถัดไป',exact:true}).click();
  for (const digit of ['1','0','0']) await checkout.locator('.number-pad').getByRole('button',{name:digit,exact:true}).click();
  await checkout.getByRole('button',{name:'สรุปรายการ',exact:true}).click();
  await checkout.getByRole('button',{name:'ชำระเงิน / พิมพ์ใบเสร็จ',exact:true}).click();
  await page.locator('.transaction-completion-change').getByText('฿20.00',{exact:true}).waitFor();
  await page.emulateMedia({reducedMotion:'reduce'});
  assert.equal(await page.locator('.transaction-completion').evaluate(node=>getComputedStyle(node).animationName),'none');
  await page.getByRole('button',{name:'ปิดข้อความสำเร็จ',exact:true}).click();
  assert.equal(await page.locator('.transaction-completion').count(),0);
  assert.deepEqual(errors,[]);
  console.log('PASS: daily/monthly/yearly graphs, per-service fee totals, zero slots, pagination/last pages/reset, full Excel export, empty reports, iPad columns and button contrast, topup retry, centered completion/change and automatic dismissal. All shop APIs mocked.');
} finally { await context.close(); await browser.close(); }
