import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import type { CartItem } from './types';
import './App.css';

type View = 'POS' | 'GAS' | 'LOTTERY' | 'TOPUP' | 'HISTORY' | 'ANALYTICS' | 'STOCK' | 'STAFF';
type PaymentMethod = 'เงินสด' | 'PromptPay';
type SaleChannel = 'POS' | 'GAS' | 'LOTTERY';
type AnalyticsPeriod = 'day' | 'month' | 'year';
type MobileTopupProvider = 'AIS' | 'TRUE' | 'DTAC';

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

type DetectedBarcode = {
  rawValue?: string;
};

type BarcodeDetectorLike = {
  detect: (source: CanvasImageSource) => Promise<DetectedBarcode[]>;
};

type BarcodeDetectorConstructor = new (options?: { formats?: string[] }) => BarcodeDetectorLike;

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

interface CartSessionResponse {
  session_id: string;
  items: CartItem[];
}

interface AppSessionResponse {
  session_id: string;
  business_date: string;
}

interface ApiGasItem {
  id: string;
  name: string;
  operation: GasItem['operation'];
  price: number | string;
  stock: number;
  imageUrl?: string;
  image_url?: string;
}

interface GasStateResponse {
  items: ApiGasItem[];
  jobs: GasJob[];
  pendingReturns: PendingGasReturn[];
}

interface ApiSaleRecord extends Omit<SaleRecord, 'createdAt'> {
  createdAt: string;
}

interface AnalyticsSalesResponse {
  period: AnalyticsPeriod;
  startDate: string;
  endDate: string;
  sales: ApiSaleRecord[];
}

interface PrintRequest {
  id: number;
  session_id: string;
  sale_id: string;
  channel: SaleChannel;
  receipt: Omit<ReceiptSnapshot, 'createdAt'> & { createdAt: string };
  status: 'PENDING' | 'PRINTING' | 'PRINTED' | 'FAILED';
  requested_by: string;
  requested_at: string;
}

interface PosCheckoutResponse {
  receipt: Omit<ReceiptSnapshot, 'createdAt'> & { createdAt: string };
  sale: ApiSaleRecord;
  printRequest: PrintRequest;
  cart: CartSessionResponse;
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
  operation: string;
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
  deliveryFee?: number;
  returnedTankQuantity?: number;
  emptyTankReturned?: boolean;
  paid?: boolean;
  status: 'กำลังดำเนินการ' | 'เสร็จแล้ว';
  createdAt: string;
}

interface LotteryTicket {
  number: string;
  series: string;
  price: number;
  remaining: number;
}

interface MobileTopupOrder {
  id: string;
  provider: MobileTopupProvider;
  phone: string;
  amount: number;
  toppedUp: boolean;
  paid: boolean;
  createdAt: Date;
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
  jobId?: string;
  customerName: string;
  phone: string;
  tankName: string;
  borrowedAt: string;
  quantity: number;
}

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
  TOPUP: { icon: 'phone_iphone', title: 'Topup', subtitle: 'เติมเงินมือถือและติดตามรายการเบอร์' },
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
const topupProviders: MobileTopupProvider[] = ['AIS', 'TRUE', 'DTAC'];
const topupQuickAmounts = [20, 50, 100, 150, 200, 300, 500, 1000];
const topupKeypad = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];
const todayLabel = new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium' }).format(new Date());
const storageKeys = {
  appSessionId: 'tingkum.appSessionId.v1',
  deviceId: 'tingkum.deviceId.v1',
  lotteryTickets: 'tingkum.lotteryTickets.v1',
  mobileTopups: 'tingkum.mobileTopups.v1',
  salesHistory: 'tingkum.salesHistory.v1',
  staffMembers: 'tingkum.staffMembers.v1',
  stockLog: 'tingkum.stockLog.v1',
  stockLogSequence: 'tingkum.stockLogSequence.v1',
} as const;

function getApiBaseUrl() {
  const configuredApiBaseUrl = import.meta.env.VITE_API_BASE_URL;
  if (configuredApiBaseUrl) {
    return configuredApiBaseUrl.replace(/\/$/, '');
  }

  if (typeof window === 'undefined') {
    return 'http://localhost:5000';
  }

  const host = window.location.hostname;
  const apiHost = host && host !== '127.0.0.1' ? host : 'localhost';
  return `http://${apiHost}:5000`;
}

function createDailySessionId(date = new Date()) {
  return `TK-${dateInputValue(date).replace(/-/g, '')}`;
}

