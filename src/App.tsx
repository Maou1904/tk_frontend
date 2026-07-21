import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import type { CartItem } from './types';
import './App.css';

type View = 'POS' | 'GAS' | 'LOTTERY' | 'HISTORY' | 'ANALYTICS' | 'STOCK' | 'STAFF';
type PaymentMethod = 'เงินสด' | 'PromptPay';
type SaleChannel = 'POS' | 'GAS' | 'LOTTERY';

interface ReceiptSnapshot {
  id: string;
  createdAt: Date;
  cashierName: string;
  customerName: string;
  paymentMethod: PaymentMethod;
  items: CartItem[];
  subtotal: number;
  billDiscount: number;
  total: number;
  cashReceived: number;
  change: number;
}

interface SaleRecordItem {
  name: string;
  barcode?: string;
  quantity: number;
  price: number;
  discount: number;
}

interface SaleRecord {
  id: string;
  channel: SaleChannel;
  createdAt: Date;
  customerName: string;
  staffName: string;
  paymentMethod: PaymentMethod;
  status: 'สำเร็จ' | 'กำลังดำเนินการ' | 'เสร็จแล้ว';
  items: SaleRecordItem[];
  subtotal: number;
  discount: number;
  total: number;
  cashReceived: number;
  change: number;
  note?: string;
}

interface Product {
  id: number;
  name: string;
  barcode: string;
  price: number;
  stock: number;
  category: string;
  minStock: number;
  unit: string;
}

interface ApiProduct {
  id: number;
  name: string;
  barcode: string;
  price: number | string;
  stock: number;
  category?: string;
  minStock?: number;
  min_stock?: number;
  unit?: string;
}

interface Member {
  id: string;
  name: string;
  phone: string;
  note: string;
}

interface StaffMember {
  id: string;
  name: string;
  phone: string;
  role: string;
  active: boolean;
}

interface GasItem {
  id: string;
  name: string;
  operation: 'เติมแก๊ส' | 'ซื้อ/ยืมถัง';
  price: number;
  stock: number;
  imageUrl: string;
}

interface GasJob {
  id: string;
  customerName: string;
  phone: string;
  address: string;
  driver: string;
  items: Array<{ name: string; quantity: number; price: number }>;
  total: number;
  status: 'กำลังดำเนินการ' | 'เสร็จแล้ว';
  createdAt: string;
}

interface LotteryTicket {
  number: string;
  series: string;
  price: number;
  remaining: number;
}

interface StockAdjustment {
  id: string;
  productName: string;
  delta: number;
  reason: string;
  staffName: string;
  createdAt: string;
  date: string;
}

interface NewProductDraft {
  barcode: string;
  name: string;
  price: string;
  stock: string;
  category: string;
  minStock: string;
  unit: string;
}

interface PendingGasReturn {
  id: string;
  customerName: string;
  phone: string;
  tankName: string;
  borrowedAt: string;
  quantity: number;
}

const sampleProducts: Product[] = [
  { id: 1, name: 'น้ำดื่ม 600ml', barcode: '8850001', price: 7, stock: 48, category: 'เครื่องดื่ม', minStock: 12, unit: 'ขวด' },
  { id: 2, name: 'ไข่ไก่เบอร์ 2', barcode: '8850002', price: 4.5, stock: 80, category: 'ของสด', minStock: 30, unit: 'ฟอง' },
  { id: 3, name: 'มาม่าหมูสับ', barcode: '8850003', price: 8, stock: 36, category: 'ของแห้ง', minStock: 20, unit: 'ซอง' },
  { id: 4, name: 'น้ำปลา 700ml', barcode: '8850004', price: 32, stock: 11, category: 'เครื่องปรุง', minStock: 12, unit: 'ขวด' },
  { id: 5, name: 'ข้าวหอม 5kg', barcode: '8850005', price: 185, stock: 8, category: 'ของแห้ง', minStock: 6, unit: 'ถุง' },
  { id: 6, name: 'นมกล่องจืด', barcode: '8850006', price: 12, stock: 24, category: 'เครื่องดื่ม', minStock: 18, unit: 'กล่อง' },
];

const sampleMembers: Member[] = [
  { id: 'M-001', name: 'ป้าสมใจ', phone: '0812345678', note: 'ซื้อประจำ ซอย 3' },
  { id: 'M-002', name: 'ลุงวิชัย', phone: '0891112222', note: 'มักซื้อแก๊สและน้ำดื่ม' },
  { id: 'M-003', name: 'คุณนิด', phone: '0865551212', note: 'ลูกค้าประจำหน้าร้าน' },
];

const initialStaff: StaffMember[] = [
  { id: 'S-001', name: 'แม่ติ๋ง', phone: '0810001111', role: 'เจ้าของร้าน', active: true },
  { id: 'S-002', name: 'ตั้ม', phone: '0820002222', role: 'ขายหน้าร้าน', active: true },
  { id: 'S-003', name: 'บอล', phone: '0830003333', role: 'ส่งแก๊ส', active: true },
  { id: 'S-004', name: 'มายด์', phone: '0840004444', role: 'พนักงานพาร์ทไทม์', active: false },
];

const gasCatalog: GasItem[] = [
  { id: 'G-04-R', name: 'ปตท. 4 กก.', operation: 'เติมแก๊ส', price: 200, stock: 9, imageUrl: 'https://images.unsplash.com/photo-1600880292203-757bb62b4baf?auto=format&fit=crop&w=360&q=80' },
  { id: 'G-15-R', name: 'ปตท. 15 กก.', operation: 'เติมแก๊ส', price: 450, stock: 18, imageUrl: 'https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&w=360&q=80' },
  { id: 'G-15-N', name: 'ถังใหม่ 15 กก. พร้อมเนื้อ', operation: 'ซื้อ/ยืมถัง', price: 2500, stock: 4, imageUrl: 'https://images.unsplash.com/photo-1621905251189-08b45d6a269e?auto=format&fit=crop&w=360&q=80' },
  { id: 'G-48-R', name: 'ถังใหญ่ 48 กก.', operation: 'เติมแก๊ส', price: 1350, stock: 3, imageUrl: 'https://images.unsplash.com/photo-1621905252507-b35492cc74b4?auto=format&fit=crop&w=360&q=80' },
];

const initialPendingGasReturns: PendingGasReturn[] = [
  { id: 'TANK-001', customerName: 'ป้าสมใจ', phone: '0812345678', tankName: 'ปตท. 15 กก.', borrowedAt: 'เมื่อวาน 14:10', quantity: 1 },
  { id: 'TANK-002', customerName: 'ลุงวิชัย', phone: '0891112222', tankName: 'ปตท. 4 กก.', borrowedAt: 'วันนี้ 08:35', quantity: 2 },
];

const initialGasJobs: GasJob[] = [
  {
    id: 'GAS-1001',
    customerName: 'ป้าสมใจ',
    phone: '0812345678',
    address: 'บ้านเลขที่ 12 ซอย 3',
    driver: 'บอล',
    items: [{ name: 'ปตท. 15 กก.', quantity: 1, price: 450 }],
    total: 450,
    status: 'กำลังดำเนินการ',
    createdAt: '09:20',
  },
  {
    id: 'GAS-1000',
    customerName: 'ลุงวิชัย',
    phone: '0891112222',
    address: 'ร้านซ่อมรถหน้าปากซอย',
    driver: 'บอล',
    items: [{ name: 'ปตท. 4 กก.', quantity: 2, price: 200 }],
    total: 400,
    status: 'เสร็จแล้ว',
    createdAt: '08:35',
  },
];

const lotteryStock: LotteryTicket[] = [
  { number: '123456', series: 'ชุด 01', price: 100, remaining: 2 },
  { number: '654321', series: 'ชุด 01', price: 100, remaining: 1 },
  { number: '889900', series: 'ชุด 02', price: 100, remaining: 5 },
  { number: '112233', series: 'ชุด 02', price: 100, remaining: 0 },
  { number: '456789', series: 'ชุด 03', price: 100, remaining: 3 },
];

const initialSalesHistory: SaleRecord[] = [
  {
    id: 'POS-20260721-091500',
    channel: 'POS',
    createdAt: new Date('2026-07-21T09:15:00'),
    customerName: 'ป้าสมใจ',
    staffName: 'แม่ติ๋ง',
    paymentMethod: 'เงินสด',
    status: 'สำเร็จ',
    items: [
      { name: 'น้ำดื่ม 600ml', barcode: '8850001', quantity: 6, price: 7, discount: 0 },
      { name: 'มาม่าหมูสับ', barcode: '8850003', quantity: 3, price: 8, discount: 0 },
    ],
    subtotal: 66,
    discount: 0,
    total: 66,
    cashReceived: 100,
    change: 34,
    note: 'ขายหน้าร้าน',
  },
  {
    id: 'GAS-1000',
    channel: 'GAS',
    createdAt: new Date('2026-07-21T08:35:00'),
    customerName: 'ลุงวิชัย',
    staffName: 'บอล',
    paymentMethod: 'เงินสด',
    status: 'เสร็จแล้ว',
    items: [{ name: 'ปตท. 4 กก. เติมแก๊ส', quantity: 2, price: 200, discount: 0 }],
    subtotal: 400,
    discount: 0,
    total: 400,
    cashReceived: 400,
    change: 0,
    note: 'ร้านซ่อมรถหน้าปากซอย',
  },
  {
    id: 'LOT-20260721-103000',
    channel: 'LOTTERY',
    createdAt: new Date('2026-07-21T10:30:00'),
    customerName: 'ลูกค้าทั่วไป',
    staffName: 'ตั้ม',
    paymentMethod: 'เงินสด',
    status: 'สำเร็จ',
    items: [
      { name: 'หวยเลข 123456', barcode: 'ชุด 01', quantity: 1, price: 100, discount: 0 },
      { name: 'หวยเลข 889900', barcode: 'ชุด 02', quantity: 1, price: 100, discount: 0 },
    ],
    subtotal: 200,
    discount: 0,
    total: 200,
    cashReceived: 200,
    change: 0,
    note: 'ขายหวยหน้าร้าน',
  },
];

const viewMeta: Record<View, { icon: string; title: string; subtitle: string }> = {
  POS: { icon: 'point_of_sale', title: 'POS', subtitle: 'ขายหน้าร้าน แสกนสินค้า สมาชิก ชำระเงิน' },
  GAS: { icon: 'propane_tank', title: 'Gas', subtitle: 'ขายแก๊สและติดตามงานส่ง แยกเงินจาก POS' },
  LOTTERY: { icon: 'confirmation_number', title: 'Lottery', subtitle: 'ขายหวยจากเลขในสต็อก' },
  HISTORY: { icon: 'receipt_long', title: 'History', subtitle: 'ประวัติการขายทั้งหมดและรายละเอียดแต่ละรายการ' },
  ANALYTICS: { icon: 'monitoring', title: 'Analytics', subtitle: 'ภาพรวมยอดขาย สต็อก และพนักงาน' },
  STOCK: { icon: 'inventory_2', title: 'Stock', subtitle: 'จัดการสินค้าและบันทึกการปรับสต็อก' },
  STAFF: { icon: 'badge', title: 'Staff', subtitle: 'ข้อมูลพนักงานในร้าน' },
};

const saleChannelMeta: Record<SaleChannel, { icon: string; label: string; className: string }> = {
  POS: { icon: 'point_of_sale', label: 'POS', className: 'pos' },
  GAS: { icon: 'propane_tank', label: 'แก๊ส', className: 'gas' },
  LOTTERY: { icon: 'confirmation_number', label: 'หวย', className: 'lottery' },
};

const paymentMethods: PaymentMethod[] = ['เงินสด', 'PromptPay'];
const todayLabel = new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium' }).format(new Date());
const storageKeys = {
  stockItems: 'tingkum.stockItems.v1',
  gasItems: 'tingkum.gasItems.v1',
  gasJobs: 'tingkum.gasJobs.v1',
  gasJobSequence: 'tingkum.gasJobSequence.v1',
  pendingGasReturns: 'tingkum.pendingGasReturns.v1',
  lotteryTickets: 'tingkum.lotteryTickets.v1',
  salesHistory: 'tingkum.salesHistory.v1',
  staffMembers: 'tingkum.staffMembers.v1',
  stockLog: 'tingkum.stockLog.v1',
  stockLogSequence: 'tingkum.stockLogSequence.v1',
} as const;

function formatMoney(value: number) {
  return new Intl.NumberFormat('th-TH', {
    style: 'currency',
    currency: 'THB',
    maximumFractionDigits: 2,
  }).format(value);
}

function hasStoredValue(key: string) {
  if (typeof window === 'undefined') {
    return false;
  }

  return window.localStorage.getItem(key) !== null;
}

function readStoredValue<T>(key: string, fallback: T, revive?: (value: unknown) => T): T {
  if (typeof window === 'undefined') {
    return fallback;
  }

  try {
    const rawValue = window.localStorage.getItem(key);
    if (!rawValue) {
      return fallback;
    }

    const parsedValue: unknown = JSON.parse(rawValue);
    return revive ? revive(parsedValue) : parsedValue as T;
  } catch {
    return fallback;
  }
}

function writeStoredValue<T>(key: string, value: T) {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage can fail in private mode or when the quota is full. The app still works in memory.
  }
}

function reviveSalesHistory(value: unknown): SaleRecord[] {
  if (!Array.isArray(value)) {
    return initialSalesHistory;
  }

  return value.map((sale) => {
    const record = sale as SaleRecord;
    return {
      ...record,
      createdAt: new Date(record.createdAt),
    };
  });
}