function createDeviceId() {
  return `WEB-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

function getBarcodeDetectorConstructor() {
  if (typeof window === 'undefined') {
    return null;
  }

  return (window as Window & { BarcodeDetector?: BarcodeDetectorConstructor }).BarcodeDetector ?? null;
}

const API_BASE_URL = getApiBaseUrl();

function formatMoney(value: number) {
  return new Intl.NumberFormat('th-TH', {
    style: 'currency',
    currency: 'THB',
    maximumFractionDigits: 2,
  }).format(value);
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

function reviveMobileTopups(value: unknown): MobileTopupOrder[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((order) => {
    const record = order as MobileTopupOrder;
    return {
      ...record,
      amount: Number(record.amount),
      toppedUp: Boolean(record.toppedUp),
      paid: Boolean(record.paid),
      createdAt: new Date(record.createdAt),
    };
  });
}

function normalizeSaleRecord(record: ApiSaleRecord | SaleRecord): SaleRecord {
  return {
    ...record,
    createdAt: new Date(record.createdAt),
    subtotal: Number(record.subtotal),
    discount: Number(record.discount),
    total: Number(record.total),
    cashReceived: Number(record.cashReceived),
    change: Number(record.change),
    items: record.items.map((item) => ({
      ...item,
      quantity: Number(item.quantity),
      price: Number(item.price),
      discount: Number(item.discount ?? 0),
    })),
  };
}

function normalizeReceipt(receipt: Omit<ReceiptSnapshot, 'createdAt'> & { createdAt: string }): ReceiptSnapshot {
  return {
    ...receipt,
    createdAt: new Date(receipt.createdAt),
    subtotal: Number(receipt.subtotal),
    billDiscount: Number(receipt.billDiscount),
    total: Number(receipt.total),
    cashReceived: Number(receipt.cashReceived),
    change: Number(receipt.change),
    items: receipt.items.map(normalizeCartItem),
  };
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

function createTopupId(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hour = String(date.getHours()).padStart(2, '0');
  const minute = String(date.getMinutes()).padStart(2, '0');
  const second = String(date.getSeconds()).padStart(2, '0');
  return `TOPUP-${year}${month}${day}-${hour}${minute}${second}`;
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

function openReceiptPrintDialog(receipt: ReceiptSnapshot) {
  const iframe = document.createElement('iframe');
  iframe.title = `Receipt ${receipt.id}`;
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  document.body.appendChild(iframe);

  const printDocument = iframe.contentDocument ?? iframe.contentWindow?.document;
  const printWindow = iframe.contentWindow;
  if (!printDocument || !printWindow) {
    iframe.remove();
    return;
  }

  printDocument.open();
  printDocument.write(`
    <!doctype html>
    <html lang="th">
      <head>
        <meta charset="utf-8" />
        <title>${escapeHtml(receipt.id)}</title>
        <style>
          @page { size: 80mm auto; margin: 4mm; }
          * { box-sizing: border-box; }
          body {
            margin: 0;
            color: #172033;
            background: #fff;
            font-family: 'Prompt', 'Plus Jakarta Sans', Arial, sans-serif;
            letter-spacing: 0;
          }
          .receipt-pdf-sheet { width: 72mm; padding: 0; background: #fff; }
          .receipt-pdf-header { display: grid; justify-items: center; gap: 4px; padding-bottom: 12px; border-bottom: 1px dashed #d9dee8; }
          .receipt-logo { display: grid; width: 34px; height: 34px; place-items: center; border-radius: 50%; background: #982946; color: #fff; font-size: 16px; font-weight: 900; }
          .receipt-pdf-header h1 { margin: 4px 0 0; color: #982946; font-size: 18px; font-weight: 900; }
          .receipt-pdf-header p, .receipt-pdf-footer span { margin: 0; color: #667085; font-size: 11px; }
          .receipt-meta, .receipt-totals { display: grid; gap: 6px; padding: 12px 0; border-bottom: 1px dashed #d9dee8; }
          .receipt-meta div, .receipt-totals div { display: flex; justify-content: space-between; gap: 10px; font-size: 11px; }
          .receipt-meta span, .receipt-totals span, .receipt-item span, .receipt-item-discount { color: #667085; }
          .receipt-meta strong, .receipt-totals strong { max-width: 42mm; text-align: right; }
          .receipt-items { display: grid; gap: 9px; padding: 12px 0; border-bottom: 1px dashed #d9dee8; }
          .receipt-item { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 8px; align-items: start; }
          .receipt-item strong { display: block; margin-bottom: 2px; font-size: 12px; }
          .receipt-item span, .receipt-item-discount, .receipt-item b { display: block; font-size: 10px; }
          .receipt-item-discount { color: #c2413a; }
          .receipt-totals { border-bottom: 0; }
          .receipt-grand-total strong { color: #982946; font-size: 15px; }
          .receipt-pdf-footer { display: grid; justify-items: center; gap: 4px; padding-top: 12px; font-size: 11px; }
        </style>
      </head>
      <body>${buildReceiptHtml(receipt)}</body>
    </html>
  `);
  printDocument.close();

  window.setTimeout(() => {
    printWindow.focus();
    printWindow.print();
  }, 250);
  window.setTimeout(() => iframe.remove(), 60000);
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

function normalizeGasItem(item: ApiGasItem): GasItem {
  return {
    id: item.id,
    name: item.name,
    operation: item.operation,
    price: Number(item.price),
    stock: Number(item.stock ?? 0),
    imageUrl: item.imageUrl ?? item.image_url ?? '',
  };
}

function normalizeGasJob(job: GasJob): GasJob {
  return {
    ...job,
    total: Number(job.total),
    deliveryFee: Number(job.deliveryFee ?? 0),
    returnedTankQuantity: Number(job.returnedTankQuantity ?? 0),
    emptyTankReturned: Boolean(job.emptyTankReturned),
    paid: Boolean(job.paid),
    items: job.items.map((item) => ({
      ...item,
      quantity: Number(item.quantity),
      price: Number(item.price),
    })),
  };
}

function normalizeCartItem(item: CartItem): CartItem {
  return {
    ...item,
    id: String(item.id),
    price: Number(item.price),
    quantity: Number(item.quantity),
    discount: Number(item.discount ?? 0),
    item_type: item.item_type ?? 'PRODUCT',
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

function monthInputValue(date: Date) {
  return dateInputValue(date).slice(0, 7);
}

function currentMonthInput() {
  return monthInputValue(new Date());
}

function currentYearInput() {
  return String(new Date().getFullYear());
}

function escapeXml(value: unknown) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function excelCell(value: string | number) {
  const type = typeof value === 'number' && Number.isFinite(value) ? 'Number' : 'String';
  return `<Cell><Data ss:Type="${type}">${escapeXml(value)}</Data></Cell>`;
}

function excelRow(cells: Array<string | number>) {
  return `<Row>${cells.map(excelCell).join('')}</Row>`;
}

function excelWorksheet(name: string, rows: Array<Array<string | number>>) {
  return `<Worksheet ss:Name="${escapeXml(name.slice(0, 31))}"><Table>${rows.map(excelRow).join('')}</Table></Worksheet>`;
}

function downloadExcelWorkbook(filename: string, worksheets: string[]) {
  const workbook = `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
<Styles>
  <Style ss:ID="Default" ss:Name="Normal"><Alignment ss:Vertical="Center"/><Font ss:FontName="Arial" ss:Size="10"/></Style>
</Styles>
${worksheets.join('')}
</Workbook>`;
  const blob = new Blob([workbook], { type: 'application/vnd.ms-excel;charset=utf-8;' });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
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
  const queryParams = typeof window === 'undefined' ? new URLSearchParams() : new URLSearchParams(window.location.search);
  const sessionFromUrl = queryParams.get('session') || '';
  const barcodeInputRef = useRef<HTMLInputElement>(null);
  const scannerVideoRef = useRef<HTMLVideoElement>(null);
  const scannerStreamRef = useRef<MediaStream | null>(null);
  const scannerFrameRef = useRef<number | null>(null);
  const handledPrintRequestIdsRef = useRef<Set<number>>(new Set());
  const previousGasSelectedCountRef = useRef(0);
  const [scanSessionId, setScanSessionId] = useState(() => sessionFromUrl || createDailySessionId());
  const [deviceId] = useState(() => readStoredValue(storageKeys.deviceId, createDeviceId()));
  const [isMobileViewport, setIsMobileViewport] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia('(max-width: 560px)').matches,
  );
  const [mobileCheckoutOpen, setMobileCheckoutOpen] = useState(false);
  const [mobileScannerOpen, setMobileScannerOpen] = useState(false);
  const [scannerBarcode, setScannerBarcode] = useState('');
  const [scannerNotice, setScannerNotice] = useState('พร้อมส่งบาร์โค้ดเข้าหน้า POS');
  const [cameraActive, setCameraActive] = useState(false);
  const [currentView, setCurrentView] = useState<View>('POS');
  const [apiStatus, setApiStatus] = useState('กำลังโหลดสินค้าใน tingkum_db');
  const [stockItems, setStockItems] = useState<Product[]>([]);
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

  const [gasItems, setGasItems] = useState<GasItem[]>([]);
  const [gasQuantities, setGasQuantities] = useState<Record<string, number>>({});
  const [gasCustomer, setGasCustomer] = useState({ name: '', phone: '', address: '' });
  const [gasDriverId, setGasDriverId] = useState('S-003');
  const [gasJobs, setGasJobs] = useState<GasJob[]>([]);
  const [pendingGasReturns, setPendingGasReturns] = useState<PendingGasReturn[]>([]);
  const [gasNotice, setGasNotice] = useState('กำลังโหลดข้อมูลแก๊สจาก tingkum_db');
  const [gasReturnedTankQuantity, setGasReturnedTankQuantity] = useState(0);
  const [gasPaid, setGasPaid] = useState(true);
  const [gasDeliveryFee, setGasDeliveryFee] = useState(20);
  const [gasPendingReturnQuantities, setGasPendingReturnQuantities] = useState<Record<string, number>>({});

  const [lotteryInput, setLotteryInput] = useState('');
  const [lotteryTickets, setLotteryTickets] = useState<LotteryTicket[]>(() =>
    readStoredValue(storageKeys.lotteryTickets, lotteryStock),
  );
  const [lotteryCart, setLotteryCart] = useState<CartItem[]>([]);
  const [lotteryPayment, setLotteryPayment] = useState<PaymentMethod>('เงินสด');
  const [lotteryReceived, setLotteryReceived] = useState(0);
  const [lotteryNotice, setLotteryNotice] = useState('ค้นหาเลข 6 หลักจากสต็อก');
  const [lotteryStockDraft, setLotteryStockDraft] = useState({ number: '', quantity: '1', price: '100' });
  const [lotteryStockNotice, setLotteryStockNotice] = useState('เพิ่มเลขหวยแบบ manual ก่อนเชื่อมระบบสต็อกหวยจริง');
  const [topupProvider, setTopupProvider] = useState<MobileTopupProvider>('AIS');
  const [topupPhone, setTopupPhone] = useState('');
  const [topupAmount, setTopupAmount] = useState('100');
  const [topupOrders, setTopupOrders] = useState<MobileTopupOrder[]>(() =>
    readStoredValue(storageKeys.mobileTopups, [], reviveMobileTopups),
  );
  const [topupNotice, setTopupNotice] = useState('เลือกค่าย กรอกเบอร์ และจำนวนเงินก่อนยืนยันรายการ');

  const [correctionProductId, setCorrectionProductId] = useState('');
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
  const [analyticsPeriod, setAnalyticsPeriod] = useState<AnalyticsPeriod>('day');
  const [analyticsDate, setAnalyticsDate] = useState(currentDateInput());
  const [analyticsMonth, setAnalyticsMonth] = useState(currentMonthInput());
  const [analyticsYear, setAnalyticsYear] = useState(currentYearInput());
  const [analyticsSales, setAnalyticsSales] = useState<SaleRecord[]>([]);
  const [analyticsRange, setAnalyticsRange] = useState({ startDate: currentDateInput(), endDate: '' });
  const [analyticsNotice, setAnalyticsNotice] = useState('เลือกช่วงเวลาเพื่อดู Dashboard จาก sales_records');
  const [isAnalyticsLoading, setIsAnalyticsLoading] = useState(false);

  useEffect(() => {
    if (sessionFromUrl) {
      return;
    }

    axios.get<AppSessionResponse>(`${API_BASE_URL}/api/app-sessions/today`)
      .then((response) => {
        setScanSessionId(response.data.session_id);
      })
      .catch(() => {
        // The client-side daily session id is deterministic, so POS can still work once the backend is available.
      });
  }, [sessionFromUrl]);

  useEffect(() => {
    axios.get<ApiProduct[]>(`${API_BASE_URL}/api/products`)
      .then((response) => {
        const normalized = response.data.map(normalizeProduct);
        setStockItems(normalized);
        setApiStatus(normalized.length > 0 ? 'เชื่อมต่อ tingkum_db แล้ว' : 'tingkum_db ยังไม่มีสินค้า');
      })
      .catch(() => {
        setApiStatus('เชื่อมต่อ tingkum_db ไม่สำเร็จ');
      });
  }, []);

  useEffect(() => writeStoredValue(storageKeys.appSessionId, scanSessionId), [scanSessionId]);
  useEffect(() => writeStoredValue(storageKeys.deviceId, deviceId), [deviceId]);
  useEffect(() => writeStoredValue(storageKeys.staffMembers, staffMembers), [staffMembers]);
  useEffect(() => writeStoredValue(storageKeys.lotteryTickets, lotteryTickets), [lotteryTickets]);
  useEffect(() => writeStoredValue(storageKeys.mobileTopups, topupOrders), [topupOrders]);
  useEffect(() => writeStoredValue(storageKeys.salesHistory, salesHistory), [salesHistory]);
  useEffect(() => writeStoredValue(storageKeys.stockLog, stockLog), [stockLog]);
  useEffect(() => writeStoredValue(storageKeys.stockLogSequence, stockLogSequence), [stockLogSequence]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }

    const mediaQuery = window.matchMedia('(max-width: 560px)');
    const syncViewport = () => setIsMobileViewport(mediaQuery.matches);
    syncViewport();
    mediaQuery.addEventListener('change', syncViewport);

    return () => mediaQuery.removeEventListener('change', syncViewport);
  }, []);

  function applyGasState(state: GasStateResponse) {
    setGasItems(state.items.map(normalizeGasItem));
    setGasJobs(state.jobs.map(normalizeGasJob));
    setPendingGasReturns(state.pendingReturns);
  }

  useEffect(() => {
    const syncGas = () => {
      axios.get<GasStateResponse>(`${API_BASE_URL}/api/app-sessions/${encodeURIComponent(scanSessionId)}/gas`)
        .then((response) => {
          applyGasState(response.data);
          setGasNotice(response.data.items.length > 0 ? 'พร้อมทำรายการแก๊ส' : 'ยังไม่มีข้อมูลถังแก๊สใน tingkum_db');
        })
        .catch(() => {
          setGasNotice('โหลดข้อมูลแก๊สจาก tingkum_db ไม่สำเร็จ');
        });
    };

    syncGas();
    const timer = window.setInterval(syncGas, 2500);

    return () => window.clearInterval(timer);
  }, [scanSessionId]);

  useEffect(() => {
    const syncSales = () => {
      axios.get<ApiSaleRecord[]>(`${API_BASE_URL}/api/app-sessions/${encodeURIComponent(scanSessionId)}/sales`)
        .then((response) => {
          const records = response.data.map(normalizeSaleRecord);
          setSalesHistory(records);
          if (!records.some((record) => record.id === selectedSaleId)) {
            setSelectedSaleId(records[0]?.id ?? '');
          }
        })
        .catch(() => {
          // Keep the last in-memory history when the backend is temporarily unavailable.
        });
    };

    syncSales();
    const timer = window.setInterval(syncSales, 3000);

    return () => window.clearInterval(timer);
  }, [scanSessionId, selectedSaleId]);

  const analyticsQuery = useMemo(() => {
    const params = new URLSearchParams({ period: analyticsPeriod });

    if (analyticsPeriod === 'day') {
      params.set('date', analyticsDate);
    } else if (analyticsPeriod === 'month') {
      params.set('month', analyticsMonth);
    } else {
      params.set('year', analyticsYear);
    }

    return params.toString();
  }, [analyticsDate, analyticsMonth, analyticsPeriod, analyticsYear]);

  useEffect(() => {
    if (currentView !== 'ANALYTICS') {
      return undefined;
    }

    let cancelled = false;
    const syncAnalytics = () => {
      setIsAnalyticsLoading(true);
      axios.get<AnalyticsSalesResponse>(`${API_BASE_URL}/api/analytics/sales?${analyticsQuery}`)
        .then((response) => {
          if (cancelled) {
            return;
          }

          const records = response.data.sales.map(normalizeSaleRecord);
          setAnalyticsSales(records);
          setAnalyticsRange({
            startDate: response.data.startDate,
            endDate: response.data.endDate,
          });
          setAnalyticsNotice(`${records.length} รายการจาก sales_records`);
        })
        .catch(() => {
          if (!cancelled) {
            setAnalyticsNotice('โหลด Dashboard จาก tingkum_db ไม่สำเร็จ');
          }
        })
        .finally(() => {
          if (!cancelled) {
            setIsAnalyticsLoading(false);
          }
        });
    };

    syncAnalytics();
    const timer = window.setInterval(syncAnalytics, 5000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [analyticsQuery, currentView]);

  useEffect(() => {
    if (currentView !== 'POS' || mobileCheckoutOpen || mobileScannerOpen) {
      return;
    }

    barcodeInputRef.current?.focus();
  }, [currentView, mobileCheckoutOpen, mobileScannerOpen, posCart.length, unknownBarcode]);

  useEffect(() => {
    if (currentView !== 'POS') {
      return undefined;
    }

    const syncCart = () => {
      axios.get<CartSessionResponse>(`${API_BASE_URL}/api/pos-sessions/${encodeURIComponent(scanSessionId)}/cart`)
        .then((response) => {
          setPosCart(response.data.items.map(normalizeCartItem));
        })
        .catch(() => {
          // POS still works locally when the backend is offline, but cross-device sync pauses.
        });
    };

    syncCart();
    const timer = window.setInterval(syncCart, 1000);

    return () => window.clearInterval(timer);
  }, [currentView, scanSessionId]);

  useEffect(() => {
    if (!mobileScannerOpen) {
      stopCameraScanner();
    }
  }, [mobileScannerOpen]);

  useEffect(() => {
    if (currentView !== 'POS') {
      setMobileScannerOpen(false);
    }
  }, [currentView]);

  useEffect(() => {
    return () => {
      stopCameraScanner(false);
    };
  }, []);

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
  const gasSelectedCount = gasOrderItems.reduce((sum, item) => sum + item.quantity, 0);
  const gasSubtotal = gasOrderItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const gasTotal = gasSubtotal + Math.max(0, gasDeliveryFee);
  const gasReturnedCount = Math.min(gasSelectedCount, Math.max(0, gasReturnedTankQuantity));
  const gasPendingTankCount = Math.max(0, gasSelectedCount - gasReturnedCount);
  const activeGasJobs = gasJobs.filter((job) =>
    job.status === 'กำลังดำเนินการ' || job.paid === false || job.emptyTankReturned === false,
  );

  useEffect(() => {
    const previousSelectedCount = previousGasSelectedCountRef.current;
    previousGasSelectedCountRef.current = gasSelectedCount;

    setGasReturnedTankQuantity((previous) => {
      const wasReturningAll = previousSelectedCount === 0 || previous === previousSelectedCount;
      return wasReturningAll ? gasSelectedCount : Math.min(previous, gasSelectedCount);
    });
  }, [gasSelectedCount]);

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
  const analyticsSaleCount = analyticsSales.length;
  const analyticsTotal = analyticsSales.reduce((sum, sale) => sum + sale.total, 0);
  const analyticsItemCount = analyticsSales.reduce(
    (sum, sale) => sum + sale.items.reduce((itemSum, item) => itemSum + item.quantity, 0),
    0,
  );
  const analyticsAverageBill = analyticsSaleCount > 0 ? analyticsTotal / analyticsSaleCount : 0;
  const analyticsDiscountTotal = analyticsSales.reduce((sum, sale) => sum + sale.discount, 0);
  const analyticsSuccessfulCount = analyticsSales.filter((sale) =>
    sale.status === 'สำเร็จ' || sale.status === 'เสร็จแล้ว',
  ).length;
  const analyticsPendingCount = analyticsSaleCount - analyticsSuccessfulCount;
  const analyticsChannelTotals = analyticsSales.reduce<Record<SaleChannel, { total: number; count: number }>>(
    (totals, sale) => {
      const current = totals[sale.channel];
      return {
        ...totals,
        [sale.channel]: {
          total: current.total + sale.total,
          count: current.count + 1,
        },
      };
    },
    {
      POS: { total: 0, count: 0 },
      GAS: { total: 0, count: 0 },
      LOTTERY: { total: 0, count: 0 },
    },
  );
  const possibleLotteryRevenue = lotteryTickets.reduce((sum, ticket) => sum + ticket.remaining * ticket.price, 0);
  const analyticsPaymentTotals = useMemo(() => {
    const totals = new Map<string, { total: number; count: number }>();

    analyticsSales.forEach((sale) => {
      const current = totals.get(sale.paymentMethod) ?? { total: 0, count: 0 };
      totals.set(sale.paymentMethod, {
        total: current.total + sale.total,
        count: current.count + 1,
      });
    });

    return Array.from(totals.entries())
      .map(([method, summary]) => ({ method, ...summary }))
      .sort((a, b) => b.total - a.total);
  }, [analyticsSales]);
  const categorySales = useMemo(() => {
    const totals = new Map<string, number>();

    analyticsSales.forEach((sale) => {
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
  }, [analyticsSales, stockItems]);
  const staffPerformance = useMemo(() => {
    const totals = new Map<string, { total: number; count: number }>();

    analyticsSales.forEach((sale) => {
      const current = totals.get(sale.staffName) ?? { total: 0, count: 0 };
      totals.set(sale.staffName, {
        total: current.total + sale.total,
        count: current.count + 1,
      });
    });

    return Array.from(totals.entries())
      .map(([name, summary]) => ({ name, ...summary }))
      .sort((a, b) => b.total - a.total);
  }, [analyticsSales]);
  const analyticsTrendRows = useMemo(() => {
    const buckets = new Map<string, { key: string; label: string; total: number; count: number }>();

    analyticsSales.forEach((sale) => {
      const saleDate = sale.createdAt;
      const key = analyticsPeriod === 'day'
        ? `${String(saleDate.getHours()).padStart(2, '0')}:00`
        : analyticsPeriod === 'month'
          ? dateInputValue(saleDate)
          : monthInputValue(saleDate);
      const label = analyticsPeriod === 'day'
        ? key
        : analyticsPeriod === 'month'
          ? new Intl.DateTimeFormat('th-TH', { day: '2-digit', month: 'short' }).format(saleDate)
          : new Intl.DateTimeFormat('th-TH', { month: 'short' }).format(saleDate);
      const current = buckets.get(key) ?? { key, label, total: 0, count: 0 };
      buckets.set(key, {
        ...current,
        total: current.total + sale.total,
        count: current.count + 1,
      });
    });

    return Array.from(buckets.values()).sort((a, b) => a.key.localeCompare(b.key));
  }, [analyticsPeriod, analyticsSales]);
  const analyticsMaxTrendTotal = Math.max(1, ...analyticsTrendRows.map((row) => row.total));
  const analyticsRangeLabel = analyticsPeriod === 'day'
    ? analyticsDate
    : analyticsPeriod === 'month'
      ? analyticsMonth
      : analyticsYear;
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
  const scannerUrl = useMemo(() => {
    if (typeof window === 'undefined') {
      return '';
    }

    const url = new URL(window.location.href);
    url.searchParams.delete('scanner');
    url.searchParams.set('session', scanSessionId);
    return url.toString();
  }, [scanSessionId]);

  function applyCartSession(response: CartSessionResponse) {
    setPosCart(response.items.map(normalizeCartItem));
  }

  const markPrintRequest = useCallback(async (requestId: number, status: PrintRequest['status']) => {
    await axios.patch<PrintRequest>(
      `${API_BASE_URL}/api/app-sessions/${encodeURIComponent(scanSessionId)}/receipt-print-requests/${requestId}`,
      { status },
    );
  }, [scanSessionId]);

  const handlePrintRequest = useCallback(async (request: PrintRequest) => {
    if (handledPrintRequestIdsRef.current.has(request.id)) {
      return;
    }

    handledPrintRequestIdsRef.current.add(request.id);
    const receipt = normalizeReceipt(request.receipt);

    try {
      await markPrintRequest(request.id, 'PRINTING');
      openReceiptPrintDialog(receipt);
      await markPrintRequest(request.id, 'PRINTED');
      setPosNotice(`สั่งพิมพ์ใบเสร็จ ${receipt.id} จากเครื่องคอมแล้ว`);
    } catch {
      handledPrintRequestIdsRef.current.delete(request.id);
      try {
        await markPrintRequest(request.id, 'FAILED');
      } catch {
        // Leave the request visible in the backend if even the status update fails.
      }
    }
  }, [markPrintRequest]);

  useEffect(() => {
    if (isMobileViewport) {
      return undefined;
    }

    const syncPrintRequests = () => {
      axios.get<PrintRequest[]>(
        `${API_BASE_URL}/api/app-sessions/${encodeURIComponent(scanSessionId)}/receipt-print-requests?status=PENDING`,
      )
        .then((response) => {
          response.data.forEach((request) => {
            void handlePrintRequest(request);
          });
        })
        .catch(() => {
          // Printing resumes automatically once the backend is reachable.
        });
    };

    syncPrintRequests();
    const timer = window.setInterval(syncPrintRequests, 1500);

    return () => window.clearInterval(timer);
  }, [handlePrintRequest, isMobileViewport, scanSessionId]);

  async function handleBarcodeValue(rawBarcode: string, source: 'desktop' | 'mobile' = 'desktop') {
    const query = rawBarcode.trim().toLowerCase();
    if (!query) {
      setPosNotice('กรอกหรือแสกนบาร์โค้ดก่อน');
      return;
    }

    try {
      const response = await axios.post<CartSessionResponse>(
        `${API_BASE_URL}/api/pos-sessions/${encodeURIComponent(scanSessionId)}/cart/scan`,
        { barcode: rawBarcode.trim(), source },
      );
      applyCartSession(response.data);
      const addedItem = response.data.items.find((item) => item.barcode.toLowerCase() === query);
      setBarcodeInput('');
      setScannerBarcode('');
      setUnknownBarcode('');
      setPosNotice(`เพิ่ม ${addedItem?.name ?? rawBarcode.trim()} แล้ว${source === 'mobile' ? ' จากมือถือ' : ''}`);
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        const pendingBarcode = rawBarcode.trim();
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

      if (axios.isAxiosError(error) && error.response?.status === 409) {
        setPosNotice('สินค้าคงเหลือไม่พอ');
        return;
      }

      setPosNotice('สแกนไม่สำเร็จ เพราะเชื่อมต่อ tingkum_db ไม่ได้');
    }
  }

  function scanProduct() {
    void handleBarcodeValue(barcodeInput, 'desktop');
  }

  async function sendScannerBarcode(value = scannerBarcode) {
    const barcode = value.trim();
    if (!barcode) {
      setScannerNotice('กรอกหรือสแกนบาร์โค้ดก่อน');
      return;
    }

    try {
      await handleBarcodeValue(barcode, 'mobile');
      setScannerNotice(`สแกน ${barcode} เข้า POS session แล้ว`);
    } catch {
      setScannerNotice(`สแกนไม่สำเร็จ ตรวจว่า backend เปิดที่ ${API_BASE_URL}`);
    }
  }

  function stopCameraScanner(updateState = true) {
    if (scannerFrameRef.current !== null) {
      window.cancelAnimationFrame(scannerFrameRef.current);
      scannerFrameRef.current = null;
    }

    scannerStreamRef.current?.getTracks().forEach((track) => track.stop());
    scannerStreamRef.current = null;

    if (scannerVideoRef.current) {
      scannerVideoRef.current.srcObject = null;
    }

    if (updateState) {
      setCameraActive(false);
    }
  }

  async function startCameraScanner() {
    const BarcodeDetector = getBarcodeDetectorConstructor();
    if (!navigator.mediaDevices?.getUserMedia) {
      setScannerNotice('Browser นี้ยังไม่เปิดกล้องจากหน้านี้ได้ ใช้ช่องกรอกบาร์โค้ดแทน');
      return;
    }

    if (!BarcodeDetector) {
      setScannerNotice('มือถือ/Browser นี้ยังไม่รองรับ BarcodeDetector ใช้ช่องกรอกแทนได้');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false,
      });
      scannerStreamRef.current = stream;
      setCameraActive(true);

      const video = scannerVideoRef.current;
      if (!video) {
        return;
      }

      video.srcObject = stream;
      await video.play();

      const detector = new BarcodeDetector({
        formats: ['ean_13', 'ean_8', 'code_128', 'code_39', 'upc_a', 'upc_e', 'qr_code'],
      });
      let lastDetectedBarcode = '';

      const scanFrame = async () => {
        if (!scannerVideoRef.current || !scannerStreamRef.current) {
          return;
        }

        try {
          const detections = await detector.detect(scannerVideoRef.current);
          const barcode = detections[0]?.rawValue?.trim();
          if (barcode && barcode !== lastDetectedBarcode) {
            lastDetectedBarcode = barcode;
            await sendScannerBarcode(barcode);
            stopCameraScanner();
            return;
          }
        } catch {
          // Keep scanning while the camera stream is alive.
        }

        scannerFrameRef.current = window.requestAnimationFrame(scanFrame);
      };

      scannerFrameRef.current = window.requestAnimationFrame(scanFrame);
    } catch {
      setCameraActive(false);
      setScannerNotice('เปิดกล้องไม่ได้ ตรวจ permission ของ browser');
    }
  }

  function toggleMobileScanner() {
    if (mobileScannerOpen) {
      setMobileScannerOpen(false);
      return;
    }

    setMobileScannerOpen(true);
    setScannerNotice('กำลังเปิดกล้องสแกน');
    window.setTimeout(() => {
      void startCameraScanner();
    }, 0);
  }

  function cancelUnknownProduct() {
    setUnknownBarcode('');
    setBarcodeInput('');
    setPosNotice('ยกเลิกการลงทะเบียนสินค้าใหม่');
  }

  async function registerNewProductFromScan() {
    const name = newProductDraft.name.trim();
    const barcode = newProductDraft.barcode.trim();
    const price = Number(newProductDraft.price);
    const stock = Number(newProductDraft.stock);
    const minStock = Number(newProductDraft.minStock);

    if (!barcode || !name || !Number.isFinite(price) || price <= 0 || !Number.isFinite(stock) || stock <= 0) {
      setPosNotice('กรอกบาร์โค้ด ชื่อสินค้า ราคาขาย และจำนวนเริ่มต้นให้ครบ');
      return;
    }

    let product: Product = {
      id: Math.max(0, ...stockItems.map((item) => item.id)) + 1,
      barcode,
      name,
      price,
      stock: Number.isFinite(stock) ? Math.max(0, stock) : 0,
      category: newProductDraft.category.trim() || 'ทั่วไป',
      minStock: Number.isFinite(minStock) ? Math.max(0, minStock) : 5,
      unit: newProductDraft.unit.trim() || 'ชิ้น',
    };

    try {
      const response = await axios.post<ApiProduct>(`${API_BASE_URL}/api/products`, {
        barcode,
        name,
        price,
        cost: price,
        stock,
        category: product.category,
      });
      product = {
        ...normalizeProduct(response.data),
        minStock: product.minStock,
        unit: product.unit,
      };
      setApiStatus('บันทึกสินค้าใหม่ลง tingkum_db แล้ว');
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 409) {
        setPosNotice(`บาร์โค้ด ${barcode} มีอยู่ในฐานข้อมูลแล้ว`);
        return;
      }

      setApiStatus('ลงทะเบียนสินค้าไม่สำเร็จ | เชื่อมต่อ tingkum_db ไม่ได้');
      setPosNotice('ลงทะเบียนสินค้าไม่สำเร็จ เพราะเชื่อมต่อ tingkum_db ไม่ได้');
      return;
    }

    setStockItems((previous) =>
      previous.some((item) => item.barcode === product.barcode)
        ? previous.map((item) => item.barcode === product.barcode ? { ...item, ...product } : item)
        : [...previous, product],
    );
    setCorrectionProductId(String(product.id));
    await handleBarcodeValue(product.barcode, 'desktop');
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

  async function updateCartQuantity(id: string, delta: number) {
    const cartItem = posCart.find((item) => item.id === id);
    if (!cartItem) {
      return;
    }

    const nextQuantity = Math.max(1, cartItem.quantity + delta);
    if (delta > 0) {
      const stockItem = stockItems.find((item) => String(item.id) === id);
      if (cartItem?.item_type === 'PRODUCT' && stockItem && cartItem.quantity >= stockItem.stock) {
        setPosNotice(`${cartItem.name} คงเหลือ ${stockItem.stock} ${stockItem.unit}`);
        return;
      }
    }

    setPosCart((previous) => previous.map((item) => item.id === id ? { ...item, quantity: nextQuantity } : item));

    try {
      const response = await axios.patch<CartSessionResponse>(
        `${API_BASE_URL}/api/pos-sessions/${encodeURIComponent(scanSessionId)}/cart/items/${encodeURIComponent(id)}`,
        { quantity: nextQuantity },
      );
      applyCartSession(response.data);
    } catch {
      setPosNotice('ปรับจำนวนในเครื่องแล้ว แต่ sync cart ไม่สำเร็จ');
    }
  }

  async function updateCartDiscount(id: string, discount: number) {
    const nextDiscount = Math.max(0, discount);
    setPosCart((previous) => previous.map((item) => item.id === id ? { ...item, discount: nextDiscount } : item));

    try {
      const response = await axios.patch<CartSessionResponse>(
        `${API_BASE_URL}/api/pos-sessions/${encodeURIComponent(scanSessionId)}/cart/items/${encodeURIComponent(id)}`,
        { discount: nextDiscount },
      );
      applyCartSession(response.data);
    } catch {
      setPosNotice('ปรับส่วนลดในเครื่องแล้ว แต่ sync cart ไม่สำเร็จ');
    }
  }

  async function removeFromPosCart(id: string) {
    setPosCart((previous) => previous.filter((item) => item.id !== id));

    try {
      const response = await axios.delete<CartSessionResponse>(
        `${API_BASE_URL}/api/pos-sessions/${encodeURIComponent(scanSessionId)}/cart/items/${encodeURIComponent(id)}`,
      );
      applyCartSession(response.data);
    } catch {
      setPosNotice('ลบรายการในเครื่องแล้ว แต่ sync cart ไม่สำเร็จ');
    }
  }

  async function clearPosCart() {
    setPosCart([]);

    try {
      const response = await axios.delete<CartSessionResponse>(
        `${API_BASE_URL}/api/pos-sessions/${encodeURIComponent(scanSessionId)}/cart`,
      );
      applyCartSession(response.data);
    } catch {
      setPosNotice('ล้างบิลในเครื่องแล้ว แต่ sync cart ไม่สำเร็จ');
    }
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

    setIsPrintingReceipt(true);
    setPosNotice(isMobileViewport ? 'กำลังส่งคำสั่งพิมพ์ไปเครื่องคอม' : 'กำลังบันทึกรายการและสั่งพิมพ์');

    try {
      const response = await axios.post<PosCheckoutResponse>(
        `${API_BASE_URL}/api/app-sessions/${encodeURIComponent(scanSessionId)}/pos/checkout`,
        {
          cashierName: cashier?.name ?? 'ไม่ระบุพนักงาน',
          customerName: currentMember?.name ?? 'ลูกค้าทั่วไป',
          paymentMethod: posPayment,
          billDiscount,
          cashReceived: posPayment === 'เงินสด' ? cashReceived : posTotal,
          note: currentMember?.phone ? `สมาชิก ${currentMember.phone}` : 'ขายหน้าร้าน',
          requestedBy: isMobileViewport ? 'mobile' : deviceId,
        },
      );

      const receipt = normalizeReceipt(response.data.receipt);
      const saleRecord = normalizeSaleRecord(response.data.sale);
      setSalesHistory((previous) => [saleRecord, ...previous.filter((sale) => sale.id !== saleRecord.id)]);
      setSelectedSaleId(saleRecord.id);
      applyCartSession(response.data.cart);
      axios.get<ApiProduct[]>(`${API_BASE_URL}/api/products`)
        .then((productsResponse) => setStockItems(productsResponse.data.map(normalizeProduct)))
        .catch(() => {
          // Stock is already updated in the database; the UI will catch up on the next refresh.
        });
      if (!isMobileViewport) {
        void handlePrintRequest(response.data.printRequest);
      }
      setPosNotice(
        isMobileViewport
          ? `สร้างรายการ ${receipt.id} แล้ว รอเครื่องคอมพิมพ์ใบเสร็จ`
          : `บันทึกรายการ ${receipt.id} แล้ว`,
      );
      setPosCart(response.data.cart.items.map(normalizeCartItem));
      setBillDiscount(0);
      setCashReceived(0);
      setMobileCheckoutOpen(false);
    } catch (error) {
      console.error(error);
      if (axios.isAxiosError(error) && error.response?.status === 409) {
        setPosNotice('ทำรายการไม่สำเร็จ ตรวจเงินรับหรือสต็อกสินค้า');
        return;
      }
      setPosNotice('ทำรายการไม่สำเร็จ เพราะเชื่อมต่อ tingkum_db ไม่ได้');
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

  function updateGasReturnedTankQuantity(delta: number) {
    setGasReturnedTankQuantity((previous) =>
      Math.max(0, Math.min(gasSelectedCount, previous + delta)),
    );
  }

  function pendingReturnQuantityFor(item: PendingGasReturn) {
    const quantity = gasPendingReturnQuantities[item.id] ?? Math.min(1, item.quantity);
    return Math.max(1, Math.min(item.quantity, quantity));
  }

  function updatePendingReturnQuantity(item: PendingGasReturn, delta: number) {
    setGasPendingReturnQuantities((previous) => ({
      ...previous,
      [item.id]: Math.max(1, Math.min(item.quantity, pendingReturnQuantityFor(item) + delta)),
    }));
  }

  async function createGasJob() {
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
    setGasNotice('กำลังบันทึกรายการแก๊สลง tingkum_db');

    try {
      const response = await axios.post<{ state: GasStateResponse; sale: ApiSaleRecord }>(
        `${API_BASE_URL}/api/app-sessions/${encodeURIComponent(scanSessionId)}/gas/jobs`,
        {
          customerName: gasCustomer.name.trim(),
          phone: gasCustomer.phone.trim(),
          address: gasCustomer.address.trim(),
          driver: driver?.name ?? 'ยังไม่ระบุ',
          deliveryFee: Math.max(0, gasDeliveryFee),
          emptyTankReturnQuantity: gasReturnedCount,
          paid: gasPaid,
          items: gasOrderItems.map((item) => ({ id: item.id, quantity: item.quantity })),
        },
      );
      applyGasState(response.data.state);
      const saleRecord = normalizeSaleRecord(response.data.sale);
      setSalesHistory((previous) => [saleRecord, ...previous.filter((sale) => sale.id !== saleRecord.id)]);
      setSelectedSaleId(saleRecord.id);
      setGasQuantities({});
      setGasCustomer({ name: '', phone: '', address: '' });
      setGasReturnedTankQuantity(0);
      setGasPaid(true);
      setGasNotice(`สร้างงาน ${saleRecord.id} แล้ว`);
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 409) {
        setGasNotice('ทำรายการแก๊สไม่สำเร็จ เพราะสต็อกถังไม่พอ');
        return;
      }

      setGasNotice('ทำรายการแก๊สไม่สำเร็จ เพราะเชื่อมต่อ tingkum_db ไม่ได้');
    }
  }

  async function completeGasJob(id: string) {
    try {
      const response = await axios.patch<GasStateResponse>(
        `${API_BASE_URL}/api/app-sessions/${encodeURIComponent(scanSessionId)}/gas/jobs/${encodeURIComponent(id)}`,
        { status: 'DONE' },
      );
      applyGasState(response.data);
      const updatedJob = response.data.jobs.find((job) => job.id === id);
      const updatedStatus = updatedJob?.status ?? 'กำลังดำเนินการ';
      setSalesHistory((previous) =>
        previous.map((sale) =>
          sale.id === id
            ? { ...sale, status: updatedStatus === 'เสร็จแล้ว' ? 'สำเร็จ' : updatedStatus }
            : sale,
        ),
      );
      setGasNotice(
        updatedStatus === 'เสร็จแล้ว'
          ? `ปิดงาน ${id} แล้ว`
          : `บันทึกการจ่าย ${id} แล้ว รอคืนถังให้ครบ`,
      );
    } catch {
      setGasNotice('ปิดงานไม่สำเร็จ เพราะเชื่อมต่อ tingkum_db ไม่ได้');
    }
  }

  async function completeGasReturn(id: string, quantity?: number) {
    const returnItem = pendingGasReturns.find((item) => item.id === id);
    try {
      const response = await axios.patch<GasStateResponse>(
        `${API_BASE_URL}/api/app-sessions/${encodeURIComponent(scanSessionId)}/gas/returns/${encodeURIComponent(id)}`,
        { status: 'RETURNED', quantity: quantity ?? (returnItem ? pendingReturnQuantityFor(returnItem) : undefined) },
      );
      applyGasState(response.data);
      if (returnItem) {
        const returnedQuantity = quantity ?? pendingReturnQuantityFor(returnItem);
        const updatedJob = returnItem.jobId
          ? response.data.jobs.find((job) => job.id === returnItem.jobId)
          : undefined;
        setGasPendingReturnQuantities((previous) => {
          const next = { ...previous };
          delete next[id];
          return next;
        });
        if (updatedJob) {
          setSalesHistory((previous) =>
            previous.map((sale) =>
              sale.id === updatedJob.id
                ? { ...sale, status: updatedJob.status === 'เสร็จแล้ว' ? 'สำเร็จ' : updatedJob.status }
                : sale,
            ),
          );
        }
        setGasNotice(`รับคืนถัง ${returnItem.tankName} จาก ${returnItem.customerName} ${returnedQuantity} ถังแล้ว`);
      }
    } catch {
      setGasNotice('รับคืนถังไม่สำเร็จ เพราะเชื่อมต่อ tingkum_db ไม่ได้');
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

  async function completeLotterySale() {
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

    try {
      await axios.post<ApiSaleRecord>(
        `${API_BASE_URL}/api/app-sessions/${encodeURIComponent(scanSessionId)}/sales`,
        saleRecord,
      );
      setSalesHistory((previous) => [saleRecord, ...previous.filter((sale) => sale.id !== saleRecord.id)]);
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
    } catch {
      setLotteryNotice('บันทึกขายหวยไม่สำเร็จ เพราะเชื่อมต่อ tingkum_db ไม่ได้');
    }
  }

  function appendTopupPhoneDigit(digit: string) {
    setTopupPhone((previous) => `${previous}${digit}`.slice(0, 10));
  }

  function deleteTopupPhoneDigit() {
    setTopupPhone((previous) => previous.slice(0, -1));
  }

  function confirmTopupOrder() {
    const phone = topupPhone.trim();
    const amount = Number(topupAmount);

    if (!/^0\d{9}$/.test(phone)) {
      setTopupNotice('กรอกเบอร์มือถือ 10 หลักให้ถูกต้อง');
      return;
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      setTopupNotice('กรอกจำนวนเงินเติมให้ถูกต้อง');
      return;
    }

    const createdAt = new Date();
    const order: MobileTopupOrder = {
      id: createTopupId(createdAt),
      provider: topupProvider,
      phone,
      amount,
      toppedUp: false,
      paid: false,
      createdAt,
    };

    setTopupOrders((previous) => [order, ...previous]);
    setTopupPhone('');
    setTopupAmount(String(amount));
    setTopupNotice(`เพิ่มรายการ ${topupProvider} ${phone} ${formatMoney(amount)} แล้ว`);
  }

  function toggleTopupOrderStatus(id: string, field: 'toppedUp' | 'paid') {
    setTopupOrders((previous) =>
      previous.map((order) =>
        order.id === id ? { ...order, [field]: !order[field] } : order,
      ),
    );
  }

  function removeTopupOrder(id: string) {
    setTopupOrders((previous) => previous.filter((order) => order.id !== id));
    setTopupNotice(`ลบรายการ ${id} แล้ว`);
  }

  async function applyStockCorrection() {
    const product = stockItems.find((item) => String(item.id) === selectedCorrectionProductId);
    const delta = Number(correctionDelta);
    if (!product || !Number.isFinite(delta) || delta === 0) {
      return;
    }

    if (!correctionReason.trim()) {
      setCorrectionReason('กรุณาระบุเหตุผล');
      return;
    }

    try {
      const response = await axios.patch<ApiProduct>(
        `${API_BASE_URL}/api/products/${product.id}/stock`,
        { delta, reason: correctionReason.trim() },
      );
      const updatedProduct = normalizeProduct(response.data);
      setStockItems((previous) =>
        previous.map((item) =>
          item.id === product.id ? { ...item, ...updatedProduct } : item,
        ),
      );
      setApiStatus('ปรับ stock ใน tingkum_db แล้ว');
    } catch {
      setApiStatus('ปรับ stock ไม่สำเร็จ | เชื่อมต่อ tingkum_db ไม่ได้');
      return;
    }

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

  function addManualLotteryStock() {
    const number = lotteryStockDraft.number.trim();
    const quantity = Math.floor(Number(lotteryStockDraft.quantity));
    const price = Number(lotteryStockDraft.price);

    if (!/^\d{6}$/.test(number) || !Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(price) || price <= 0) {
      setLotteryStockNotice('กรอกเลข 6 หลัก จำนวน และราคาให้ถูกต้อง');
      return;
    }

    setLotteryTickets((previous) => {
      const existing = previous.find((ticket) => ticket.number === number);
      if (existing) {
        return previous
          .map((ticket) =>
            ticket.number === number
              ? { ...ticket, remaining: ticket.remaining + quantity, price }
              : ticket,
          )
          .sort((a, b) => a.number.localeCompare(b.number));
      }

      return [
        ...previous,
        {
          number,
          series: 'Manual',
          price,
          remaining: quantity,
        },
      ].sort((a, b) => a.number.localeCompare(b.number));
    });

    setLotteryCart((previous) =>
      previous.map((item) =>
        item.id === number ? { ...item, price } : item,
      ),
    );
    setLotteryStockDraft({ number: '', quantity: '1', price: String(price) });
    setLotteryStockNotice(`เพิ่ม/อัปเดตเลข ${number} จำนวน ${quantity} ใบแล้ว`);
    setLotteryNotice(`stock เลข ${number} พร้อมขายแล้ว`);
  }

  function removeManualLotteryStock(number: string) {
    setLotteryTickets((previous) => previous.filter((ticket) => ticket.number !== number));
    setLotteryCart((previous) => previous.filter((item) => item.id !== number));
    setLotteryStockNotice(`ลบเลข ${number} ออกจาก stock หวยแล้ว`);
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

  function downloadAnalyticsExcel() {
    const periodLabel = analyticsPeriod === 'day'
      ? 'รายวัน'
      : analyticsPeriod === 'month'
        ? 'รายเดือน'
        : 'รายปี';
    const stockValue = stockItems.reduce((sum, item) => sum + item.stock * item.price, 0);
    const generatedAt = formatReceiptDateTime(new Date());
    const summaryRows: Array<Array<string | number>> = [
      ['Tingkum Analytics Dashboard'],
      ['ช่วงรายงาน', periodLabel],
      ['ค่า filter', analyticsRangeLabel],
      ['วันที่เริ่ม', analyticsRange.startDate],
      ['วันที่สิ้นสุด', analyticsRange.endDate || '-'],
      ['สร้างไฟล์เมื่อ', generatedAt],
      [],
      ['ตัวชี้วัด', 'ค่า'],
      ['ยอดขายรวม', analyticsTotal],
      ['จำนวนบิล', analyticsSaleCount],
      ['ยอดเฉลี่ยต่อบิล', Math.round(analyticsAverageBill * 100) / 100],
      ['จำนวนชิ้นที่ขาย', analyticsItemCount],
      ['ส่วนลดรวม', analyticsDiscountTotal],
      ['บิลสำเร็จ', analyticsSuccessfulCount],
      ['บิลค้าง/กำลังดำเนินการ', analyticsPendingCount],
      ['สินค้าใกล้หมด', lowStockCount],
      ['มูลค่าสต็อกประมาณ', stockValue],
      ['มูลค่าหวยคงเหลือ', possibleLotteryRevenue],
      [],
      ['ช่องทาง', 'จำนวนบิล', 'ยอดขาย'],
      ...(['POS', 'GAS', 'LOTTERY'] as SaleChannel[]).map((channel) => [
        saleChannelMeta[channel].label,
        analyticsChannelTotals[channel].count,
        analyticsChannelTotals[channel].total,
      ]),
      [],
      ['การชำระเงิน', 'จำนวนบิล', 'ยอดขาย'],
      ...analyticsPaymentTotals.map((payment) => [payment.method, payment.count, payment.total]),
      [],
      ['Trend', 'จำนวนบิล', 'ยอดขาย'],
      ...analyticsTrendRows.map((row) => [row.label, row.count, row.total]),
      [],
      ['หมวดขายดี', 'ยอดขาย'],
      ...categorySales.map((category) => [category.label, category.value]),
      [],
      ['ผลงานพนักงาน', 'จำนวนบิล', 'ยอดขาย'],
      ...staffPerformance.map((staff) => [staff.name, staff.count, staff.total]),
    ];
    const salesRows: Array<Array<string | number>> = [
      ['วันที่เวลา', 'ช่องทาง', 'เลขที่', 'ลูกค้า', 'พนักงาน', 'วิธีชำระ', 'สถานะ', 'จำนวนชิ้น', 'ยอดก่อนส่วนลด', 'ส่วนลด', 'ยอดสุทธิ', 'รับเงิน', 'เงินทอน', 'หมายเหตุ'],
      ...analyticsSales.map((sale) => [
        formatReceiptDateTime(sale.createdAt),
        saleChannelMeta[sale.channel].label,
        sale.id,
        sale.customerName,
        sale.staffName,
        sale.paymentMethod,
        sale.status,
        sale.items.reduce((sum, item) => sum + item.quantity, 0),
        sale.subtotal,
        sale.discount,
        sale.total,
        sale.cashReceived,
        sale.change,
        sale.note ?? '',
      ]),
    ];
    const itemRows: Array<Array<string | number>> = [
      ['เลขที่', 'วันที่เวลา', 'ช่องทาง', 'สินค้า', 'บาร์โค้ด', 'จำนวน', 'ราคาต่อหน่วย', 'ส่วนลด', 'ยอดรวมรายการ'],
      ...analyticsSales.flatMap((sale) =>
        sale.items.map((item) => [
          sale.id,
          formatReceiptDateTime(sale.createdAt),
          saleChannelMeta[sale.channel].label,
          item.name,
          item.barcode ?? '',
          item.quantity,
          item.price,
          item.discount,
          Math.max(0, item.price * item.quantity - item.discount),
        ]),
      ),
    ];

    downloadExcelWorkbook(
      `tingkum-analytics-${analyticsPeriod}-${analyticsRangeLabel}.xls`,
      [
        excelWorksheet('Summary', summaryRows),
        excelWorksheet('Sales', salesRows),
        excelWorksheet('Items', itemRows),
      ],
    );
    setAnalyticsNotice(`ส่งออก Excel ${analyticsSales.length} รายการแล้ว`);
  }

  function renderMobileReceiptCheckout() {
    return (
      <section className="panel mobile-receipt-view">
        <button className="link-button mobile-back-button" type="button" onClick={() => setMobileCheckoutOpen(false)}>
          <Icon name="arrow_back" /> กลับไปยิงสินค้า
        </button>

        <label className="field mobile-cashier-field">
          <span>พนักงานรับขาย</span>
          <select value={cashierId} onChange={(event) => setCashierId(event.target.value)}>
            {activeStaff.map((staff) => <option key={staff.id} value={staff.id}>{staff.name} - {staff.role}</option>)}
          </select>
        </label>

        <div className="mobile-receipt-paper">
          <div className="mobile-receipt-heading">
            <strong>Tingkum</strong>
            <span>ใบสรุปชำระเงิน</span>
          </div>

          <div className="mobile-receipt-items">
            {posCart.map((item) => (
              <div key={item.id}>
                <span>{item.name} x {item.quantity}</span>
                <strong>{formatMoney(item.price * item.quantity - item.discount)}</strong>
              </div>
            ))}
          </div>

          <div className="mobile-receipt-total">
            <div><span>ยอดสินค้า</span><strong>{formatMoney(posSubtotal)}</strong></div>
            <label>
              <span>ส่วนลดท้ายบิล</span>
              <input type="number" min="0" value={billDiscount || ''} onChange={(event) => setBillDiscount(Number(event.target.value))} />
            </label>
            <div className="grand-total"><span>ต้องชำระ</span><strong>{formatMoney(posTotal)}</strong></div>
          </div>

          <label className="field">
            <span>รับเงินสด</span>
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
        </div>

        <button
          className="primary-action mobile-create-receipt"
          type="button"
          onClick={completePosSale}
          disabled={isPrintingReceipt || posCart.length === 0}
        >
          <Icon name={isPrintingReceipt ? 'hourglass_top' : 'picture_as_pdf'} />
          {isPrintingReceipt ? 'กำลังส่งคำสั่งพิมพ์...' : 'สร้างใบเสร็จ / สั่งพิมพ์ที่คอม'}
        </button>
      </section>
    );
  }

  function renderPosPage() {
    return (
      <div className={`pos-layout ${mobileCheckoutOpen ? 'mobile-checkout-open' : ''}`}>
        <section className="panel pos-workspace">
          <PanelTitle icon="barcode_scanner" title="ขายสินค้า" detail={posNotice} />

          <div className="input-grid">
            <label className="field">
              <span>แสกนสินค้า</span>
              <div className="input-with-button">
                <input
                  ref={barcodeInputRef}
                  value={barcodeInput}
                  onChange={(event) => setBarcodeInput(event.target.value)}
                  onKeyDown={(event) => event.key === 'Enter' && scanProduct()}
                  placeholder="ยิงบาร์โค้ดหรือพิมพ์ชื่อสินค้า"
                  autoFocus
                />
                <button type="button" onClick={scanProduct}><Icon name="add_shopping_cart" /> เพิ่ม</button>
                <button className="mobile-camera-toggle" type="button" onClick={toggleMobileScanner}>
                  <Icon name={mobileScannerOpen ? 'keyboard_arrow_up' : 'photo_camera'} />
                  {mobileScannerOpen ? 'ปิด' : 'Scan'}
                </button>
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

          <div className={`mobile-camera-panel ${mobileScannerOpen ? 'open' : ''}`}>
            <div className="scanner-camera-frame mobile-camera-frame">
              <video ref={scannerVideoRef} muted playsInline aria-label="Barcode camera preview" />
              {!cameraActive && (
                <div>
                  <Icon name="photo_camera" />
                  <span>กด Scan เพื่อเปิดกล้อง หรือกรอกบาร์โค้ดด้านล่าง</span>
                </div>
              )}
            </div>

            <div className="scanner-input-block mobile-scanner-fallback">
              <input
                value={scannerBarcode}
                onChange={(event) => setScannerBarcode(event.target.value)}
                onKeyDown={(event) => event.key === 'Enter' && sendScannerBarcode()}
                placeholder="กรอกบาร์โค้ดแทนกล้อง"
              />
              <button type="button" onClick={() => sendScannerBarcode()}>
                <Icon name="send" /> เพิ่มเข้า session
              </button>
            </div>

            <div className="scanner-client-status">
              <strong>{scannerNotice}</strong>
              <small>POS session {scanSessionId}</small>
            </div>
          </div>

          <div className="scan-session-panel">
            <div>
              <span className="badge neutral">POS Session</span>
              <strong>Session {scanSessionId}</strong>
              <small>เปิด URL นี้บนมือถือเพื่อใช้ POS เดียวกัน รายการสินค้า sync กับเครื่องนี้</small>
            </div>
            <input value={scannerUrl} readOnly onFocus={(event) => event.target.select()} />
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

          <div className="mobile-cart-list">
            {posCart.length === 0 ? (
              <EmptyState text="ยิงบาร์โค้ดเพื่อเพิ่มสินค้า" />
            ) : posCart.map((item) => (
              <div className="mobile-cart-card" key={item.id}>
                <div>
                  <strong>{item.name}</strong>
                  <small>{item.barcode}</small>
                </div>
                <div className="stepper">
                  <button type="button" onClick={() => updateCartQuantity(item.id, -1)}><Icon name="remove" /></button>
                  <span>{item.quantity}</span>
                  <button type="button" onClick={() => updateCartQuantity(item.id, 1)}><Icon name="add" /></button>
                </div>
                <b>{formatMoney(item.price * item.quantity - item.discount)}</b>
                <button className="icon-button danger mobile-delete-item" type="button" onClick={() => removeFromPosCart(item.id)}>
                  <Icon name="delete" />
                </button>
              </div>
            ))}
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
          <button className="secondary-action" type="button" onClick={clearPosCart}>
            <Icon name="backspace" /> ล้างบิล
          </button>
        </aside>

        {renderMobileReceiptCheckout()}

        <button
          className="mobile-checkout-overlay"
          type="button"
          disabled={posCart.length === 0}
          onClick={() => setMobileCheckoutOpen(true)}
        >
          <span>{posCart.length} รายการ</span>
          <strong>{formatMoney(posTotal)}</strong>
          <b>ทำรายการ</b>
        </button>
      </div>
    );
  }

  function renderGasPage() {
    const gasSaleCount = gasJobs.length;

    return (
      <div className="gas-sales-page">
        <section className="gas-sale-header">
          <div>
            <h2>ขายแก๊ส <span className="badge accent">New Sale</span></h2>
            <p>Manage delivery, tank sizing, tank return, and payment records.</p>
          </div>
          <div className="gas-header-actions">
            <button className="secondary-action" type="button" onClick={() => setCurrentView('HISTORY')}>
              <Icon name="history" /> ประวัติย้อนหลัง
            </button>
            <button className="primary-action" type="button" onClick={createGasJob} disabled={gasOrderItems.length === 0}>
              <Icon name="save" /> ยืนยันการขาย
            </button>
          </div>
        </section>

        <section className="panel gas-tank-panel">
          <PanelTitle icon="propane_tank" title="เลือกขนาดถังแก๊ส" detail={gasNotice} />
          <div className="gas-tank-grid">
            {gasItems.length === 0 ? (
              <EmptyState text="ยังไม่มีขนาดถังแก๊สใน tingkum_db" />
            ) : gasItems.map((item, index) => (
              <div
                className={`gas-tank-card ${(gasQuantities[item.id] ?? 0) > 0 ? 'selected' : ''}`}
                key={item.id}
                role="button"
                tabIndex={0}
                onClick={() => updateGasQuantity(item.id, 1)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    updateGasQuantity(item.id, 1);
                  }
                }}
              >
                {index === 0 && <span className="gas-card-ribbon">popular</span>}
                <img src={item.imageUrl} alt={item.name} />
                <strong>{item.name}</strong>
                <span>{formatMoney(item.price)}</span>
                <small>คงเหลือ {item.stock} ถัง</small>
                <div className="stepper large">
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      updateGasQuantity(item.id, -1);
                    }}
                  >
                    <Icon name="remove" />
                  </button>
                  <span>{gasQuantities[item.id] ?? 0}</span>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      updateGasQuantity(item.id, 1);
                    }}
                  >
                    <Icon name="add" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="panel gas-details-panel">
          <PanelTitle icon="pin_drop" title="รายละเอียด" />
          <div className="form-stack">
            <label className="field">
              <span>ชื่อที่อยู่ / จุดหมายปลายทาง</span>
              <textarea value={gasCustomer.address} onChange={(event) => setGasCustomer({ ...gasCustomer, address: event.target.value })} placeholder="ระบุที่อยู่หรือจุดสังเกต" />
            </label>
            <label className="field">
              <span>ชื่อลูกค้า</span>
              <input value={gasCustomer.name} onChange={(event) => setGasCustomer({ ...gasCustomer, name: event.target.value })} placeholder="ชื่อผู้สั่ง" />
            </label>
            <label className="field">
              <span>เบอร์โทรศัพท์</span>
              <input value={gasCustomer.phone} onChange={(event) => setGasCustomer({ ...gasCustomer, phone: event.target.value })} placeholder="08x-xxx-xxxx" />
            </label>
            <label className="field">
              <span>ผู้ส่งแก๊ส</span>
              <select value={gasDriverId} onChange={(event) => setGasDriverId(event.target.value)}>
                {(deliveryStaff.length > 0 ? deliveryStaff : activeStaff).map((staff) => (
                  <option key={staff.id} value={staff.id}>{staff.name} - {staff.role}</option>
                ))}
              </select>
            </label>
          </div>
        </section>

        <section className="panel gas-recent-panel">
          <PanelTitle icon="receipt_long" title="รายการล่าสุด" detail={`${gasSaleCount} รายการวันนี้`} />
          <div className="gas-recent-table">
            {gasJobs.length === 0 ? (
              <EmptyState text="ยังไม่มีรายการขายแก๊สวันนี้" />
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>เวลา</th>
                    <th>ลูกค้า</th>
                    <th>ขนาด</th>
                    <th>สถานะ</th>
                    <th>ยอดรวม</th>
                  </tr>
                </thead>
                <tbody>
                  {gasJobs.map((job) => (
                    <tr key={job.id}>
                      <td>{job.createdAt}</td>
                      <td>
                        <strong>{job.customerName}</strong>
                        <small>{job.address}</small>
                      </td>
                      <td>
                        <div className="gas-size-tags">
                          {job.items.map((item) => (
                            <span key={`${job.id}-${item.name}`}>{item.name.replace('ถังแก๊ส ', '')} x{item.quantity}</span>
                          ))}
                        </div>
                      </td>
                      <td>
                        <span className={`badge ${job.paid ? 'success' : 'warning'}`}>
                          {job.paid ? 'จ่ายแล้ว' : 'ค้างจ่าย'}
                        </span>
                        <span className={`badge ${job.emptyTankReturned ? 'neutral' : 'warning'}`}>
                          {job.emptyTankReturned ? 'คืนถังครบ' : `คืน ${job.returnedTankQuantity ?? 0} ถัง`}
                        </span>
                      </td>
                      <td><strong>{formatMoney(job.total)}</strong></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>

        <aside className="panel gas-status-panel">
          <PanelTitle icon="fact_check" title="สถานะ" />
          <div className="gas-status-controls">
            <div className="gas-return-control">
              <div>
                <span><Icon name="sync_alt" /> คืนถังเปล่า</span>
                <strong>{gasReturnedCount} / {gasSelectedCount}</strong>
              </div>
              <div className="stepper large">
                <button type="button" onClick={() => updateGasReturnedTankQuantity(-1)} disabled={gasReturnedCount <= 0}>
                  <Icon name="remove" />
                </button>
                <span>{gasReturnedCount}</span>
                <button type="button" onClick={() => updateGasReturnedTankQuantity(1)} disabled={gasReturnedCount >= gasSelectedCount}>
                  <Icon name="add" />
                </button>
              </div>
              <small>{gasPendingTankCount > 0 ? `จะค้างถัง ${gasPendingTankCount} ถัง` : 'คืนครบตามจำนวนที่ขาย'}</small>
            </div>

            <label className={`gas-status-toggle ${gasPaid ? 'active' : ''}`}>
              <span><Icon name="payments" /> จ่ายแล้ว</span>
              <input type="checkbox" checked={gasPaid} onChange={(event) => setGasPaid(event.target.checked)} />
              <i></i>
            </label>
          </div>

          <div className="gas-summary-lines">
            <div><span>จำนวนถัง</span><strong>{gasSelectedCount}</strong></div>
            <div><span>ราคาสินค้า</span><strong>{formatMoney(gasSubtotal)}</strong></div>
            <label>
              <span>ค่าส่ง</span>
              <input type="number" min="0" value={gasDeliveryFee || ''} onChange={(event) => setGasDeliveryFee(Number(event.target.value))} />
            </label>
            <div className="gas-net-total"><span>ยอดรวมสุทธิ</span><strong>{formatMoney(gasTotal)}</strong></div>
          </div>
        </aside>

        <section className="panel gas-followup-panel">
          <PanelTitle
            icon="pending_actions"
            title="ติดตามรายการค้าง"
            detail={`${activeGasJobs.length} งานยังไม่ปิด | ${pendingGasReturns.length} รายการยังไม่คืนถัง`}
          />
          <div className="gas-followup-grid">
            {activeGasJobs.length === 0 && pendingGasReturns.length === 0 ? (
              <EmptyState text="ไม่มีรายการที่ต้องติดตาม" />
            ) : (
              <>
                {activeGasJobs.map((job) => (
                  <div className="gas-followup-card" key={`open-${job.id}`}>
                    <div>
                      <span className="badge warning">{job.paid ? 'รอปิดงาน' : 'ค้างจ่าย'}</span>
                      <strong>{job.customerName}</strong>
                      <small>{job.createdAt} | {job.driver} | {formatMoney(job.total)}</small>
                    </div>
                    <button type="button" onClick={() => completeGasJob(job.id)}>ปิดงาน</button>
                  </div>
                ))}

                {pendingGasReturns.map((item) => (
                  <div className="gas-followup-card" key={`return-${item.id}`}>
                    <div>
                      <span className="badge warning">ค้างถัง</span>
                      <strong>{item.customerName} - {item.tankName} x {item.quantity}</strong>
                      <small>{item.phone} | {item.borrowedAt}</small>
                    </div>
                    <div className="gas-return-action">
                      <div className="stepper">
                        <button type="button" onClick={() => updatePendingReturnQuantity(item, -1)}><Icon name="remove" /></button>
                        <span>{pendingReturnQuantityFor(item)}</span>
                        <button type="button" onClick={() => updatePendingReturnQuantity(item, 1)}><Icon name="add" /></button>
                      </div>
                      <button type="button" onClick={() => completeGasReturn(item.id, pendingReturnQuantityFor(item))}>รับคืน</button>
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        </section>
      </div>
    );
  }

  function renderLotteryPage() {
    const matchingTicket = lotteryTickets.find((ticket) => ticket.number === lotteryInput.trim());

    return (
      <div className="lottery-sales-page">
        <section className="panel lottery-entry-panel">
          <PanelTitle icon="confirmation_number" title="ขายหวย" detail={lotteryNotice} />
          <div className="input-with-button large-input">
            <input
              value={lotteryInput}
              maxLength={6}
              onChange={(event) => setLotteryInput(event.target.value.replace(/\D/g, '').slice(0, 6))}
              onKeyDown={(event) => event.key === 'Enter' && searchLottery()}
              placeholder="ใส่เลข 6 หลัก"
            />
            <button type="button" onClick={searchLottery}><Icon name="add_shopping_cart" /> เพิ่มเข้ารายการ</button>
          </div>

          {matchingTicket && (
            <div className="stock-result">
              <span>พบเลข {matchingTicket.number} {matchingTicket.series}</span>
              <strong>เหลือ {lotteryAvailable(matchingTicket)} ใบ</strong>
              <button type="button" onClick={() => addLotteryTicket(matchingTicket)}>เพิ่มลงรายการ</button>
            </div>
          )}
        </section>

        <aside className="panel summary-panel lottery-cart-panel">
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

  function renderTopupPage() {
    const pendingTopupCount = topupOrders.filter((order) => !order.toppedUp).length;
    const unpaidTopupCount = topupOrders.filter((order) => !order.paid).length;
    const topupTotal = topupOrders.reduce((sum, order) => sum + order.amount, 0);

    return (
      <div className="topup-page">
        <section className="panel topup-entry-panel">
          <PanelTitle icon="phone_iphone" title="เติมเงินมือถือ" detail={topupNotice} />

          <div className="topup-provider-grid" aria-label="เลือกผู้ให้บริการ">
            {topupProviders.map((provider) => (
              <button
                type="button"
                key={provider}
                className={topupProvider === provider ? 'active' : ''}
                onClick={() => setTopupProvider(provider)}
              >
                <Icon name="cell_tower" />
                {provider}
              </button>
            ))}
          </div>

          <label className="field">
            <span>เบอร์มือถือ</span>
            <input
              value={topupPhone}
              inputMode="numeric"
              maxLength={10}
              onChange={(event) => setTopupPhone(event.target.value.replace(/\D/g, '').slice(0, 10))}
              onKeyDown={(event) => event.key === 'Enter' && confirmTopupOrder()}
              placeholder="08xxxxxxxx"
            />
          </label>

          <div className="topup-keypad">
            {topupKeypad.map((digit) => (
              <button type="button" key={digit} onClick={() => appendTopupPhoneDigit(digit)}>
                {digit}
              </button>
            ))}
            <button type="button" className="danger" onClick={deleteTopupPhoneDigit}>
              Del
            </button>
            <button type="button" className="confirm" onClick={confirmTopupOrder}>
              Confirm
            </button>
          </div>

          <div className="topup-amount-block">
            <span>จำนวนเงิน</span>
            <div className="topup-quick-grid">
              {topupQuickAmounts.map((amount) => (
                <button
                  type="button"
                  key={amount}
                  className={Number(topupAmount) === amount ? 'active' : ''}
                  onClick={() => setTopupAmount(String(amount))}
                >
                  {amount}
                </button>
              ))}
            </div>
            <label className="field">
              <span>Custom</span>
              <input
                type="number"
                min="1"
                value={topupAmount}
                onChange={(event) => setTopupAmount(event.target.value)}
                onKeyDown={(event) => event.key === 'Enter' && confirmTopupOrder()}
              />
            </label>
          </div>

          <button className="primary-action" type="button" onClick={confirmTopupOrder}>
            <Icon name="check_circle" /> ยืนยันรายการ
          </button>
        </section>

        <section className="panel topup-orders-panel">
          <PanelTitle icon="list_alt" title="รายการเบอร์" detail={`${topupOrders.length} รายการ | รอเติม ${pendingTopupCount} | รอจ่าย ${unpaidTopupCount}`} />
          <div className="topup-summary-grid">
            <div>
              <span>ยอดรวม</span>
              <strong>{formatMoney(topupTotal)}</strong>
            </div>
            <div>
              <span>เติมแล้ว</span>
              <strong>{topupOrders.length - pendingTopupCount}</strong>
            </div>
            <div>
              <span>จ่ายแล้ว</span>
              <strong>{topupOrders.length - unpaidTopupCount}</strong>
            </div>
          </div>

          <div className="table-wrap topup-table">
            {topupOrders.length === 0 ? (
              <EmptyState text="ยังไม่มีรายการเติมเงิน" />
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>เวลา</th>
                    <th>ค่าย</th>
                    <th>เบอร์</th>
                    <th>จำนวน</th>
                    <th>เติมแล้ว</th>
                    <th>จ่ายแล้ว</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {topupOrders.map((order) => (
                    <tr key={order.id}>
                      <td>
                        <strong>{order.id}</strong>
                        <small>{formatReceiptDateTime(order.createdAt)}</small>
                      </td>
                      <td><span className={`topup-provider-badge ${order.provider.toLowerCase()}`}>{order.provider}</span></td>
                      <td><strong>{order.phone}</strong></td>
                      <td>{formatMoney(order.amount)}</td>
                      <td>
                        <button
                          type="button"
                          className={`topup-switch ${order.toppedUp ? 'active' : ''}`}
                          onClick={() => toggleTopupOrderStatus(order.id, 'toppedUp')}
                        >
                          <Icon name={order.toppedUp ? 'check_circle' : 'radio_button_unchecked'} />
                          {order.toppedUp ? 'เติมแล้ว' : 'ยังไม่เติม'}
                        </button>
                      </td>
                      <td>
                        <button
                          type="button"
                          className={`topup-switch ${order.paid ? 'active' : ''}`}
                          onClick={() => toggleTopupOrderStatus(order.id, 'paid')}
                        >
                          <Icon name={order.paid ? 'payments' : 'pending'} />
                          {order.paid ? 'จ่ายแล้ว' : 'ยังไม่จ่าย'}
                        </button>
                      </td>
                      <td>
                        <button className="link-button" type="button" onClick={() => removeTopupOrder(order.id)}>
                          ลบ
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>
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
    const periodLabel = analyticsPeriod === 'day'
      ? 'รายวัน'
      : analyticsPeriod === 'month'
        ? 'รายเดือน'
        : 'รายปี';

    return (
      <div className="analytics-page">
        <section className="analytics-toolbar panel">
          <div>
            <h2>Analytics Dashboard</h2>
            <p>{periodLabel} {analyticsRangeLabel} | {analyticsNotice}</p>
          </div>
          <div className="analytics-controls">
            <div className="segmented analytics-period-tabs">
              <button type="button" className={analyticsPeriod === 'day' ? 'active' : ''} onClick={() => setAnalyticsPeriod('day')}>รายวัน</button>
              <button type="button" className={analyticsPeriod === 'month' ? 'active' : ''} onClick={() => setAnalyticsPeriod('month')}>รายเดือน</button>
              <button type="button" className={analyticsPeriod === 'year' ? 'active' : ''} onClick={() => setAnalyticsPeriod('year')}>รายปี</button>
            </div>
            {analyticsPeriod === 'day' && (
              <label className="field compact">
                <span>วันที่</span>
                <input type="date" value={analyticsDate} onChange={(event) => setAnalyticsDate(event.target.value)} />
              </label>
            )}
            {analyticsPeriod === 'month' && (
              <label className="field compact">
                <span>เดือน</span>
                <input type="month" value={analyticsMonth} onChange={(event) => setAnalyticsMonth(event.target.value)} />
              </label>
            )}
            {analyticsPeriod === 'year' && (
              <label className="field compact">
                <span>ปี</span>
                <input type="number" min="2020" max="2100" value={analyticsYear} onChange={(event) => setAnalyticsYear(event.target.value)} />
              </label>
            )}
            <button className="primary-action" type="button" onClick={downloadAnalyticsExcel} disabled={isAnalyticsLoading}>
              <Icon name="file_download" /> ส่งออก Excel
            </button>
          </div>
        </section>

        <div className="metric-grid analytics-metric-grid">
          <div className="metric-card">
            <span>ยอดขายรวม</span>
            <strong>{formatMoney(analyticsTotal)}</strong>
            <small>{analyticsSaleCount} บิลในช่วงที่เลือก</small>
          </div>
          <div className="metric-card success">
            <span>บิลสำเร็จ</span>
            <strong>{analyticsSuccessfulCount}</strong>
            <small>ค้าง/กำลังดำเนินการ {analyticsPendingCount} บิล</small>
          </div>
          <div className="metric-card blue">
            <span>ยอดเฉลี่ยต่อบิล</span>
            <strong>{formatMoney(analyticsAverageBill)}</strong>
            <small>{analyticsItemCount} ชิ้นทั้งหมด</small>
          </div>
          <div className="metric-card warning">
            <span>ส่วนลดรวม</span>
            <strong>{formatMoney(analyticsDiscountTotal)}</strong>
            <small>จากรายการขายที่ถูก filter</small>
          </div>
          <div className="metric-card">
            <span>สินค้าใกล้หมด</span>
            <strong>{lowStockCount}</strong>
            <small>มูลค่าสต็อก {formatMoney(stockValue)}</small>
          </div>
        </div>

        <section className="analytics-channel-grid">
          {(['POS', 'GAS', 'LOTTERY'] as SaleChannel[]).map((channel) => {
            const summary = analyticsChannelTotals[channel];
            return (
              <div className="analytics-channel-card" key={channel}>
                <span className={`sale-channel ${saleChannelMeta[channel].className}`}>
                  <Icon name={saleChannelMeta[channel].icon} />
                  {saleChannelMeta[channel].label}
                </span>
                <strong>{formatMoney(summary.total)}</strong>
                <small>{summary.count} บิล</small>
              </div>
            );
          })}
        </section>

        <section className="analytics-dashboard-grid">
          <section className="panel">
            <PanelTitle icon="show_chart" title={`ยอดขายตาม${analyticsPeriod === 'day' ? 'ชั่วโมง' : analyticsPeriod === 'month' ? 'วัน' : 'เดือน'}`} detail={analyticsRange.startDate ? `${analyticsRange.startDate} ถึง ${analyticsRange.endDate}` : undefined} />
            <div className="bar-list analytics-trend-list">
              {analyticsTrendRows.length === 0 ? (
                <EmptyState text="ยังไม่มีรายการขายในช่วงนี้" />
              ) : analyticsTrendRows.map((row) => (
                <div key={row.key}>
                  <span>{row.label}</span>
                  <div><i style={{ width: `${Math.max(4, Math.round((row.total / analyticsMaxTrendTotal) * 100))}%` }}></i></div>
                  <b>{formatMoney(row.total)}</b>
                </div>
              ))}
            </div>
          </section>

          <section className="panel">
            <PanelTitle icon="bar_chart" title="หมวดขายดี" />
            <div className="bar-list">
              {categorySales.length === 0 ? (
                <EmptyState text="ยังไม่มีรายการขายในช่วงนี้" />
              ) : categorySales.map((item) => (
                <div key={item.label}>
                  <span>{item.label}</span>
                  <div><i style={{ width: `${item.percent}%` }}></i></div>
                  <b>{formatMoney(item.value)}</b>
                </div>
              ))}
            </div>
          </section>
        </section>

        <section className="analytics-side-grid">
          <section className="panel">
            <PanelTitle icon="payments" title="การชำระเงิน" />
            <div className="staff-performance-list">
              {analyticsPaymentTotals.length === 0 ? (
                <EmptyState text="ยังไม่มีรายการชำระเงินในช่วงนี้" />
              ) : analyticsPaymentTotals.map((payment) => (
                <div key={payment.method}>
                  <strong>{payment.method}</strong>
                  <span>{payment.count} บิล</span>
                  <b>{formatMoney(payment.total)}</b>
                </div>
              ))}
            </div>
          </section>

          <section className="panel">
            <PanelTitle icon="badge" title="ผลงานพนักงาน" detail={`${activeStaffCount} คนกำลังใช้งาน`} />
            <div className="staff-performance-list">
              {staffPerformance.length === 0 ? (
                <EmptyState text="ยังไม่มีรายการขายของพนักงานในช่วงนี้" />
              ) : staffPerformance.map((staff) => (
                <div key={staff.name}>
                  <strong>{staff.name}</strong>
                  <span>{staff.count} บิล</span>
                  <b>{formatMoney(staff.total)}</b>
                </div>
              ))}
            </div>
          </section>

          <section className="panel">
            <PanelTitle icon="inventory" title="ความเสี่ยงสต็อก" detail={`หวยคงเหลือ ${formatMoney(possibleLotteryRevenue)}`} />
            <div className="risk-list">
              {stockItems
                .filter((item) => item.stock <= item.minStock)
                .slice(0, 6)
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
        </section>

        <section className="panel analytics-sales-panel">
          <PanelTitle icon="receipt_long" title="ทุกรายการขาย" detail={`${analyticsSales.length} รายการ | ${periodLabel} ${analyticsRangeLabel}`} />
          <div className="analytics-sales-table">
            {analyticsSales.length === 0 ? (
              <EmptyState text="ยังไม่มีรายการขายในช่วงนี้" />
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>วันที่เวลา</th>
                    <th>ช่องทาง</th>
                    <th>เลขที่</th>
                    <th>ลูกค้า</th>
                    <th>ผู้รับผิดชอบ</th>
                    <th>จำนวนชิ้น</th>
                    <th>สถานะ</th>
                    <th>ยอดสุทธิ</th>
                  </tr>
                </thead>
                <tbody>
                  {analyticsSales.map((sale) => (
                    <tr key={sale.id}>
                      <td>{formatReceiptDateTime(sale.createdAt)}</td>
                      <td>
                        <span className={`sale-channel ${saleChannelMeta[sale.channel].className}`}>
                          <Icon name={saleChannelMeta[sale.channel].icon} />
                          {saleChannelMeta[sale.channel].label}
                        </span>
                      </td>
                      <td>
                        <strong>{sale.id}</strong>
                        <small>{sale.items.reduce((sum, item) => sum + item.quantity, 0)} รายการ</small>
                      </td>
                      <td>{sale.customerName}</td>
                      <td>{sale.staffName}</td>
                      <td>{sale.items.reduce((sum, item) => sum + item.quantity, 0)}</td>
                      <td>
                        <span className={`badge ${sale.status === 'สำเร็จ' || sale.status === 'เสร็จแล้ว' ? 'success' : 'warning'}`}>
                          {sale.status}
                        </span>
                      </td>
                      <td><strong>{formatMoney(sale.total)}</strong></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
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

        <section className="panel wide-panel lottery-stock-panel">
          <PanelTitle icon="confirmation_number" title="Stock หวย" detail={lotteryStockNotice} />
          <div className="lottery-stock-form">
            <label className="field">
              <span>เลขหวย</span>
              <input
                value={lotteryStockDraft.number}
                maxLength={6}
                onChange={(event) =>
                  setLotteryStockDraft({ ...lotteryStockDraft, number: event.target.value.replace(/\D/g, '').slice(0, 6) })
                }
                onKeyDown={(event) => event.key === 'Enter' && addManualLotteryStock()}
                placeholder="เช่น 123456"
              />
            </label>
            <label className="field">
              <span>จำนวน</span>
              <input
                type="number"
                min="1"
                step="1"
                value={lotteryStockDraft.quantity}
                onChange={(event) => setLotteryStockDraft({ ...lotteryStockDraft, quantity: event.target.value })}
              />
            </label>
            <label className="field">
              <span>ราคา</span>
              <input
                type="number"
                min="1"
                value={lotteryStockDraft.price}
                onChange={(event) => setLotteryStockDraft({ ...lotteryStockDraft, price: event.target.value })}
              />
            </label>
            <button className="primary-action" type="button" onClick={addManualLotteryStock}>
              <Icon name="add" /> เพิ่มเลขหวย
            </button>
          </div>

          <div className="table-wrap lottery-stock-table">
            {lotteryTickets.length === 0 ? (
              <EmptyState text="ยังไม่มี stock หวย" />
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>เลข</th>
                    <th>ชุด</th>
                    <th>จำนวนคงเหลือ</th>
                    <th>ราคา</th>
                    <th>สถานะ</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {lotteryTickets.map((ticket) => (
                    <tr key={`${ticket.number}-${ticket.series}`}>
                      <td><strong>{ticket.number}</strong></td>
                      <td>{ticket.series}</td>
                      <td>{ticket.remaining} ใบ</td>
                      <td>{formatMoney(ticket.price)}</td>
                      <td>
                        <span className={`badge ${ticket.remaining > 0 ? 'success' : 'warning'}`}>
                          {ticket.remaining > 0 ? 'พร้อมขาย' : 'หมด'}
                        </span>
                      </td>
                      <td>
                        <button className="link-button" type="button" onClick={() => removeManualLotteryStock(ticket.number)}>
                          ลบ
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
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
      case 'TOPUP':
        return renderTopupPage();
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
          <span>Session</span>
          <strong>{scanSessionId}</strong>
        </div>
      </aside>

      <div className="main-shell">
        <header className="topbar">
          <div>
            <h1>{viewMeta[currentView].title}</h1>
            <p>{viewMeta[currentView].subtitle}</p>
          </div>
          <div className="topbar-actions">
            <span>{scanSessionId}</span>
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