function formatReceiptDateTime(date: Date) {
  return new Intl.DateTimeFormat('th-TH', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function createSaleId(prefix: SaleChannel, date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hour = String(date.getHours()).padStart(2, '0');
  const minute = String(date.getMinutes()).padStart(2, '0');
  const second = String(date.getSeconds()).padStart(2, '0');
  return `${prefix}-${year}${month}${day}-${hour}${minute}${second}`;
}

function createReceiptId(date: Date) {
  return createSaleId('POS', date);
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function buildReceiptHtml(receipt: ReceiptSnapshot) {
  const rows = receipt.items.map((item) => {
    const lineTotal = Math.max(0, item.price * item.quantity - item.discount);
    const discountText = item.discount > 0
      ? `<div class="receipt-item-discount">ส่วนลด ${formatMoney(item.discount)}</div>`
      : '';

    return `
      <div class="receipt-item">
        <div>
          <strong>${escapeHtml(item.name)}</strong>
          <span>${escapeHtml(item.barcode)} | ${item.quantity} x ${formatMoney(item.price)}</span>
          ${discountText}
        </div>
        <b>${formatMoney(lineTotal)}</b>
      </div>
    `;
  }).join('');

  return `
    <div class="receipt-pdf-sheet">
      <header class="receipt-pdf-header">
        <div class="receipt-logo">TK</div>
        <h1>Tingkum Shop</h1>
        <p>ใบเสร็จรับเงิน / Receipt</p>
      </header>

      <section class="receipt-meta">
        <div><span>เลขที่</span><strong>${receipt.id}</strong></div>
        <div><span>วันที่</span><strong>${formatReceiptDateTime(receipt.createdAt)}</strong></div>
        <div><span>ลูกค้า</span><strong>${escapeHtml(receipt.customerName)}</strong></div>
        <div><span>ผู้ขาย</span><strong>${escapeHtml(receipt.cashierName)}</strong></div>
        <div><span>ชำระด้วย</span><strong>${receipt.paymentMethod}</strong></div>
      </section>

      <section class="receipt-items">
        ${rows}
      </section>

      <section class="receipt-totals">
        <div><span>ยอดสินค้า</span><strong>${formatMoney(receipt.subtotal)}</strong></div>
        <div><span>ส่วนลดท้ายบิล</span><strong>${formatMoney(receipt.billDiscount)}</strong></div>
        <div class="receipt-grand-total"><span>ยอดสุทธิ</span><strong>${formatMoney(receipt.total)}</strong></div>
        <div><span>รับเงิน</span><strong>${formatMoney(receipt.cashReceived)}</strong></div>
        <div><span>เงินทอน</span><strong>${formatMoney(receipt.change)}</strong></div>
      </section>

      <footer class="receipt-pdf-footer">
        <strong>ขอบคุณที่ใช้บริการ</strong>
        <span>กรุณาตรวจสอบรายการก่อนออกจากร้าน</span>
      </footer>
    </div>
  `;
}

async function downloadReceiptPdf(receipt: ReceiptSnapshot) {
  const wrapper = document.createElement('div');
  wrapper.className = 'receipt-pdf-render-root';
  wrapper.innerHTML = buildReceiptHtml(receipt);
  document.body.appendChild(wrapper);

  try {
    await document.fonts.ready;

    const receiptElement = wrapper.querySelector<HTMLElement>('.receipt-pdf-sheet');
    if (!receiptElement) {
      throw new Error('Receipt element was not created');
    }

    const canvas = await html2canvas(receiptElement, {
      backgroundColor: '#ffffff',
      height: receiptElement.scrollHeight,
      scale: 2,
      scrollX: 0,
      scrollY: 0,
      useCORS: true,
      width: receiptElement.scrollWidth,
      windowHeight: receiptElement.scrollHeight,
      windowWidth: receiptElement.scrollWidth,
    });
    const imageData = canvas.toDataURL('image/png');
    const pdfWidth = 80;
    const pdfHeight = Math.max(120, (canvas.height * pdfWidth) / canvas.width);
    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: [pdfWidth, pdfHeight],
      compress: true,
    });

    pdf.addImage(imageData, 'PNG', 0, 0, pdfWidth, pdfHeight);
    pdf.save(`${receipt.id}.pdf`);
  } finally {
    wrapper.remove();
  }
}

function saleRecordToReceipt(record: SaleRecord): ReceiptSnapshot {
  return {
    id: record.id,
    createdAt: record.createdAt,
    cashierName: record.staffName,
    customerName: record.customerName,
    paymentMethod: record.paymentMethod,
    items: record.items.map((item, index) => ({
      id: `${record.id}-${index}`,
      name: item.name,
      barcode: item.barcode ?? '-',
      price: item.price,
      quantity: item.quantity,
      discount: item.discount,
      item_type: record.channel === 'GAS' ? 'GAS' : record.channel === 'LOTTERY' ? 'LOTTERY' : 'PRODUCT',
    })),
    subtotal: record.subtotal,
    billDiscount: record.discount,
    total: record.total,
    cashReceived: record.cashReceived,
    change: record.change,
  };
}

function normalizeProduct(product: ApiProduct): Product {
  return {
    id: product.id,
    name: product.name,
    barcode: product.barcode,
    price: Number(product.price),
    stock: Number(product.stock ?? 0),
    category: product.category ?? 'ทั่วไป',
    minStock: Number(product.minStock ?? product.min_stock ?? 5),
    unit: product.unit ?? 'ชิ้น',
  };
}

function currentTimeLabel() {
  return new Intl.DateTimeFormat('th-TH', { hour: '2-digit', minute: '2-digit' }).format(new Date());
}

function dateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function currentDateInput() {
  return dateInputValue(new Date());
}

function Icon({ name }: { name: string }) {
  return <span className="material-symbols-outlined" aria-hidden="true">{name}</span>;
}

function PanelTitle({ icon, title, detail }: { icon: string; title: string; detail?: string }) {
  return (
    <div className="panel-title">
      <div>
        <h3><Icon name={icon} /> {title}</h3>
        {detail && <p>{detail}</p>}
      </div>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return <div className="empty-state">{text}</div>;
}

export default function App() {
  const [hasSavedStock] = useState(() => hasStoredValue(storageKeys.stockItems));
  const [currentView, setCurrentView] = useState<View>('POS');
  const [apiStatus, setApiStatus] = useState('ใช้ข้อมูลตัวอย่าง');
  const [stockItems, setStockItems] = useState<Product[]>(() =>
    readStoredValue(storageKeys.stockItems, sampleProducts),
  );
  const [staffMembers, setStaffMembers] = useState<StaffMember[]>(() =>
    readStoredValue(storageKeys.staffMembers, initialStaff),
  );

  const [posCart, setPosCart] = useState<CartItem[]>([]);
  const [barcodeInput, setBarcodeInput] = useState('');
  const [memberPhone, setMemberPhone] = useState('');
  const [currentMember, setCurrentMember] = useState<Member | null>(null);
  const [cashierId, setCashierId] = useState(initialStaff[0].id);
  const [posPayment, setPosPayment] = useState<PaymentMethod>('เงินสด');
  const [cashReceived, setCashReceived] = useState(0);
  const [billDiscount, setBillDiscount] = useState(0);
  const [posNotice, setPosNotice] = useState('พร้อมขาย');
  const [isPrintingReceipt, setIsPrintingReceipt] = useState(false);
  const [unknownBarcode, setUnknownBarcode] = useState('');
  const [newProductDraft, setNewProductDraft] = useState<NewProductDraft>({
    barcode: '',
    name: '',
    price: '',
    stock: '1',
    category: 'ทั่วไป',
    minStock: '5',
    unit: 'ชิ้น',
  });

  const [gasItems, setGasItems] = useState<GasItem[]>(() =>
    readStoredValue(storageKeys.gasItems, gasCatalog),
  );
  const [gasQuantities, setGasQuantities] = useState<Record<string, number>>({});
  const [gasCustomer, setGasCustomer] = useState({ name: '', phone: '', address: '' });
  const [gasDriverId, setGasDriverId] = useState('S-003');
  const [gasJobs, setGasJobs] = useState<GasJob[]>(() =>
    readStoredValue(storageKeys.gasJobs, initialGasJobs),
  );
  const [pendingGasReturns, setPendingGasReturns] = useState<PendingGasReturn[]>(() =>
    readStoredValue(storageKeys.pendingGasReturns, initialPendingGasReturns),
  );
  const [gasJobSequence, setGasJobSequence] = useState(() =>
    readStoredValue(storageKeys.gasJobSequence, 1002),
  );
  const [gasNotice, setGasNotice] = useState('เลือกถังแก๊สเพื่อเริ่มรายการ');

  const [lotteryInput, setLotteryInput] = useState('');
  const [lotteryTickets, setLotteryTickets] = useState<LotteryTicket[]>(() =>
    readStoredValue(storageKeys.lotteryTickets, lotteryStock),
  );
  const [lotteryCart, setLotteryCart] = useState<CartItem[]>([]);
  const [lotteryPayment, setLotteryPayment] = useState<PaymentMethod>('เงินสด');
  const [lotteryReceived, setLotteryReceived] = useState(0);
  const [lotteryNotice, setLotteryNotice] = useState('ค้นหาเลข 6 หลักจากสต็อก');

  const [correctionProductId, setCorrectionProductId] = useState(String(sampleProducts[0].id));
  const [correctionDelta, setCorrectionDelta] = useState('1');
  const [correctionReason, setCorrectionReason] = useState('');
  const [stockLog, setStockLog] = useState<StockAdjustment[]>(() =>
    readStoredValue(storageKeys.stockLog, [
      {
        id: 'LOG-001',
        productName: 'น้ำปลา 700ml',
        delta: -1,
        reason: 'สินค้าแตกตอนขนย้าย',
        staffName: 'แม่ติ๋ง',
        createdAt: 'วันนี้ 18:20',
        date: currentDateInput(),
      },
    ]),
  );
  const [stockLogSequence, setStockLogSequence] = useState(() =>
    readStoredValue(storageKeys.stockLogSequence, 2),
  );
  const [selectedStockCategory, setSelectedStockCategory] = useState('ทั้งหมด');
  const [stockLogDateFilter, setStockLogDateFilter] = useState(currentDateInput());

  const [staffForm, setStaffForm] = useState({ name: '', phone: '', role: 'ขายหน้าร้าน' });
  const [salesHistory, setSalesHistory] = useState<SaleRecord[]>(() =>
    readStoredValue(storageKeys.salesHistory, initialSalesHistory, reviveSalesHistory),
  );
  const [historyFilter, setHistoryFilter] = useState<SaleChannel | 'ALL'>('ALL');
  const [selectedSaleId, setSelectedSaleId] = useState(initialSalesHistory[0]?.id ?? '');
  const [historyNotice, setHistoryNotice] = useState('กดรายการเพื่อดูรายละเอียดทั้งหมด');

  useEffect(() => {
    if (hasSavedStock) {
      axios.get<ApiProduct[]>('http://localhost:5000/api/products')
        .then(() => setApiStatus('ใช้ข้อมูลในเครื่อง | backend online'))
        .catch(() => setApiStatus('ใช้ข้อมูลในเครื่อง'));
      return;
    }

    axios.get<ApiProduct[]>('http://localhost:5000/api/products')
      .then((response) => {
        const normalized = response.data.map(normalizeProduct);
        if (normalized.length > 0) {
          setStockItems(normalized);
          setApiStatus('เชื่อมต่อ tingkum_db แล้ว');
        }
      })
      .catch(() => {
        setApiStatus('ใช้ข้อมูลตัวอย่าง');
      });
  }, [hasSavedStock]);

  useEffect(() => writeStoredValue(storageKeys.stockItems, stockItems), [stockItems]);
  useEffect(() => writeStoredValue(storageKeys.staffMembers, staffMembers), [staffMembers]);
  useEffect(() => writeStoredValue(storageKeys.gasItems, gasItems), [gasItems]);
  useEffect(() => writeStoredValue(storageKeys.gasJobs, gasJobs), [gasJobs]);
  useEffect(() => writeStoredValue(storageKeys.pendingGasReturns, pendingGasReturns), [pendingGasReturns]);
  useEffect(() => writeStoredValue(storageKeys.gasJobSequence, gasJobSequence), [gasJobSequence]);
  useEffect(() => writeStoredValue(storageKeys.lotteryTickets, lotteryTickets), [lotteryTickets]);
  useEffect(() => writeStoredValue(storageKeys.salesHistory, salesHistory), [salesHistory]);
  useEffect(() => writeStoredValue(storageKeys.stockLog, stockLog), [stockLog]);
  useEffect(() => writeStoredValue(storageKeys.stockLogSequence, stockLogSequence), [stockLogSequence]);

  const activeStaff = useMemo(() => staffMembers.filter((staff) => staff.active), [staffMembers]);
  const deliveryStaff = useMemo(
    () => activeStaff.filter((staff) => staff.role.includes('ส่ง') || staff.role.includes('แก๊ส')),
    [activeStaff],
  );

  useEffect(() => {
    if (activeStaff.length > 0 && !activeStaff.some((staff) => staff.id === cashierId)) {
      setCashierId(activeStaff[0].id);
    }
  }, [activeStaff, cashierId]);

  useEffect(() => {
    const availableDrivers = deliveryStaff.length > 0 ? deliveryStaff : activeStaff;
    if (availableDrivers.length > 0 && !availableDrivers.some((staff) => staff.id === gasDriverId)) {
      setGasDriverId(availableDrivers[0].id);
    }
  }, [activeStaff, deliveryStaff, gasDriverId]);

  const posSubtotal = useMemo(
    () => posCart.reduce((sum, item) => sum + item.price * item.quantity - item.discount, 0),
    [posCart],
  );
  const posTotal = Math.max(0, posSubtotal - billDiscount);
  const posChange = posPayment === 'เงินสด' ? Math.max(0, cashReceived - posTotal) : 0;

  const gasOrderItems = useMemo(
    () => gasItems
      .map((item) => ({ ...item, quantity: gasQuantities[item.id] ?? 0 }))
      .filter((item) => item.quantity > 0),
    [gasItems, gasQuantities],
  );
  const gasTotal = gasOrderItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const activeGasJobs = gasJobs.filter((job) => job.status === 'กำลังดำเนินการ');
  const completedGasJobs = gasJobs.filter((job) => job.status === 'เสร็จแล้ว');

  const lotterySubtotal = lotteryCart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const lotteryChange = lotteryPayment === 'เงินสด' ? Math.max(0, lotteryReceived - lotterySubtotal) : 0;

  const lowStockCount = stockItems.filter((item) => item.stock <= item.minStock).length;
  const stockCategories = useMemo(
    () => ['ทั้งหมด', ...Array.from(new Set(stockItems.map((item) => item.category))).sort()],
    [stockItems],
  );
  const filteredStockItems = selectedStockCategory === 'ทั้งหมด'
    ? stockItems
    : stockItems.filter((item) => item.category === selectedStockCategory);
  const filteredStockLog = stockLog.filter((log) => !stockLogDateFilter || log.date === stockLogDateFilter);
  const selectedCorrectionProductId = stockItems.some((item) => String(item.id) === correctionProductId)
    ? correctionProductId
    : String(stockItems[0]?.id ?? '');
  const todayKey = currentDateInput();
  const todaySales = salesHistory.filter((sale) => dateInputValue(sale.createdAt) === todayKey);
  const dailySalesTotal = todaySales.reduce((sum, sale) => sum + sale.total, 0);
  const channelTotals = todaySales.reduce<Record<SaleChannel, number>>((totals, sale) => ({
    ...totals,
    [sale.channel]: totals[sale.channel] + sale.total,
  }), { POS: 0, GAS: 0, LOTTERY: 0 });
  const possibleLotteryRevenue = lotteryTickets.reduce((sum, ticket) => sum + ticket.remaining * ticket.price, 0);
  const categorySales = useMemo(() => {
    const totals = new Map<string, number>();

    todaySales.forEach((sale) => {
      sale.items.forEach((item) => {
        const matchedProduct = stockItems.find((product) =>
          product.barcode === item.barcode || product.name === item.name,
        );
        const category = sale.channel === 'POS'
          ? matchedProduct?.category ?? 'สินค้าอื่น'
          : saleChannelMeta[sale.channel].label;
        const lineTotal = Math.max(0, item.price * item.quantity - item.discount);
        totals.set(category, (totals.get(category) ?? 0) + lineTotal);
      });
    });

    const maxValue = Math.max(1, ...totals.values());
    return Array.from(totals.entries())
      .map(([label, value]) => ({ label, value, percent: Math.round((value / maxValue) * 100) }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 6);
  }, [stockItems, todaySales]);
  const staffPerformance = useMemo(() => {
    const totals = new Map<string, { total: number; count: number }>();

    todaySales.forEach((sale) => {
      const current = totals.get(sale.staffName) ?? { total: 0, count: 0 };
      totals.set(sale.staffName, {
        total: current.total + sale.total,
        count: current.count + 1,
      });
    });

    return Array.from(totals.entries())
      .map(([name, summary]) => ({ name, ...summary }))
      .sort((a, b) => b.total - a.total);
  }, [todaySales]);
  const filteredSalesHistory = useMemo(
    () => historyFilter === 'ALL'
      ? salesHistory
      : salesHistory.filter((sale) => sale.channel === historyFilter),
    [historyFilter, salesHistory],
  );
  const selectedSale = filteredSalesHistory.find((sale) => sale.id === selectedSaleId) ?? filteredSalesHistory[0] ?? null;
  const salesHistoryTotal = filteredSalesHistory.reduce((sum, sale) => sum + sale.total, 0);
  const salesHistoryItemCount = filteredSalesHistory.reduce(
    (sum, sale) => sum + sale.items.reduce((itemSum, item) => itemSum + item.quantity, 0),
    0,
  );

  function addProductToPos(product: Product) {
    const currentProduct = stockItems.find((item) => item.id === product.id) ?? product;
    const inCartQuantity = posCart.find((item) => item.id === String(product.id))?.quantity ?? 0;
    if (currentProduct.stock <= inCartQuantity) {
      setPosNotice(`${product.name} คงเหลือไม่พอ`);
      return;
    }

    setPosCart((previous) => {
      const existing = previous.find((item) => item.id === String(product.id));
      if (existing) {
        return previous.map((item) =>
          item.id === String(product.id) ? { ...item, quantity: item.quantity + 1 } : item,
        );
      }

      return [
        ...previous,
        {
          id: String(product.id),
          name: product.name,
          barcode: product.barcode,
          price: product.price,
          quantity: 1,
          discount: 0,
          item_type: 'PRODUCT',
        },
      ];
    });
  }

  function scanProduct() {
    const query = barcodeInput.trim().toLowerCase();
    if (!query) {
      setPosNotice('กรอกหรือแสกนบาร์โค้ดก่อน');
      return;
    }

    const product = stockItems.find(
      (item) => item.barcode.toLowerCase() === query || item.name.toLowerCase().includes(query),
    );

    if (!product) {
      const pendingBarcode = barcodeInput.trim();
      setUnknownBarcode(pendingBarcode);
      setNewProductDraft({
        barcode: pendingBarcode,
        name: '',
        price: '',
        stock: '1',
        category: 'ทั่วไป',
        minStock: '5',
        unit: 'ชิ้น',
      });
      setPosNotice(`ไม่พบสินค้า ${pendingBarcode}`);
      return;
    }

    addProductToPos(product);
    setBarcodeInput('');
    setUnknownBarcode('');
    if (product.stock > 0) {
      setPosNotice(`เพิ่ม ${product.name} แล้ว`);
    }
  }

  function cancelUnknownProduct() {
    setUnknownBarcode('');
    setBarcodeInput('');
    setPosNotice('ยกเลิกการลงทะเบียนสินค้าใหม่');
  }

  function registerNewProductFromScan() {
    const name = newProductDraft.name.trim();
    const barcode = newProductDraft.barcode.trim();
    const price = Number(newProductDraft.price);
    const stock = Number(newProductDraft.stock);
    const minStock = Number(newProductDraft.minStock);

    if (!barcode || !name || !Number.isFinite(price) || price <= 0 || !Number.isFinite(stock) || stock <= 0) {
      setPosNotice('กรอกบาร์โค้ด ชื่อสินค้า ราคาขาย และจำนวนเริ่มต้นให้ครบ');
      return;
    }

    if (stockItems.some((item) => item.barcode === barcode)) {
      setPosNotice(`บาร์โค้ด ${barcode} มีอยู่ใน Stock แล้ว`);
      return;
    }

    const product: Product = {
      id: Math.max(0, ...stockItems.map((item) => item.id)) + 1,
      barcode,
      name,
      price,
      stock: Number.isFinite(stock) ? Math.max(0, stock) : 0,
      category: newProductDraft.category.trim() || 'ทั่วไป',
      minStock: Number.isFinite(minStock) ? Math.max(0, minStock) : 5,
      unit: newProductDraft.unit.trim() || 'ชิ้น',
    };

    setStockItems((previous) => [...previous, product]);
    setCorrectionProductId(String(product.id));
    addProductToPos(product);
    setBarcodeInput('');
    setUnknownBarcode('');
    setPosNotice(`ลงทะเบียนและเพิ่ม ${product.name} เข้า bill แล้ว`);
  }

  function lookupMember() {
    const normalizedPhone = memberPhone.replace(/\D/g, '');
    const member = sampleMembers.find((item) => item.phone === normalizedPhone);
    setCurrentMember(member ?? null);
    setPosNotice(member ? `พบสมาชิก ${member.name}` : 'ไม่พบสมาชิก เบอร์นี้ขายแบบลูกค้าทั่วไปได้');
  }

  function updateCartQuantity(id: string, delta: number) {
    if (delta > 0) {
      const cartItem = posCart.find((item) => item.id === id);
      const stockItem = stockItems.find((item) => String(item.id) === id);
      if (cartItem?.item_type === 'PRODUCT' && stockItem && cartItem.quantity >= stockItem.stock) {
        setPosNotice(`${cartItem.name} คงเหลือ ${stockItem.stock} ${stockItem.unit}`);
        return;
      }
    }

    setPosCart((previous) =>
      previous
        .map((item) => item.id === id ? { ...item, quantity: Math.max(1, item.quantity + delta) } : item)
        .filter((item) => item.quantity > 0),
    );
  }

  function updateCartDiscount(id: string, discount: number) {
    setPosCart((previous) =>
      previous.map((item) => item.id === id ? { ...item, discount: Math.max(0, discount) } : item),
    );
  }

  function removeFromPosCart(id: string) {
    setPosCart((previous) => previous.filter((item) => item.id !== id));
  }

  async function completePosSale() {
    const cashier = staffMembers.find((staff) => staff.id === cashierId);
    if (posCart.length === 0) {
      setPosNotice('ยังไม่มีสินค้าในบิล');
      return;
    }

    if (posPayment === 'เงินสด' && cashReceived < posTotal) {
      setPosNotice(`รับเงินยังไม่พอ ขาด ${formatMoney(posTotal - cashReceived)}`);
      return;
    }

    const insufficientItem = posCart.find((cartItem) => {
      const stockItem = stockItems.find((item) => String(item.id) === cartItem.id);
      return !stockItem || cartItem.quantity > stockItem.stock;
    });
    if (insufficientItem) {
      setPosNotice(`${insufficientItem.name} คงเหลือไม่พอ กรุณาแก้จำนวนก่อนทำรายการ`);
      return;
    }

    const createdAt = new Date();
    const receipt: ReceiptSnapshot = {
      id: createReceiptId(createdAt),
      createdAt,
      cashierName: cashier?.name ?? 'ไม่ระบุพนักงาน',
      customerName: currentMember?.name ?? 'ลูกค้าทั่วไป',
      paymentMethod: posPayment,
      items: posCart.map((item) => ({ ...item })),
      subtotal: posSubtotal,
      billDiscount,
      total: posTotal,
      cashReceived: posPayment === 'เงินสด' ? cashReceived : posTotal,
      change: posChange,
    };

    setIsPrintingReceipt(true);
    setPosNotice('กำลังสร้างไฟล์ PDF ใบเสร็จ');

    try {
      await downloadReceiptPdf(receipt);
      const saleRecord: SaleRecord = {
        id: receipt.id,
        channel: 'POS',
        createdAt: receipt.createdAt,
        customerName: receipt.customerName,
        staffName: receipt.cashierName,
        paymentMethod: receipt.paymentMethod,
        status: 'สำเร็จ',
        items: receipt.items.map((item) => ({
          name: item.name,
          barcode: item.barcode,
          quantity: item.quantity,
          price: item.price,
          discount: item.discount,
        })),
        subtotal: receipt.subtotal,
        discount: receipt.billDiscount,
        total: receipt.total,
        cashReceived: receipt.cashReceived,
        change: receipt.change,
        note: currentMember?.phone ? `สมาชิก ${currentMember.phone}` : 'ขายหน้าร้าน',
      };
      setSalesHistory((previous) => [saleRecord, ...previous]);
      setSelectedSaleId(saleRecord.id);
      setStockItems((previous) =>
        previous.map((product) => {
          const soldItem = receipt.items.find((item) => item.id === String(product.id));
          return soldItem ? { ...product, stock: Math.max(0, product.stock - soldItem.quantity) } : product;
        }),
      );
      setPosNotice(`สร้างใบเสร็จ ${receipt.id}.pdf สำเร็จ โดย ${receipt.cashierName}`);
      setPosCart([]);
      setBillDiscount(0);
      setCashReceived(0);
    } catch (error) {
      console.error(error);
      setPosNotice('สร้าง PDF ไม่สำเร็จ กรุณาลองอีกครั้ง');
    } finally {
      setIsPrintingReceipt(false);
    }
  }

  function updateGasQuantity(id: string, delta: number) {
    const gasItem = gasItems.find((item) => item.id === id);
    if (!gasItem) {
      return;
    }

    setGasQuantities((previous) => ({
      ...previous,
      [id]: Math.max(0, Math.min(gasItem.stock, (previous[id] ?? 0) + delta)),
    }));

    if (delta > 0 && (gasQuantities[id] ?? 0) >= gasItem.stock) {
      setGasNotice(`${gasItem.name} คงเหลือ ${gasItem.stock} ถัง`);
    }
  }

  function createGasJob() {
    if (gasOrderItems.length === 0) {
      setGasNotice('เลือกถังแก๊สอย่างน้อย 1 รายการ');
      return;
    }

    if (!gasCustomer.name.trim() || !gasCustomer.phone.trim() || !gasCustomer.address.trim()) {
      setGasNotice('กรอกชื่อ เบอร์โทร และที่อยู่สำหรับส่งแก๊ส');
      return;
    }

    const insufficientGasItem = gasOrderItems.find((orderItem) => orderItem.quantity > orderItem.stock);
    if (insufficientGasItem) {
      setGasNotice(`${insufficientGasItem.name} คงเหลือไม่พอ`);
      return;
    }

    const driver = staffMembers.find((staff) => staff.id === gasDriverId);
    const createdAtDate = new Date();
    const createdAt = currentTimeLabel();
    const jobId = `GAS-${gasJobSequence}`;
    const newJob: GasJob = {
      id: jobId,
      customerName: gasCustomer.name.trim(),
      phone: gasCustomer.phone.trim(),
      address: gasCustomer.address.trim(),
      driver: driver?.name ?? 'ยังไม่ระบุ',
      items: gasOrderItems.map((item) => ({ name: `${item.name} ${item.operation}`, quantity: item.quantity, price: item.price })),
      total: gasTotal,
      status: 'กำลังดำเนินการ',
      createdAt,
    };
    const saleRecord: SaleRecord = {
      id: jobId,
      channel: 'GAS',
      createdAt: createdAtDate,
      customerName: newJob.customerName,
      staffName: newJob.driver,
      paymentMethod: 'เงินสด',
      status: 'กำลังดำเนินการ',
      items: newJob.items.map((item) => ({
        name: item.name,
        quantity: item.quantity,
        price: item.price,
        discount: 0,
      })),
      subtotal: newJob.total,
      discount: 0,
      total: newJob.total,
      cashReceived: newJob.total,
      change: 0,
      note: `${newJob.phone} | ${newJob.address}`,
    };

    setGasJobs((previous) => [newJob, ...previous]);
    setSalesHistory((previous) => [saleRecord, ...previous]);
    setSelectedSaleId(saleRecord.id);
    setGasItems((previous) =>
      previous.map((item) => {
        const orderedItem = gasOrderItems.find((orderItem) => orderItem.id === item.id);
        return orderedItem ? { ...item, stock: Math.max(0, item.stock - orderedItem.quantity) } : item;
      }),
    );
    setPendingGasReturns((previous) => [
      ...gasOrderItems
        .filter((item) => item.operation === 'ซื้อ/ยืมถัง')
        .map((item, index) => ({
          id: `${jobId}-TANK-${index + 1}`,
          customerName: newJob.customerName,
          phone: newJob.phone,
          tankName: item.name,
          borrowedAt: createdAt,
          quantity: item.quantity,
        })),
      ...previous,
    ]);
    setGasJobSequence((previous) => previous + 1);
    setGasQuantities({});
    setGasCustomer({ name: '', phone: '', address: '' });
    setGasNotice(`สร้างงาน ${newJob.id} แล้ว`);
  }

  function completeGasJob(id: string) {
    setGasJobs((previous) =>
      previous.map((job) => job.id === id ? { ...job, status: 'เสร็จแล้ว' } : job),
    );
    setSalesHistory((previous) =>
      previous.map((sale) => sale.id === id ? { ...sale, status: 'เสร็จแล้ว' } : sale),
    );
  }

  function completeGasReturn(id: string) {
    const returnItem = pendingGasReturns.find((item) => item.id === id);
    setPendingGasReturns((previous) => previous.filter((item) => item.id !== id));
    if (returnItem) {
      setGasNotice(`รับคืนถัง ${returnItem.tankName} จาก ${returnItem.customerName} แล้ว`);
    }
  }

  function lotteryAvailable(ticket: LotteryTicket) {
    const inCart = lotteryCart.find((item) => item.id === ticket.number)?.quantity ?? 0;
    return ticket.remaining - inCart;
  }

  function addLotteryTicket(ticket: LotteryTicket) {
    if (lotteryAvailable(ticket) <= 0) {
      setLotteryNotice(`เลข ${ticket.number} หมดแล้ว`);
      return;
    }

    setLotteryCart((previous) => {
      const existing = previous.find((item) => item.id === ticket.number);
      if (existing) {
        return previous.map((item) =>
          item.id === ticket.number ? { ...item, quantity: item.quantity + 1 } : item,
        );
      }

      return [
        ...previous,
        {
          id: ticket.number,
          name: `หวยเลข ${ticket.number}`,
          barcode: ticket.series,
          price: ticket.price,
          quantity: 1,
          discount: 0,
          item_type: 'LOTTERY',
        },
      ];
    });
    setLotteryNotice(`เพิ่มเลข ${ticket.number} แล้ว`);
  }

  function searchLottery() {
    const number = lotteryInput.trim();
    const ticket = lotteryTickets.find((item) => item.number === number);
    if (!ticket) {
      setLotteryNotice(`ไม่พบเลข ${number || '-'}`);
      return;
    }
    addLotteryTicket(ticket);
    setLotteryInput('');
  }

  function removeLottery(id: string) {
    setLotteryCart((previous) => previous.filter((item) => item.id !== id));
  }

  function updateLotteryQuantity(id: string, delta: number) {
    const ticket = lotteryTickets.find((item) => item.number === id);
    if (!ticket) {
      return;
    }

    setLotteryCart((previous) =>
      previous.map((item) => {
        if (item.id !== id) {
          return item;
        }

        const nextQuantity = Math.max(1, Math.min(ticket.remaining, item.quantity + delta));
        return { ...item, quantity: nextQuantity };
      }),
    );
  }

  function completeLotterySale() {
    if (lotteryCart.length === 0) {
      setLotteryNotice('ยังไม่มีเลขในรายการขาย');
      return;
    }

    if (lotteryPayment === 'เงินสด' && lotteryReceived < lotterySubtotal) {
      setLotteryNotice(`รับเงินยังไม่พอ ขาด ${formatMoney(lotterySubtotal - lotteryReceived)}`);
      return;
    }

    const insufficientTicket = lotteryCart.find((cartItem) => {
      const ticket = lotteryTickets.find((item) => item.number === cartItem.id);
      return !ticket || cartItem.quantity > ticket.remaining;
    });
    if (insufficientTicket) {
      setLotteryNotice(`${insufficientTicket.name} คงเหลือไม่พอ`);
      return;
    }

    const createdAt = new Date();
    const cashier = staffMembers.find((staff) => staff.id === cashierId);
    const saleRecord: SaleRecord = {
      id: createSaleId('LOTTERY', createdAt),
      channel: 'LOTTERY',
      createdAt,
      customerName: 'ลูกค้าทั่วไป',
      staffName: cashier?.name ?? 'ไม่ระบุพนักงาน',
      paymentMethod: lotteryPayment,
      status: 'สำเร็จ',
      items: lotteryCart.map((item) => ({
        name: item.name,
        barcode: item.barcode,
        quantity: item.quantity,
        price: item.price,
        discount: item.discount,
      })),
      subtotal: lotterySubtotal,
      discount: 0,
      total: lotterySubtotal,
      cashReceived: lotteryPayment === 'เงินสด' ? lotteryReceived : lotterySubtotal,
      change: lotteryChange,
      note: 'ขายหวยหน้าร้าน',
    };

    setSalesHistory((previous) => [saleRecord, ...previous]);
    setSelectedSaleId(saleRecord.id);
    setLotteryTickets((previous) =>
      previous.map((ticket) => {
        const soldItem = lotteryCart.find((item) => item.id === ticket.number);
        return soldItem ? { ...ticket, remaining: Math.max(0, ticket.remaining - soldItem.quantity) } : ticket;
      }),
    );
    setLotteryNotice(`ขายหวยสำเร็จ ${formatMoney(lotterySubtotal)}`);
    setLotteryCart([]);
    setLotteryReceived(0);
  }

  function applyStockCorrection() {
    const product = stockItems.find((item) => String(item.id) === selectedCorrectionProductId);
    const delta = Number(correctionDelta);
    if (!product || !Number.isFinite(delta) || delta === 0) {
      return;
    }

    if (!correctionReason.trim()) {
      setCorrectionReason('กรุณาระบุเหตุผล');
      return;
    }

    setStockItems((previous) =>
      previous.map((item) =>
        item.id === product.id ? { ...item, stock: Math.max(0, item.stock + delta) } : item,
      ),
    );

    setStockLog((previous) => [
      {
        id: `LOG-${String(stockLogSequence).padStart(3, '0')}`,
        productName: product.name,
        delta,
        reason: correctionReason.trim(),
        staffName: staffMembers.find((staff) => staff.id === cashierId)?.name ?? 'ไม่ระบุ',
        createdAt: currentTimeLabel(),
        date: currentDateInput(),
      },
      ...previous,
    ]);
    setStockLogSequence((previous) => previous + 1);
    setCorrectionDelta('1');
    setCorrectionReason('');
  }

  function addStaff() {
    if (!staffForm.name.trim() || !staffForm.phone.trim()) {
      return;
    }

    setStaffMembers((previous) => [
      ...previous,
      {
        id: `S-${String(previous.length + 1).padStart(3, '0')}`,
        name: staffForm.name.trim(),
        phone: staffForm.phone.trim(),
        role: staffForm.role,
        active: true,
      },
    ]);
    setStaffForm({ name: '', phone: '', role: 'ขายหน้าร้าน' });
  }

  function toggleStaffStatus(id: string) {
    setStaffMembers((previous) =>
      previous.map((staff) => staff.id === id ? { ...staff, active: !staff.active } : staff),
    );
  }

  async function downloadSaleRecordPdf(sale: SaleRecord) {
    setIsPrintingReceipt(true);
    setHistoryNotice(`กำลังสร้าง PDF ${sale.id}`);

    try {
      await downloadReceiptPdf(saleRecordToReceipt(sale));
      setHistoryNotice(`ดาวน์โหลดใบเสร็จ ${sale.id}.pdf แล้ว`);
    } catch (error) {
      console.error(error);
      setHistoryNotice('สร้าง PDF จากประวัติไม่สำเร็จ');
    } finally {
      setIsPrintingReceipt(false);
    }
  }

  function renderPosPage() {
    return (
      <div className="pos-layout">
        <section className="panel pos-workspace">
          <PanelTitle icon="barcode_scanner" title="ขายสินค้า" detail={posNotice} />

          <div className="input-grid">
            <label className="field">
              <span>แสกนสินค้า</span>
              <div className="input-with-button">
                <input
                  value={barcodeInput}
                  onChange={(event) => setBarcodeInput(event.target.value)}
                  onKeyDown={(event) => event.key === 'Enter' && scanProduct()}
                  placeholder="ยิงบาร์โค้ดหรือพิมพ์ชื่อสินค้า"
                  autoFocus
                />
                <button type="button" onClick={scanProduct}><Icon name="add_shopping_cart" /> เพิ่ม</button>
              </div>
            </label>

            <label className="field">
              <span>Member ผ่านเบอร์มือถือ</span>
              <div className="input-with-button">
                <input
                  value={memberPhone}
                  onChange={(event) => setMemberPhone(event.target.value)}
                  placeholder="0812345678"
                />
                <button type="button" onClick={lookupMember}><Icon name="person_search" /> ค้นหา</button>
              </div>
            </label>
          </div>

          <div className="context-row">
            <div className="mini-card">
              <span className="label">ลูกค้า</span>
              <strong>{currentMember?.name ?? 'ลูกค้าทั่วไป'}</strong>
              <small>{currentMember?.note ?? 'ยังไม่ผูกเบอร์สมาชิก'}</small>
            </div>
            <label className="field compact">
              <span>พนักงานรับขาย</span>
              <select value={cashierId} onChange={(event) => setCashierId(event.target.value)}>
                {activeStaff.map((staff) => <option key={staff.id} value={staff.id}>{staff.name} - {staff.role}</option>)}
              </select>
            </label>
          </div>

          {unknownBarcode && (
            <div className="unknown-product-panel">
              <div>
                <span className="badge warning">ไม่พบสินค้า</span>
                <h4>บาร์โค้ด {unknownBarcode}</h4>
                <p>ยกเลิกการแสกนนี้ หรือเพิ่มสินค้าใหม่เข้า Stock แล้วขายต่อทันที</p>
              </div>

              <div className="new-product-grid">
                <label className="field">
                  <span>ชื่อสินค้า</span>
                  <input
                    value={newProductDraft.name}
                    onChange={(event) => setNewProductDraft({ ...newProductDraft, name: event.target.value })}
                    placeholder="เช่น น้ำดื่ม 1.5L"
                  />
                </label>
                <label className="field">
                  <span>ราคาขาย</span>
                  <input
                    type="number"
                    min="0"
                    value={newProductDraft.price}
                    onChange={(event) => setNewProductDraft({ ...newProductDraft, price: event.target.value })}
                    placeholder="0"
                  />
                </label>
                <label className="field">
                  <span>จำนวนเริ่มต้น</span>
                  <input
                    type="number"
                    min="0"
                    value={newProductDraft.stock}
                    onChange={(event) => setNewProductDraft({ ...newProductDraft, stock: event.target.value })}
                  />
                </label>
                <label className="field">
                  <span>หมวดหมู่</span>
                  <input
                    value={newProductDraft.category}
                    onChange={(event) => setNewProductDraft({ ...newProductDraft, category: event.target.value })}
                  />
                </label>
                <label className="field">
                  <span>ขั้นต่ำ</span>
                  <input
                    type="number"
                    min="0"
                    value={newProductDraft.minStock}
                    onChange={(event) => setNewProductDraft({ ...newProductDraft, minStock: event.target.value })}
                  />
                </label>
                <label className="field">
                  <span>หน่วย</span>
                  <input
                    value={newProductDraft.unit}
                    onChange={(event) => setNewProductDraft({ ...newProductDraft, unit: event.target.value })}
                  />
                </label>
              </div>

              <div className="unknown-product-actions">
                <button className="secondary-action" type="button" onClick={cancelUnknownProduct}>ยกเลิก</button>
                <button className="primary-action" type="button" onClick={registerNewProductFromScan}>
                  <Icon name="inventory" /> ลงทะเบียนสินค้าใหม่
                </button>
              </div>
            </div>
          )}

          <div className="table-wrap cart-table-wrap">
            {posCart.length === 0 ? (
              <EmptyState text="ยังไม่มีสินค้าในบิล" />
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>สินค้า</th>
                    <th>จำนวน</th>
                    <th>ราคา</th>
                    <th>ส่วนลด</th>
                    <th>รวม</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {posCart.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <strong>{item.name}</strong>
                        <small>{item.barcode}</small>
                      </td>
                      <td>
                        <div className="stepper">
                          <button type="button" onClick={() => updateCartQuantity(item.id, -1)}><Icon name="remove" /></button>
                          <span>{item.quantity}</span>
                          <button type="button" onClick={() => updateCartQuantity(item.id, 1)}><Icon name="add" /></button>
                        </div>
                      </td>
                      <td>{formatMoney(item.price)}</td>
                      <td>
                        <input
                          className="cell-input"
                          type="number"
                          min="0"
                          value={item.discount || ''}
                          onChange={(event) => updateCartDiscount(item.id, Number(event.target.value))}
                        />
                      </td>
                      <td><strong>{formatMoney(item.price * item.quantity - item.discount)}</strong></td>
                      <td>
                        <button className="icon-button danger" type="button" onClick={() => removeFromPosCart(item.id)}>
                          <Icon name="delete" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>

        <aside className="panel summary-panel">
          <PanelTitle icon="receipt_long" title="สรุปชำระเงิน" />
          <div className="summary-rows">
            <div><span>ยอดสินค้า</span><strong>{formatMoney(posSubtotal)}</strong></div>
            <label>
              <span>ส่วนลดท้ายบิล</span>
              <input type="number" min="0" value={billDiscount || ''} onChange={(event) => setBillDiscount(Number(event.target.value))} />
            </label>
            <div className="total-row"><span>ต้องชำระ</span><strong>{formatMoney(posTotal)}</strong></div>
          </div>

          <div className="segmented">
            {paymentMethods.map((method) => (
              <button
                type="button"
                key={method}
                className={posPayment === method ? 'active' : ''}
                disabled={method === 'PromptPay'}
                onClick={() => method === 'เงินสด' && setPosPayment(method)}
              >
                {method}{method === 'PromptPay' ? ' (เร็วๆ นี้)' : ''}
              </button>
            ))}
          </div>

          <label className="field">
            <span>รับเงิน</span>
            <input type="number" min="0" value={cashReceived || ''} onChange={(event) => setCashReceived(Number(event.target.value))} />
          </label>

          <div className="cash-buttons">
            <button type="button" onClick={() => setCashReceived(posTotal)}>พอดี</button>
            <button type="button" onClick={() => setCashReceived(500)}>500</button>
            <button type="button" onClick={() => setCashReceived(1000)}>1000</button>
          </div>

          <div className="change-box">
            <span>เงินทอน</span>
            <strong>{formatMoney(posChange)}</strong>
          </div>

          <button
            className="primary-action"
            type="button"
            onClick={completePosSale}
            disabled={isPrintingReceipt}
          >
            <Icon name={isPrintingReceipt ? 'hourglass_top' : 'picture_as_pdf'} />
            {isPrintingReceipt ? 'กำลังสร้าง PDF...' : 'ทำรายการ / สร้างใบเสร็จ PDF'}
          </button>
          <button className="secondary-action" type="button" onClick={() => setPosCart([])}>
            <Icon name="backspace" /> ล้างบิล
          </button>
        </aside>
      </div>
    );
  }

  function renderGasPage() {
    return (
      <div className="gas-layout">
        <section className="panel">
          <PanelTitle icon="propane_tank" title="เลือกถังแก๊ส" detail={gasNotice} />
          <div className="gas-card-grid">
            {gasItems.map((item) => (
              <div className="gas-card" key={item.id}>
                <img src={item.imageUrl} alt={item.name} />
                <div>
                  <span className="badge accent">{item.operation}</span>
                  <h4>{item.name}</h4>
                  <p>{formatMoney(item.price)}</p>
                  <small>คงเหลือ {item.stock} ถัง</small>
                </div>
                <div className="stepper large">
                  <button type="button" onClick={() => updateGasQuantity(item.id, -1)}><Icon name="remove" /></button>
                  <span>{gasQuantities[item.id] ?? 0}</span>
                  <button type="button" onClick={() => updateGasQuantity(item.id, 1)}><Icon name="add" /></button>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="panel">
          <PanelTitle icon="local_shipping" title="ข้อมูลจัดส่ง" />
          <div className="form-stack">
            <label className="field">
              <span>ชื่อผู้สั่ง</span>
              <input value={gasCustomer.name} onChange={(event) => setGasCustomer({ ...gasCustomer, name: event.target.value })} placeholder="ชื่อคนสั่งแก๊ส" />
            </label>
            <label className="field">
              <span>เบอร์โทร</span>
              <input value={gasCustomer.phone} onChange={(event) => setGasCustomer({ ...gasCustomer, phone: event.target.value })} placeholder="08X-XXX-XXXX" />
            </label>
            <label className="field">
              <span>ที่อยู่จัดส่ง</span>
              <textarea value={gasCustomer.address} onChange={(event) => setGasCustomer({ ...gasCustomer, address: event.target.value })} placeholder="บ้านเลขที่ จุดสังเกต ซอย" />
            </label>
            <label className="field">
              <span>พนักงานส่ง</span>
              <select value={gasDriverId} onChange={(event) => setGasDriverId(event.target.value)}>
                {(deliveryStaff.length > 0 ? deliveryStaff : activeStaff).map((staff) => (
                  <option key={staff.id} value={staff.id}>{staff.name} - {staff.role}</option>
                ))}
              </select>
            </label>
          </div>
        </section>

        <aside className="panel summary-panel">
          <PanelTitle icon="assignment" title="สรุปรายการแก๊ส" />
          <div className="order-list">
            {gasOrderItems.length === 0 ? (
              <EmptyState text="ยังไม่ได้เลือกถัง" />
            ) : gasOrderItems.map((item) => (
              <div key={item.id}>
                <span>{item.name} {item.operation} x {item.quantity}</span>
                <strong>{formatMoney(item.price * item.quantity)}</strong>
              </div>
            ))}
          </div>
          <div className="total-row compact-total">
            <span>รวมเงินแก๊ส</span>
            <strong>{formatMoney(gasTotal)}</strong>
          </div>
          <button className="primary-action" type="button" onClick={createGasJob}>
            <Icon name="task_alt" /> ทำรายการแก๊ส
          </button>
        </aside>

        <section className="panel wide-panel">
          <PanelTitle icon="route" title="รายการที่ดำเนินอยู่" detail={`${activeGasJobs.length} งาน`} />
          <div className="job-grid">
            {activeGasJobs.length === 0 ? (
              <EmptyState text="ไม่มีงานค้างส่ง" />
            ) : activeGasJobs.map((job) => (
              <div className="job-card" key={job.id}>
                <div>
                  <strong>{job.id} - {job.customerName}</strong>
                  <p>{job.address}</p>
                  <small>{job.createdAt} | คนส่ง {job.driver} | {formatMoney(job.total)}</small>
                </div>
                <button type="button" onClick={() => completeGasJob(job.id)}>ปิดงาน</button>
              </div>
            ))}
          </div>
        </section>

        <section className="panel wide-panel">
          <PanelTitle icon="assignment_return" title="รายการค้างถัง" detail={`${pendingGasReturns.length} รายการรอคืนถัง`} />
          <div className="job-grid">
            {pendingGasReturns.length === 0 ? (
              <EmptyState text="ไม่มีรายการค้างถัง" />
            ) : pendingGasReturns.map((item) => (
              <div className="job-card" key={item.id}>
                <div>
                  <strong>{item.customerName} - {item.tankName} x {item.quantity}</strong>
                  <p>{item.phone}</p>
                  <small>ยืมเมื่อ {item.borrowedAt}</small>
                </div>
                <button type="button" onClick={() => completeGasReturn(item.id)}>รับคืนถัง</button>
              </div>
            ))}
          </div>
        </section>

        <section className="panel wide-panel">
          <PanelTitle icon="today" title="รายการทั้งหมดวันนี้" detail={`${gasJobs.length} รายการ`} />
          <div className="history-list">
            {gasJobs.map((job) => (
              <div key={job.id}>
                <span className={`status-dot ${job.status === 'เสร็จแล้ว' ? 'done' : 'active'}`}></span>
                <strong>{job.createdAt}</strong>
                <span>{job.customerName}</span>
                <span>{job.items.map((item) => `${item.name} x${item.quantity}`).join(', ')}</span>
                <b>{formatMoney(job.total)}</b>
              </div>
            ))}
          </div>
        </section>
      </div>
    );
  }

  function renderLotteryPage() {
    const matchingTicket = lotteryTickets.find((ticket) => ticket.number === lotteryInput.trim());

    return (
      <div className="two-column-page">
        <section className="panel">
          <PanelTitle icon="confirmation_number" title="ขายหวย" detail={lotteryNotice} />
          <div className="input-with-button large-input">
            <input
              value={lotteryInput}
              maxLength={6}
              onChange={(event) => setLotteryInput(event.target.value.replace(/\D/g, '').slice(0, 6))}
              onKeyDown={(event) => event.key === 'Enter' && searchLottery()}
              placeholder="ใส่เลข 6 หลัก"
            />
            <button type="button" onClick={searchLottery}><Icon name="search" /> เช็คสต็อก</button>
          </div>

          {matchingTicket && (
            <div className="stock-result">
              <span>พบเลข {matchingTicket.number} {matchingTicket.series}</span>
              <strong>เหลือ {lotteryAvailable(matchingTicket)} ใบ</strong>
              <button type="button" onClick={() => addLotteryTicket(matchingTicket)}>เพิ่มลงรายการ</button>
            </div>
          )}

          <div className="lottery-grid">
            {lotteryTickets.map((ticket) => (
              <button
                type="button"
                key={`${ticket.number}-${ticket.series}`}
                disabled={lotteryAvailable(ticket) <= 0}
                onClick={() => addLotteryTicket(ticket)}
              >
                <strong>{ticket.number}</strong>
                <span>{ticket.series}</span>
                <small>เหลือ {lotteryAvailable(ticket)}</small>
              </button>
            ))}
          </div>
        </section>

        <aside className="panel summary-panel">
          <PanelTitle icon="shopping_cart" title="รายการหวย" />
          <div className="order-list">
            {lotteryCart.length === 0 ? (
              <EmptyState text="ยังไม่มีเลขในรายการ" />
            ) : lotteryCart.map((item) => (
              <div className="lottery-cart-row" key={item.id}>
                <span>{item.name}</span>
                <div className="stepper">
                  <button type="button" onClick={() => updateLotteryQuantity(item.id, -1)}><Icon name="remove" /></button>
                  <span>{item.quantity}</span>
                  <button type="button" onClick={() => updateLotteryQuantity(item.id, 1)}><Icon name="add" /></button>
                </div>
                <strong>{formatMoney(item.price * item.quantity)}</strong>
                <button className="link-button" type="button" onClick={() => removeLottery(item.id)}>ลบ</button>
              </div>
            ))}
          </div>
          <div className="total-row compact-total">
            <span>รวม</span>
            <strong>{formatMoney(lotterySubtotal)}</strong>
          </div>
          <div className="segmented">
            {paymentMethods.map((method) => (
              <button
                type="button"
                key={method}
                className={lotteryPayment === method ? 'active' : ''}
                onClick={() => setLotteryPayment(method)}
              >
                {method}
              </button>
            ))}
          </div>
          <label className="field">
            <span>รับเงิน</span>
            <input type="number" min="0" value={lotteryReceived || ''} onChange={(event) => setLotteryReceived(Number(event.target.value))} />
          </label>
          <div className="change-box">
            <span>เงินทอน</span>
            <strong>{formatMoney(lotteryChange)}</strong>
          </div>
          <button className="primary-action" type="button" onClick={completeLotterySale}>
            <Icon name="paid" /> ทำรายการหวย
          </button>
        </aside>
      </div>
    );
  }

  function renderHistoryPage() {
    const filterOptions: Array<{ value: SaleChannel | 'ALL'; label: string; icon: string }> = [
      { value: 'ALL', label: 'ทั้งหมด', icon: 'receipt_long' },
      { value: 'POS', label: 'POS', icon: saleChannelMeta.POS.icon },
      { value: 'GAS', label: 'แก๊ส', icon: saleChannelMeta.GAS.icon },
      { value: 'LOTTERY', label: 'หวย', icon: saleChannelMeta.LOTTERY.icon },
    ];

    return (
      <div className="history-page">
        <section className="panel history-list-panel">
          <PanelTitle
            icon="history"
            title="ประวัติการขาย"
            detail={`${filteredSalesHistory.length} รายการ | ${formatMoney(salesHistoryTotal)}`}
          />

          <div className="history-summary-grid">
            <div>
              <span>ยอดตามตัวกรอง</span>
              <strong>{formatMoney(salesHistoryTotal)}</strong>
            </div>
            <div>
              <span>จำนวนสินค้า/ถัง/ใบ</span>
              <strong>{salesHistoryItemCount}</strong>
            </div>
            <div>
              <span>รายการล่าสุด</span>
              <strong>{filteredSalesHistory[0]?.id ?? '-'}</strong>
            </div>
          </div>

          <div className="history-filters" aria-label="Sales history filters">
            {filterOptions.map((option) => (
              <button
                type="button"
                key={option.value}
                className={historyFilter === option.value ? 'active' : ''}
                onClick={() => {
                  setHistoryFilter(option.value);
                  setHistoryNotice('กดรายการเพื่อดูรายละเอียดทั้งหมด');
                }}
              >
                <Icon name={option.icon} />
                {option.label}
              </button>
            ))}
          </div>

          <div className="sales-list">
            {filteredSalesHistory.length === 0 ? (
              <EmptyState text="ยังไม่มีประวัติการขายในหมวดนี้" />
            ) : filteredSalesHistory.map((sale) => {
              const channel = saleChannelMeta[sale.channel];
              const itemCount = sale.items.reduce((sum, item) => sum + item.quantity, 0);

              return (
                <button
                  type="button"
                  key={sale.id}
                  className={`sale-row ${selectedSale?.id === sale.id ? 'selected' : ''}`}
                  onClick={() => {
                    setSelectedSaleId(sale.id);
                    setHistoryNotice(`กำลังดูรายละเอียด ${sale.id}`);
                  }}
                >
                  <span className={`sale-channel ${channel.className}`}>
                    <Icon name={channel.icon} />
                    {channel.label}
                  </span>
                  <div>
                    <strong>{sale.id}</strong>
                    <small>{formatReceiptDateTime(sale.createdAt)}</small>
                  </div>
                  <div>
                    <span>{sale.customerName}</span>
                    <small>{itemCount} รายการ | {sale.status}</small>
                  </div>
                  <b>{formatMoney(sale.total)}</b>
                </button>
              );
            })}
          </div>
        </section>

        <aside className="panel sale-detail-panel">
          {selectedSale ? (
            <>
              <PanelTitle icon="fact_check" title="รายละเอียดรายการขาย" detail={historyNotice} />

              <div className="sale-detail-head">
                <span className={`sale-channel ${saleChannelMeta[selectedSale.channel].className}`}>
                  <Icon name={saleChannelMeta[selectedSale.channel].icon} />
                  {saleChannelMeta[selectedSale.channel].label}
                </span>
                <div>
                  <strong>{selectedSale.id}</strong>
                  <small>{formatReceiptDateTime(selectedSale.createdAt)}</small>
                </div>
              </div>

              <div className="sale-detail-grid">
                <div><span>ลูกค้า</span><strong>{selectedSale.customerName}</strong></div>
                <div><span>ผู้รับผิดชอบ</span><strong>{selectedSale.staffName}</strong></div>
                <div><span>ชำระด้วย</span><strong>{selectedSale.paymentMethod}</strong></div>
                <div><span>สถานะ</span><strong>{selectedSale.status}</strong></div>
                <div className="wide"><span>หมายเหตุ</span><strong>{selectedSale.note ?? '-'}</strong></div>
              </div>

              <div className="table-wrap history-detail-table">
                <table>
                  <thead>
                    <tr>
                      <th>รายการ</th>
                      <th>จำนวน</th>
                      <th>ราคา</th>
                      <th>ส่วนลด</th>
                      <th>รวม</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedSale.items.map((item, index) => (
                      <tr key={`${selectedSale.id}-${index}`}>
                        <td>
                          <strong>{item.name}</strong>
                          {item.barcode && <small>{item.barcode}</small>}
                        </td>
                        <td>{item.quantity}</td>
                        <td>{formatMoney(item.price)}</td>
                        <td>{formatMoney(item.discount)}</td>
                        <td><strong>{formatMoney(item.price * item.quantity - item.discount)}</strong></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="sale-detail-totals">
                <div><span>ยอดก่อนส่วนลดท้ายบิล</span><strong>{formatMoney(selectedSale.subtotal)}</strong></div>
                <div><span>ส่วนลดท้ายบิล</span><strong>{formatMoney(selectedSale.discount)}</strong></div>
                <div className="grand"><span>ยอดสุทธิ</span><strong>{formatMoney(selectedSale.total)}</strong></div>
                <div><span>รับเงิน</span><strong>{formatMoney(selectedSale.cashReceived)}</strong></div>
                <div><span>เงินทอน</span><strong>{formatMoney(selectedSale.change)}</strong></div>
              </div>

              <button
                className="primary-action"
                type="button"
                onClick={() => downloadSaleRecordPdf(selectedSale)}
                disabled={isPrintingReceipt}
              >
                <Icon name={isPrintingReceipt ? 'hourglass_top' : 'picture_as_pdf'} />
                {isPrintingReceipt ? 'กำลังสร้าง PDF...' : 'ดาวน์โหลดใบเสร็จ PDF'}
              </button>
            </>
          ) : (
            <EmptyState text="ยังไม่มีประวัติการขาย" />
          )}
        </aside>
      </div>
    );
  }

  function renderAnalyticsPage() {
    const stockValue = stockItems.reduce((sum, item) => sum + item.stock * item.price, 0);
    const activeStaffCount = staffMembers.filter((staff) => staff.active).length;

    return (
      <div className="analytics-page">
        <div className="metric-grid">
          <div className="metric-card">
            <span>ยอดรวมวันนี้</span>
            <strong>{formatMoney(dailySalesTotal)}</strong>
            <small>POS {formatMoney(channelTotals.POS)} | Gas {formatMoney(channelTotals.GAS)} | Lottery {formatMoney(channelTotals.LOTTERY)}</small>
          </div>
          <div className="metric-card success">
            <span>งานแก๊สเสร็จแล้ว</span>
            <strong>{completedGasJobs.length}</strong>
            <small>ค้างส่ง {activeGasJobs.length} งาน</small>
          </div>
          <div className="metric-card warning">
            <span>สินค้าใกล้หมด</span>
            <strong>{lowStockCount}</strong>
            <small>ต้องเช็คในหน้า Stock</small>
          </div>
          <div className="metric-card blue">
            <span>พนักงานใช้งาน</span>
            <strong>{activeStaffCount}</strong>
            <small>จากทั้งหมด {staffMembers.length} คน</small>
          </div>
          <div className="metric-card">
            <span>หวยในสต็อก</span>
            <strong>{formatMoney(possibleLotteryRevenue)}</strong>
            <small>มูลค่าที่ขายได้จากเลขที่เหลือ</small>
          </div>
        </div>

        <section className="panel">
          <PanelTitle icon="bar_chart" title="หมวดขายดีวันนี้" />
          <div className="bar-list">
            {categorySales.length === 0 ? (
              <EmptyState text="ยังไม่มีรายการขายวันนี้" />
            ) : categorySales.map((item) => (
              <div key={item.label}>
                <span>{item.label}</span>
                <div><i style={{ width: `${item.percent}%` }}></i></div>
                <b>{formatMoney(item.value)}</b>
              </div>
            ))}
          </div>
        </section>

        <section className="panel">
          <PanelTitle icon="badge" title="ผลงานพนักงานวันนี้" />
          <div className="staff-performance-list">
            {staffPerformance.length === 0 ? (
              <EmptyState text="ยังไม่มีรายการขายของพนักงานวันนี้" />
            ) : staffPerformance.map((staff) => (
              <div key={staff.name}>
                <strong>{staff.name}</strong>
                <span>{staff.count} รายการ</span>
                <b>{formatMoney(staff.total)}</b>
              </div>
            ))}
          </div>
        </section>

        <section className="panel">
          <PanelTitle icon="inventory" title="ความเสี่ยงสต็อก" detail={`มูลค่าสต็อกประมาณ ${formatMoney(stockValue)}`} />
          <div className="risk-list">
            {stockItems
              .filter((item) => item.stock <= item.minStock)
              .map((item) => (
                <div key={item.id}>
                  <strong>{item.name}</strong>
                  <span>เหลือ {item.stock} {item.unit}</span>
                  <small>ขั้นต่ำ {item.minStock}</small>
                </div>
              ))}
            {lowStockCount === 0 && <EmptyState text="ยังไม่มีสินค้าใกล้หมด" />}
          </div>
        </section>
      </div>
    );
  }

  function renderStockPage() {
    return (
      <div className="stock-page">
        <section className="panel">
          <PanelTitle icon="category" title="หมวดหมู่สินค้า" detail="เลือกหมวดก่อนดูรายการสินค้า" />
          <div className="category-grid">
            {stockCategories.map((category) => {
              const categoryItems = category === 'ทั้งหมด'
                ? stockItems
                : stockItems.filter((item) => item.category === category);
              const categoryLowStock = categoryItems.filter((item) => item.stock <= item.minStock).length;

              return (
                <button
                  type="button"
                  key={category}
                  className={selectedStockCategory === category ? 'selected' : ''}
                  onClick={() => setSelectedStockCategory(category)}
                >
                  <strong>{category}</strong>
                  <span>{categoryItems.length} รายการ</span>
                  <small>{categoryLowStock > 0 ? `ใกล้หมด ${categoryLowStock}` : 'สต็อกปกติ'}</small>
                </button>
              );
            })}
          </div>

          <PanelTitle icon="inventory_2" title="รายการสินค้า" detail={`${filteredStockItems.length} รายการในหมวด ${selectedStockCategory}`} />
          <div className="table-wrap stock-table">
            <table>
              <thead>
                <tr>
                  <th>สินค้า</th>
                  <th>หมวด</th>
                  <th>คงเหลือ</th>
                  <th>ขั้นต่ำ</th>
                  <th>สถานะ</th>
                </tr>
              </thead>
              <tbody>
                {filteredStockItems.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <strong>{item.name}</strong>
                      <small>{item.barcode}</small>
                    </td>
                    <td>{item.category}</td>
                    <td>{item.stock} {item.unit}</td>
                    <td>{item.minStock}</td>
                    <td>
                      <span className={`badge ${item.stock <= item.minStock ? 'warning' : 'success'}`}>
                        {item.stock <= item.minStock ? 'ใกล้หมด' : 'ปกติ'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <aside className="panel">
          <PanelTitle icon="edit_note" title="ปรับสต็อก" detail="ใช้เมื่อของผิด นับผิด หรือของเสีย" />
          <div className="form-stack">
            <label className="field">
              <span>สินค้า</span>
              <select value={selectedCorrectionProductId} onChange={(event) => setCorrectionProductId(event.target.value)}>
                {stockItems.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </label>
            <label className="field">
              <span>เพิ่ม/ลดจำนวน</span>
              <input type="number" value={correctionDelta} onChange={(event) => setCorrectionDelta(event.target.value)} />
            </label>
            <label className="field">
              <span>เหตุผล</span>
              <textarea value={correctionReason} onChange={(event) => setCorrectionReason(event.target.value)} placeholder="เช่น นับสต็อกผิด / ของเสีย / รับของเพิ่ม" />
            </label>
            <button className="primary-action" type="button" onClick={applyStockCorrection}>
              <Icon name="save" /> บันทึกการปรับ
            </button>
          </div>
        </aside>

        <section className="panel wide-panel">
          <div className="stock-log-header">
            <PanelTitle icon="history" title="Log ปรับสต็อก" detail={`${filteredStockLog.length} รายการ`} />
            <label className="field">
              <span>กรองวันที่</span>
              <input
                type="date"
                value={stockLogDateFilter}
                onChange={(event) => setStockLogDateFilter(event.target.value)}
              />
            </label>
          </div>

          <div className="log-table">
            {filteredStockLog.length === 0 ? (
              <EmptyState text="ไม่มี log ในวันที่เลือก" />
            ) : filteredStockLog.map((log) => (
              <div key={log.id}>
                <strong>{log.productName}</strong>
                <span className={log.delta > 0 ? 'text-success' : 'text-danger'}>{log.delta > 0 ? '+' : ''}{log.delta}</span>
                <span>{log.reason}</span>
                <small>{log.staffName} | {log.createdAt}</small>
              </div>
            ))}
          </div>
        </section>
      </div>
    );
  }

  function renderStaffPage() {
    return (
      <div className="staff-page">
        <section className="panel">
          <PanelTitle icon="groups" title="พนักงานในร้าน" detail={`${activeStaff.length} คนกำลังใช้งาน`} />
          <div className="staff-grid">
            {staffMembers.map((staff) => (
              <div className="staff-card" key={staff.id}>
                <div>
                  <strong>{staff.name}</strong>
                  <span>{staff.role}</span>
                  <small>{staff.phone}</small>
                </div>
                <button
                  type="button"
                  className={staff.active ? 'status-button active' : 'status-button'}
                  onClick={() => toggleStaffStatus(staff.id)}
                >
                  {staff.active ? 'ใช้งาน' : 'พักงาน'}
                </button>
              </div>
            ))}
          </div>
        </section>

        <aside className="panel">
          <PanelTitle icon="person_add" title="เพิ่มพนักงาน" />
          <div className="form-stack">
            <label className="field">
              <span>ชื่อ</span>
              <input value={staffForm.name} onChange={(event) => setStaffForm({ ...staffForm, name: event.target.value })} placeholder="ชื่อพนักงาน" />
            </label>
            <label className="field">
              <span>เบอร์โทร</span>
              <input value={staffForm.phone} onChange={(event) => setStaffForm({ ...staffForm, phone: event.target.value })} placeholder="08X-XXX-XXXX" />
            </label>
            <label className="field">
              <span>หน้าที่</span>
              <select value={staffForm.role} onChange={(event) => setStaffForm({ ...staffForm, role: event.target.value })}>
                <option>ขายหน้าร้าน</option>
                <option>ส่งแก๊ส</option>
                <option>เจ้าของร้าน</option>
                <option>พนักงานพาร์ทไทม์</option>
              </select>
            </label>
            <button className="primary-action" type="button" onClick={addStaff}>
              <Icon name="add" /> เพิ่มพนักงาน
            </button>
          </div>
        </aside>
      </div>
    );
  }

  function renderPage() {
    switch (currentView) {
      case 'POS':
        return renderPosPage();
      case 'GAS':
        return renderGasPage();
      case 'LOTTERY':
        return renderLotteryPage();
      case 'HISTORY':
        return renderHistoryPage();
      case 'ANALYTICS':
        return renderAnalyticsPage();
      case 'STOCK':
        return renderStockPage();
      case 'STAFF':
        return renderStaffPage();
      default:
        return renderPosPage();
    }
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-block">
          <strong>Tingkum</strong>
          <span>Shop POS</span>
        </div>

        <nav className="nav-list" aria-label="Main navigation">
          {(Object.keys(viewMeta) as View[]).map((view) => (
            <button
              type="button"
              key={view}
              className={`nav-item ${currentView === view ? 'selected' : ''}`}
              onClick={() => setCurrentView(view)}
            >
              <Icon name={viewMeta[view].icon} />
              <span>{viewMeta[view].title}</span>
            </button>
          ))}
        </nav>

        <div className="sidebar-status">
          <span>Database</span>
          <strong>tingkum_db</strong>
          <small>{apiStatus}</small>
        </div>
      </aside>

      <div className="main-shell">
        <header className="topbar">
          <div>
            <h1>{viewMeta[currentView].title}</h1>
            <p>{viewMeta[currentView].subtitle}</p>
          </div>
          <div className="topbar-actions">
            <span>{todayLabel}</span>
            <button type="button"><Icon name="notifications" /></button>
            <button type="button"><Icon name="account_circle" /></button>
          </div>
        </header>

        <main className="page-scroll">
          {renderPage()}
        </main>
      </div>
    </div>
  );
}
