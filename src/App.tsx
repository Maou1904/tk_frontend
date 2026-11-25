import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import axios from 'axios';
import { BrowserMultiFormatReader } from '@zxing/browser';
import type { IScannerControls } from '@zxing/browser';
import { BarcodeFormat, DecodeHintType } from '@zxing/library';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { QRCodeSVG } from 'qrcode.react';
import type { CartItem } from './types';
import TransferPage from './components/TransferPage';
import PurchaseOrders from './components/PurchaseOrders';
import TaxDashboard from './components/TaxDashboard';
import StockDocuments from './components/StockDocuments';
import WarehouseStock from './components/WarehouseStock';
import StoreSettingsPage from './components/StoreSettingsPage';
import GasVoiceInput from './components/GasVoiceInput';
import { gasSizeFromName, parseGasVoice, resolveVoiceGasOrder } from './gasVoice';
import { baht, errorText } from './storeOperations';
import type { StoreSettings, TransferTotals, Transfer } from './storeOperations';
import { summarizeTransfers, analyticsBucket } from './analytics';
import { lotteryStockLevel, LOTTERY_PENDING } from './lotteryStock';
import './App.css';
import './operations.css';

type View = 'POS' | 'GAS' | 'LOTTERY' | 'TOPUP' | 'TRANSFER' | 'HISTORY' | 'ANALYTICS' | 'STOCK' | 'STAFF' | 'SETTINGS' | 'CLOSING';
type PaymentMethod = 'เงินสด' | 'PromptPay';
type PosAmountField = 'cash' | 'discount';
type SaleChannel = 'POS' | 'GAS' | 'LOTTERY' | 'TOPUP';
type AnalyticsPeriod = 'day' | 'month' | 'year';
type MobileTopupProvider = 'AIS' | 'TRUE' | 'DTAC';
type AppRole = 'owner' | 'user';

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
  id?: string;
  productId?: string;
  ticketId?: string;
  number?: string;
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
  status: string;
  submittedBy?: number;
  submittedByName?: string;
  reportedCashReceived?: number;
  confirmedByName?: string;
  confirmedAt?: string;
  items: SaleRecordItem[];
  subtotal: number;
  discount: number;
  total: number;
  cashReceived: number;
  change: number;
  note?: string;
  cancelReason?: string;
  cancelledAt?: Date;
}

type DetectedBarcode = {
  rawValue?: string;
};

type BarcodeDetectorLike = {
  detect: (source: CanvasImageSource) => Promise<DetectedBarcode[]>;
};

type BarcodeDetectorConstructor = new (options?: { formats?: string[] }) => BarcodeDetectorLike;
type CameraDeviceOption = {
  deviceId: string;
  label: string;
  score: number;
};
type BarcodeTrackCapabilities = MediaTrackCapabilities & {
  focusMode?: string[];
  zoom?: { min?: number; max?: number; step?: number };
};
type BarcodeTrackConstraintSet = MediaTrackConstraintSet & {
  focusMode?: string;
  zoom?: number;
};

const BARCODE_DETECTOR_FORMATS = ['ean_13', 'ean_8', 'code_128', 'code_39', 'upc_a', 'upc_e', 'qr_code'];
const ZXING_BARCODE_FORMATS = [
  BarcodeFormat.EAN_13,
  BarcodeFormat.EAN_8,
  BarcodeFormat.CODE_128,
  BarcodeFormat.CODE_39,
  BarcodeFormat.CODE_93,
  BarcodeFormat.UPC_A,
  BarcodeFormat.UPC_E,
  BarcodeFormat.ITF,
  BarcodeFormat.QR_CODE,
];
const BARCODE_CAMERA_ZOOM = 2;

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

interface ProductRegistrationRequest {
  id: number;
  barcode: string;
  name: string;
  price: number | string;
  cost: number | string;
  stock: number;
  category: string;
  minStock?: number;
  min_stock?: number;
  unit: string;
  status: 'PENDING' | 'ACCEPTED' | 'REJECTED' | string;
  requestedBy?: number | null;
  requestedByName: string;
  reviewedBy?: number | null;
  reviewedByName?: string;
  acceptedProductId?: number | null;
  reviewReason?: string;
  createdAt: string;
  reviewedAt?: string | null;
}

interface CartSessionResponse {
  session_id: string;
  items: CartItem[];
}

interface AppSessionResponse {
  session_id: string;
  business_date: string;
  status: 'PENDING_OPEN' | 'OPEN' | 'CLOSED' | string;
  openedAt?: string | null;
  closedAt?: string | null;
  previousClosedSession?: AppSessionResponse | null;
}

type ClosingSection = 'POS' | 'GAS' | 'LOTTERY' | 'TOPUP' | 'TRANSFER' | 'STOCK';

interface ClosingCheck {
  section: ClosingSection;
  confirmed: boolean;
  confirmedAt?: string | null;
  confirmedBy?: string;
  note?: string;
}

type GasStockKind = 'FULL' | 'EMPTY';
type GasBrand = 'สยาม' | 'ปตท';
const GAS_BRANDS: readonly GasBrand[] = ['สยาม', 'ปตท'];

interface ClosingSummary {
  session: AppSessionResponse;
  previousClosedSession?: AppSessionResponse | null;
  checks: ClosingCheck[];
  readyToClose: boolean;
  sections: {
    transfers?: TransferTotals;
    pos: {
      billCount: number;
      itemCount: number;
      subtotal: number;
      discount: number;
      total: number;
      items: Array<{ name: string; barcode: string; quantity: number; total: number }>;
    };
    gas: {
      jobCount: number;
      soldQuantity: number;
      returnedQuantity: number;
      pendingReturnQuantity: number;
      total: number;
      deliveryFeeTotal: number;
      serviceStats?: {
        paidJobs: number;
        unpaidJobs: number;
        fullyReturnedJobs: number;
        pendingReturnJobs: number;
        completedJobs: number;
        openJobs: number;
      };
      items: Array<{ id: string; name: string; operation: string; quantity: number; total: number }>;
      pendingReturns: Array<{ id: string; tankName: string; quantity: number }>;
      tankBalance: Array<{
        id: string;
        name: string;
        operation: string;
        openingStock: number;
        openingFullStock?: number;
        openingEmptyStock?: number;
        openingTotalStock?: number;
        currentStock: number;
        currentFullStock?: number;
        currentEmptyStock?: number;
        currentTotalStock?: number;
        soldQuantity: number;
        returnedQuantity: number;
        adjustedQuantity: number;
        adjustedFullQuantity?: number;
        adjustedEmptyQuantity?: number;
        pendingQuantity: number;
        expectedMissing: number;
        status: 'BALANCED' | 'PENDING_RETURN' | 'MISMATCH' | string;
      }>;
    };
    lottery: {
      billCount: number;
      ticketCount: number;
      total: number;
      items: Array<{ number: string; quantity: number; total: number }>;
    };
    topup: {
      orderCount: number;
      total: number;
      providers: Array<{
        provider: MobileTopupProvider;
        orderCount: number;
        total: number;
        paidTotal: number;
        unpaidTotal: number;
        toppedUpCount: number;
        paidCount: number;
      }>;
    };
    stock: {
      movementCount: number;
      movements: Array<{ itemType: string; itemName: string; netDelta: number; movementCount: number }>;
      lowProducts: ApiProduct[];
    };
  };
}

interface ApiGasItem {
  id: string;
  brand?: GasBrand | '';
  name: string;
  operation: GasItem['operation'];
  price: number | string;
  stock?: number | string;
  fullStock?: number | string;
  full_stock?: number | string;
  emptyStock?: number | string;
  empty_stock?: number | string;
  totalStock?: number | string;
  total_stock?: number | string;
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
  transfers?: Transfer[];
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

interface AuthUser {
  id: number;
  username: string;
  displayName: string;
  role: AppRole;
  active: boolean;
}

interface AuthSession {
  token: string;
  expiresAt: string;
  user: AuthUser;
}

type LoginResponse = AuthSession;

interface ChangePasswordResponse {
  ok: boolean;
  user: AuthUser;
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
  brand: GasBrand | '';
  name: string;
  operation: string;
  price: number;
  stock: number;
  fullStock: number;
  emptyStock: number;
  totalStock: number;
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
  status: string;
  createdAt: string;
}

interface LotteryTicket {
  id: number;
  number: string;
  series: string;
  price: number;
  remaining: number;
  stockReference?: number;
  active?: boolean;
}

interface MobileTopupOrder {
  id: string;
  provider: MobileTopupProvider;
  phone: string;
  amount: number;
  toppedUp: boolean;
  paid: boolean;
  createdAt: Date;
  status?: string;
  cancelReason?: string;
}

interface StockAdjustment {
  id: string;
  productName: string;
  itemType?: string;
  itemId?: string;
  stockKind?: string;
  delta: number;
  reason: string;
  staffName: string;
  createdAt: string | Date;
  date: string;
  sourceType?: string;
  sourceId?: string;
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

const viewMeta: Record<View, { icon: string; title: string; subtitle: string }> = {
  POS: { icon: 'point_of_sale', title: 'ขายหน้าร้าน', subtitle: 'สแกนสินค้าและคิดเงิน' },
  TRANSFER: { icon: 'currency_exchange', title: 'รับโอนเงิน', subtitle: 'บันทึกเงินสดที่รับเพื่อโอนให้ลูกค้า' },
  GAS: { icon: 'propane_tank', title: 'ขายแก๊ส', subtitle: 'จัดคิวส่งและติดตามถังคืน' },
  LOTTERY: { icon: 'confirmation_number', title: 'สลาก', subtitle: 'ขายสลากจากเลขในสต็อก' },
  TOPUP: { icon: 'phone_iphone', title: 'เติมเงิน', subtitle: 'บันทึกและติดตามการเติมเงินมือถือ' },
  HISTORY: { icon: 'receipt_long', title: 'ประวัติขาย', subtitle: 'ค้นบิลและตรวจรายละเอียดการขาย' },
  ANALYTICS: { icon: 'monitoring', title: 'แดชบอร์ด', subtitle: 'ภาพรวมร้านและรายงานประจำเดือน' },
  STOCK: { icon: 'inventory_2', title: 'สต็อก', subtitle: 'จัดการสินค้าและใบสั่งซื้อ' },
  STAFF: { icon: 'badge', title: 'พนักงาน', subtitle: 'จัดการพนักงานและบัญชีผู้ใช้' },
  SETTINGS: { icon: 'settings', title: 'ตั้งค่า', subtitle: 'จัดการค่าเริ่มต้นหน้าร้าน' },
  CLOSING: { icon: 'lock_clock', title: 'รอบขาย', subtitle: 'เปิดร้าน ตรวจยอด และปิดร้าน' },
};
const navigationGroups: { label: string; views: Exclude<View, 'CLOSING'>[] }[] = [
  { label: 'หน้าร้าน', views: ['POS', 'TRANSFER', 'GAS', 'LOTTERY', 'TOPUP'] },
  { label: 'จัดการร้าน', views: ['HISTORY', 'ANALYTICS', 'STOCK', 'STAFF', 'SETTINGS'] },
];

const saleChannelMeta: Record<SaleChannel, { icon: string; label: string; className: string }> = {
  POS: { icon: 'point_of_sale', label: 'POS', className: 'pos' },
  GAS: { icon: 'propane_tank', label: 'แก๊ส', className: 'gas' },
  LOTTERY: { icon: 'confirmation_number', label: 'หวย', className: 'lottery' },
  TOPUP: { icon: 'phone_iphone', label: 'Topup', className: 'topup' },
};

const saleChannels: SaleChannel[] = ['POS', 'GAS', 'LOTTERY', 'TOPUP'];
const paymentMethods: PaymentMethod[] = ['เงินสด', 'PromptPay'];
const topupProviders: MobileTopupProvider[] = ['AIS', 'TRUE', 'DTAC'];
const topupQuickAmounts = [20, 50, 100, 150, 200, 300, 500, 1000];
const topupKeypad = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];
const closingSectionMeta: Record<ClosingSection, { icon: string; label: string }> = {
  POS: { icon: 'point_of_sale', label: 'สินค้า POS' },
  GAS: { icon: 'propane_tank', label: 'แก๊ส' },
  LOTTERY: { icon: 'confirmation_number', label: 'หวย' },
  TOPUP: { icon: 'phone_iphone', label: 'เติมเงิน' },
  TRANSFER: { icon: 'currency_exchange', label: 'รับโอนเงิน' },
  STOCK: { icon: 'inventory_2', label: 'สต็อกประจำวัน' },
};
const todayLabel = new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeZone: 'Asia/Bangkok' }).format(new Date());
const storageKeys = {
  appSessionId: 'tingkum.appSessionId.v1',
  deviceId: 'tingkum.deviceId.v1',
} as const;
const authSessionKey = 'tingkum.authSession.v1';
const compactPosQuery = '(max-width: 1024px), (max-width: 1440px) and (any-pointer: coarse)';

function getApiBaseUrl() {
  const configuredApiBaseUrl = import.meta.env.VITE_API_BASE_URL;
  if (configuredApiBaseUrl) {
    return configuredApiBaseUrl.replace(/\/$/, '');
  }

  const apiPort = import.meta.env.VITE_API_PORT || '5000';
  if (typeof window === 'undefined') {
    return `http://localhost:${apiPort}`;
  }

  const host = window.location.hostname;
  const apiHost = host && host !== '127.0.0.1' ? host : 'localhost';
  return `http://${apiHost}:${apiPort}`;
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

function getCameraUnavailableNotice() {
  if (typeof window !== 'undefined' && window.isSecureContext === false) {
    return 'เปิดกล้องไม่ได้ ต้องเปิด POS ผ่าน HTTPS หรือ localhost ก่อน browser ถึงจะอนุญาตให้ใช้กล้อง';
  }

  if (!navigator.mediaDevices?.getUserMedia) {
    return 'Browser นี้ยังไม่เปิดกล้องจากหน้านี้ได้ ใช้ช่องกรอกบาร์โค้ดแทน';
  }

  return '';
}

function getCameraErrorNotice(error: unknown) {
  if (error instanceof DOMException) {
    if (error.name === 'NotAllowedError' || error.name === 'SecurityError') {
      return 'เปิดกล้องไม่ได้ เพราะยังไม่ได้อนุญาตสิทธิ์กล้องใน browser';
    }

    if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
      return 'ไม่พบกล้องบนอุปกรณ์นี้ ใช้ช่องกรอกบาร์โค้ดแทน';
    }

    if (error.name === 'NotReadableError' || error.name === 'TrackStartError') {
      return 'เปิดกล้องไม่ได้ เพราะกล้องถูกใช้งานอยู่หรือระบบไม่พร้อม';
    }

    if (error.name === 'OverconstrainedError') {
      return 'เปิดกล้องตัวที่เลือกไม่ได้ ลองกด Scan ใหม่เพื่อใช้กล้องหลัง default';
    }
  }

  return 'เปิดกล้องไม่ได้ ตรวจ permission ของ browser';
}

function createZxingReader() {
  const hints = new Map<DecodeHintType, unknown>();
  hints.set(DecodeHintType.POSSIBLE_FORMATS, ZXING_BARCODE_FORMATS);
  hints.set(DecodeHintType.TRY_HARDER, true);

  return new BrowserMultiFormatReader(hints, {
    delayBetweenScanAttempts: 150,
    delayBetweenScanSuccess: 500,
    tryPlayVideoTimeout: 5000,
  });
}

function scoreCameraDevice(label: string, index: number) {
  const normalizedLabel = label.toLowerCase();
  let score = -index / 100;

  if (/back|rear|environment|หลัง|ด้านหลัง/.test(normalizedLabel)) {
    score += 80;
  }

  if (/front|user|facetime|หน้า|ด้านหน้า/.test(normalizedLabel)) {
    score -= 120;
  }

  if (/ultra|0\.5|0,5|wide angle|wide-angle|fisheye|fish eye/.test(normalizedLabel)) {
    score -= 70;
  }

  if (/main|standard|default|normal|back camera$|rear camera$/.test(normalizedLabel)) {
    score += 25;
  }

  if (/macro/.test(normalizedLabel)) {
    score += 15;
  }

  return score;
}

async function listPreferredCameraDevices() {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.enumerateDevices) {
    return [];
  }

  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices
    .filter((device) => device.kind === 'videoinput')
    .map((device, index) => {
      const label = device.label || `Camera ${index + 1}`;
      return {
        deviceId: device.deviceId,
        label,
        score: scoreCameraDevice(device.label, index),
      };
    })
    .sort((first, second) => second.score - first.score);
}

function createCameraStreamConstraints(deviceId = ''): MediaStreamConstraints {
  const video: MediaTrackConstraints = {
    width: { ideal: 1280 },
    height: { ideal: 720 },
  };

  if (deviceId) {
    video.deviceId = { exact: deviceId };
  } else {
    video.facingMode = { ideal: 'environment' };
  }

  return { video, audio: false };
}

function getStreamCameraDeviceId(stream: MediaStream) {
  return stream.getVideoTracks()[0]?.getSettings().deviceId ?? '';
}

function getCameraLabel(devices: CameraDeviceOption[], deviceId: string) {
  return devices.find((device) => device.deviceId === deviceId)?.label || 'กล้องหลัง';
}

function getPreferredCameraSwitch(devices: CameraDeviceOption[], currentDeviceId: string, requestedDeviceId: string) {
  if (requestedDeviceId || devices.length < 2) {
    return null;
  }

  const preferredDevice = devices[0];
  const currentDevice = devices.find((device) => device.deviceId === currentDeviceId);
  if (!preferredDevice || preferredDevice.deviceId === currentDeviceId) {
    return null;
  }

  if (!currentDevice && preferredDevice.score > 20) {
    return preferredDevice;
  }

  if (currentDevice && preferredDevice.score >= currentDevice.score + 20) {
    return preferredDevice;
  }

  return null;
}

async function tuneBarcodeCameraStream(stream: MediaStream) {
  const track = stream.getVideoTracks()[0];
  if (!track?.getCapabilities || !track.applyConstraints) {
    return;
  }

  const capabilities = track.getCapabilities() as BarcodeTrackCapabilities;
  const advanced: BarcodeTrackConstraintSet[] = [];

  if (capabilities.focusMode?.includes('continuous')) {
    advanced.push({ focusMode: 'continuous' });
  }

  const zoom = capabilities.zoom;
  if (zoom && typeof zoom.min === 'number' && typeof zoom.max === 'number' && zoom.max > 1) {
    const zoomTarget = Math.min(Math.max(BARCODE_CAMERA_ZOOM, zoom.min), zoom.max);
    advanced.push({ zoom: zoomTarget });
  }

  if (advanced.length === 0) {
    return;
  }

  try {
    await track.applyConstraints({ advanced } as MediaTrackConstraints);
  } catch {
    // Some mobile browsers expose zoom/focus capabilities but reject applying them.
  }
}

const API_BASE_URL = getApiBaseUrl();

function formatMoney(value: number) {
  return new Intl.NumberFormat('th-TH', {
    style: 'currency',
    currency: 'THB',
    maximumFractionDigits: 2,
  }).format(value);
}

function isCompletedStatus(status: string) {
  return ['completed', 'done', 'success', 'สำเร็จ', 'เสร็จแล้ว'].includes(status.toLowerCase());
}

function isCancelledStatus(status: string) {
  return status.toLowerCase() === 'cancelled' || status === 'ยกเลิก';
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

function readAuthSession(): AuthSession | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const rawValue = window.sessionStorage.getItem(authSessionKey);
    if (!rawValue) {
      return null;
    }

    const parsed = JSON.parse(rawValue) as AuthSession;
    if (!parsed?.token || !parsed?.user || new Date(parsed.expiresAt).getTime() <= Date.now()) {
      window.sessionStorage.removeItem(authSessionKey);
      return null;
    }

    return parsed;
  } catch {
    window.sessionStorage.removeItem(authSessionKey);
    return null;
  }
}

function writeAuthSession(session: AuthSession | null) {
  if (typeof window === 'undefined') {
    return;
  }

  if (!session) {
    window.sessionStorage.removeItem(authSessionKey);
    return;
  }

  window.sessionStorage.setItem(authSessionKey, JSON.stringify(session));
}

function normalizeAuthUser(user: AuthUser): AuthUser {
  return {
    id: Number(user.id),
    username: user.username,
    displayName: user.displayName,
    role: user.role === 'owner' ? 'owner' : 'user',
    active: Boolean(user.active),
  };
}

function normalizeSaleRecord(record: ApiSaleRecord | SaleRecord): SaleRecord {
  return {
    ...record,
    createdAt: new Date(record.createdAt),
    cancelledAt: record.cancelledAt ? new Date(record.cancelledAt) : undefined,
    subtotal: Number(record.subtotal),
    discount: Number(record.discount),
    total: Number(record.total),
    cashReceived: Number(record.cashReceived),
    change: Number(record.change),
    items: record.items.map((item) => ({
      ...item,
      id: item.id === undefined ? undefined : String(item.id),
      productId: item.productId === undefined ? undefined : String(item.productId),
      ticketId: item.ticketId === undefined ? undefined : String(item.ticketId),
      quantity: Number(item.quantity),
      price: Number(item.price),
      discount: Number(item.discount ?? 0),
    })),
  };
}

function normalizeLotteryTicket(ticket: LotteryTicket): LotteryTicket {
  return {
    id: Number(ticket.id),
    number: ticket.number,
    series: ticket.series || 'Manual',
    price: Number(ticket.price),
    remaining: Number(ticket.remaining),
    stockReference: Number(ticket.stockReference ?? ticket.remaining),
    active: ticket.active ?? true,
  };
}

function normalizeTopupOrder(order: MobileTopupOrder): MobileTopupOrder {
  return {
    ...order,
    amount: Number(order.amount),
    toppedUp: Boolean(order.toppedUp),
    paid: Boolean(order.paid),
    createdAt: new Date(order.createdAt),
  };
}

function normalizeStockMovement(log: StockAdjustment): StockAdjustment {
  const createdAt = new Date(log.createdAt);
  return {
    ...log,
    id: String(log.id),
    stockKind: log.stockKind ?? 'GENERAL',
    delta: Number(log.delta),
    createdAt,
    date: log.date || dateInputValue(createdAt),
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

function normalizeProductRegistrationRequest(request: ProductRegistrationRequest): ProductRegistrationRequest {
  return {
    ...request,
    id: Number(request.id),
    price: Number(request.price),
    cost: Number(request.cost),
    stock: Number(request.stock),
    minStock: Number(request.minStock ?? request.min_stock ?? 5),
    requestedBy: request.requestedBy ?? null,
    reviewedBy: request.reviewedBy ?? null,
    acceptedProductId: request.acceptedProductId ?? null,
  };
}

function normalizeGasItem(item: ApiGasItem): GasItem {
  const fullStock = Number(item.fullStock ?? item.full_stock ?? item.stock ?? 0);
  const emptyStock = Number(item.emptyStock ?? item.empty_stock ?? 0);
  const totalStock = Number(item.totalStock ?? item.total_stock ?? fullStock + emptyStock);
  return {
    id: item.id,
    brand: item.brand === 'สยาม' || item.brand === 'ปตท' ? item.brand : '',
    name: item.name,
    operation: item.operation,
    price: Number(item.price),
    stock: fullStock,
    fullStock,
    emptyStock,
    totalStock,
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

function dateInputValue(date: Date) {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
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
  return currentDateInput().slice(0, 4);
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

function PanelTitle({ icon, title, detail, actions }: { icon: string; title: string; detail?: string; actions?: ReactNode }) {
  return (
    <div className="panel-title">
      <div>
        <h3><Icon name={icon} /> {title}</h3>
        {detail && <p>{detail}</p>}
      </div>
      {actions && <div className="panel-title-actions">{actions}</div>}
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return <div className="empty-state">{text}</div>;
}

export default function App() {
  const queryParams = typeof window === 'undefined' ? new URLSearchParams() : new URLSearchParams(window.location.search);
  const sessionFromUrl = queryParams.get('session') || '';
  const pageScrollRef = useRef<HTMLElement | null>(null);
  const barcodeInputRef = useRef<HTMLInputElement>(null);
  const posCheckoutRef = useRef<HTMLDialogElement>(null);
  const scannerVideoRef = useRef<HTMLVideoElement>(null);
  const scannerStreamRef = useRef<MediaStream | null>(null);
  const scannerFrameRef = useRef<number | null>(null);
  const scannerControlsRef = useRef<IScannerControls | null>(null);
  const requestedCameraDeviceIdRef = useRef('');
  const activeCameraDeviceIdRef = useRef('');
  const handledPrintRequestIdsRef = useRef<Set<number>>(new Set());

  const gasKeyboardScrollTopRef = useRef<number | null>(null);
  const [authSession, setAuthSession] = useState<AuthSession | null>(() => readAuthSession());
  const [loginForm, setLoginForm] = useState({ username: 'owner', password: '' });
  const [loginNotice, setLoginNotice] = useState('เข้าสู่ระบบก่อนใช้งาน');
  const [passwordPanelOpen, setPasswordPanelOpen] = useState(false);
  const [passwordResetTarget, setPasswordResetTarget] = useState<AuthUser>();
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [passwordSaved, setPasswordSaved] = useState(false);
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [staffTab, setStaffTab] = useState<'staff' | 'accounts'>('staff');
  const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [passwordNotice, setPasswordNotice] = useState('เปลี่ยนรหัสผ่านของบัญชีที่กำลังใช้งาน');
  const [users, setUsers] = useState<AuthUser[]>([]);
  const [userForm, setUserForm] = useState({ username: '', displayName: '', password: '', role: 'user' as AppRole });
  const [scanSessionId, setScanSessionId] = useState(() => sessionFromUrl || createDailySessionId());
  const [deviceId] = useState(() => readStoredValue(storageKeys.deviceId, createDeviceId()));
  const [isMobileViewport, setIsMobileViewport] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia('(max-width: 560px)').matches,
  );
  const [isCompactPos, setIsCompactPos] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia(compactPosQuery).matches,
  );
  const [checkoutStep, setCheckoutStep] = useState(0);
  const [amountBuffer, setAmountBuffer] = useState('');
  const [gasStep, setGasStep] = useState<'selection' | 'delivery'>('selection');
  const [lotteryTab, setLotteryTab] = useState<'keypad' | 'map'>('map');
  const [lotteryCheckoutBusy, setLotteryCheckoutBusy] = useState(false);
  const [lotteryApprovalBusy, setLotteryApprovalBusy] = useState('');
  const [lotteryApprovalCash, setLotteryApprovalCash] = useState<Record<string, string>>({});
  const [gasBrand, setGasBrand] = useState<GasBrand | ''>('');
  const [posCheckoutOpen, setPosCheckoutOpen] = useState(false);
  const [posAmountField, setPosAmountField] = useState<PosAmountField | null>(null);
  const [mobileScannerOpen, setMobileScannerOpen] = useState(false);
  const [scannerBarcode, setScannerBarcode] = useState('');
  const [scannerNotice, setScannerNotice] = useState('พร้อมส่งบาร์โค้ดเข้าหน้า POS');
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraDevices, setCameraDevices] = useState<CameraDeviceOption[]>([]);
  const [activeCameraLabel, setActiveCameraLabel] = useState('');
  const [sessionQrOpen, setSessionQrOpen] = useState(false);
  const [currentView, setCurrentView] = useState<View>('POS');
  const [dashboardTab, setDashboardTab] = useState<'sales' | 'tax'>('sales');
  const [stockTab, setStockTab] = useState<'products' | 'orders' | 'issue' | 'count'>('products');
  const [storeSettings, setStoreSettings] = useState<StoreSettings>();
  const [productEdit, setProductEdit] = useState<{ id: number; name: string; barcode: string; price: string }>();
  const [productEditBusy, setProductEditBusy] = useState(false);
  const [productEditError, setProductEditError] = useState('');
  const [apiStatus, setApiStatus] = useState('กำลังโหลดสินค้าใน tingkum_db');
  const [appSession, setAppSession] = useState<AppSessionResponse | null>(null);
  const [closingSummary, setClosingSummary] = useState<ClosingSummary | null>(null);
  const [previousClosingSummary, setPreviousClosingSummary] = useState<ClosingSummary | null>(null);
  const [closingNotice, setClosingNotice] = useState('โหลดสถานะร้านจาก tingkum_db');
  const [isClosingLoading, setIsClosingLoading] = useState(false);
  const [stockItems, setStockItems] = useState<Product[]>([]);
  const [staffMembers, setStaffMembers] = useState<StaffMember[]>([]);

  const [posCart, setPosCart] = useState<CartItem[]>([]);
  const [barcodeInput, setBarcodeInput] = useState('');
  const [cashierId, setCashierId] = useState('');
  const [posPayment] = useState<PaymentMethod>('เงินสด');
  const [cashReceived, setCashReceived] = useState(0);
  const [billDiscount, setBillDiscount] = useState(0);
  const [posNotice, setPosNotice] = useState('พร้อมขาย');
  const [isPrintingReceipt, setIsPrintingReceipt] = useState(false);
  const [unknownBarcode, setUnknownBarcode] = useState('');
  const [productRegistrationRequests, setProductRegistrationRequests] = useState<ProductRegistrationRequest[]>([]);
  const [productRequestNotice, setProductRequestNotice] = useState('');
  const [isReviewingProductRequest, setIsReviewingProductRequest] = useState(false);
  const [newProductDraft, setNewProductDraft] = useState<NewProductDraft>({
    barcode: '',
    name: '',
    price: '',
    stock: '1',
    category: 'ทั่วไป',
    minStock: '5',
    unit: 'ชิ้น',
  });
  const [stockProductDraft, setStockProductDraft] = useState<NewProductDraft>({
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
  const [gasVoiceBusy, setGasVoiceBusy] = useState(false);
  const [gasVoiceSession, setGasVoiceSession] = useState(0);
  const [gasDriverId, setGasDriverId] = useState('');
  const [gasJobs, setGasJobs] = useState<GasJob[]>([]);
  const [pendingGasReturns, setPendingGasReturns] = useState<PendingGasReturn[]>([]);
  const [gasNotice, setGasNotice] = useState('กำลังโหลดข้อมูลแก๊สจาก tingkum_db');
  const [gasReturnedTankQuantity, setGasReturnedTankQuantity] = useState(0);
  const [gasPaid, setGasPaid] = useState(true);
  const [gasFeeOverride, setGasDeliveryFee] = useState<number | null>(null);
  const gasDeliveryFee = gasFeeOverride ?? (storeSettings?.gasDeliveryFee ?? 2000) / 100;
  const [gasPendingReturnQuantities, setGasPendingReturnQuantities] = useState<Record<string, number>>({});
  const [gasItemDraft, setGasItemDraft] = useState({
    id: '',
    brand: '' as GasBrand | '',
    name: '',
    operation: 'ขายแก๊ส',
    price: '',
    fullStock: '1',
    emptyStock: '0',
    imageUrl: '',
  });
  const [gasCorrectionItemId, setGasCorrectionItemId] = useState('');
  const [gasCorrectionStockKind, setGasCorrectionStockKind] = useState<GasStockKind>('FULL');
  const [gasCorrectionDelta, setGasCorrectionDelta] = useState('1');
  const [gasCorrectionReason, setGasCorrectionReason] = useState('');

  const [lotteryInput, setLotteryInput] = useState('');
  const [lotteryTickets, setLotteryTickets] = useState<LotteryTicket[]>([]);
  const [lotteryCart, setLotteryCart] = useState<CartItem[]>([]);
  const [lotteryPayment, setLotteryPayment] = useState<PaymentMethod>('เงินสด');
  const [lotteryReceived, setLotteryReceived] = useState(0);
  const [lotteryNotice, setLotteryNotice] = useState('ค้นหาเลข 6 หลักจากสต็อก');
  const [receivingBook, setReceivingBook] = useState(false);
  const [lotteryStockDraft, setLotteryStockDraft] = useState({ number: '', quantity: '1', price: '100' });
  const [lotteryStockNotice, setLotteryStockNotice] = useState('เพิ่มเลขหวยแบบ manual ก่อนเชื่อมระบบสต็อกหวยจริง');
  const [topupTab, setTopupTab] = useState<'entry' | 'orders'>('entry');
  const [topupProvider, setTopupProvider] = useState<MobileTopupProvider>('AIS');
  const [topupPhone, setTopupPhone] = useState('');
  const [topupAmountOverride, setTopupAmount] = useState<string | null>(null);
  const topupAmount = topupAmountOverride ?? String((storeSettings?.topupAmount ?? 10000) / 100);
  const [topupOrders, setTopupOrders] = useState<MobileTopupOrder[]>([]);
  const [topupNotice, setTopupNotice] = useState('เลือกค่าย กรอกเบอร์ และจำนวนเงินก่อนยืนยันรายการ');

  const [correctionProductId, setCorrectionProductId] = useState('');
  const [correctionDelta, setCorrectionDelta] = useState('1');
  const [correctionReason, setCorrectionReason] = useState('');
  const [stockLog, setStockLog] = useState<StockAdjustment[]>([]);
  const [selectedStockCategory, setSelectedStockCategory] = useState('ทั้งหมด');
  const [stockLogDateFilter, setStockLogDateFilter] = useState(currentDateInput());

  const [staffForm, setStaffForm] = useState({ name: '', phone: '', role: 'ขายหน้าร้าน' });
  const [salesHistory, setSalesHistory] = useState<SaleRecord[]>([]);
  const [historyFilter, setHistoryFilter] = useState<SaleChannel | 'ALL'>('ALL');
  const [selectedSaleId, setSelectedSaleId] = useState('');
  const [historyNotice, setHistoryNotice] = useState('กดรายการเพื่อดูรายละเอียดทั้งหมด');
  const [analyticsPeriod, setAnalyticsPeriod] = useState<AnalyticsPeriod>('day');
  const [analyticsDate, setAnalyticsDate] = useState(currentDateInput());
  const [analyticsMonth, setAnalyticsMonth] = useState(currentMonthInput());
  const [analyticsYear, setAnalyticsYear] = useState(currentYearInput());
  const [analyticsSales, setAnalyticsSales] = useState<SaleRecord[]>([]);
  const [analyticsTransfers, setAnalyticsTransfers] = useState<Transfer[]>([]);
  const [analyticsRange, setAnalyticsRange] = useState({ startDate: currentDateInput(), endDate: '' });
  const [analyticsNotice, setAnalyticsNotice] = useState('เลือกช่วงเวลาเพื่อดู Dashboard จากฐานข้อมูล');
  const [isAnalyticsLoading, setIsAnalyticsLoading] = useState(false);
  const currentUser = authSession?.user ?? null;
  const isOwner = currentUser?.role === 'owner';
  const shopStatus = appSession?.status ?? 'PENDING_OPEN';
  const isShopOpen = shopStatus === 'OPEN' || shopStatus === 'ACTIVE';
  const allowedViews = useMemo(
    () => (Object.keys(viewMeta) as View[])
      .filter((view) => view !== 'CLOSING')
      .filter((view) => isOwner || (view !== 'STOCK' && view !== 'STAFF' && view !== 'SETTINGS')),
    [isOwner],
  );
  const refreshClosingSummary = useCallback(async (targetSessionId = scanSessionId) => {
    if (!isOwner) {
      return null;
    }

    const isCurrentSession = targetSessionId === scanSessionId;
    if (isCurrentSession) {
      setIsClosingLoading(true);
    }
    try {
      const response = await axios.get<ClosingSummary>(
        `${API_BASE_URL}/api/app-sessions/${encodeURIComponent(targetSessionId)}/closing-summary`,
      );
      if (isCurrentSession) {
        setClosingSummary(response.data);
        setAppSession(response.data.session);
      }
      return response.data;
    } catch {
      if (isCurrentSession) {
        setClosingNotice('โหลดสรุปปิดร้านไม่สำเร็จ');
      }
      return null;
    } finally {
      if (isCurrentSession) {
        setIsClosingLoading(false);
      }
    }
  }, [isOwner, scanSessionId]);

  useEffect(() => {
    if (authSession) {
      axios.defaults.headers.common.Authorization = `Bearer ${authSession.token}`;
      writeAuthSession(authSession);
      return;
    }

    delete axios.defaults.headers.common.Authorization;
    writeAuthSession(null);
  }, [authSession]);

  useEffect(() => {
    if (!authSession || (currentView !== 'GAS' && currentView !== 'TOPUP')) return;
    const controller = new AbortController();
    axios.get<StoreSettings>(`${API_BASE_URL}/api/store-settings`, { signal: controller.signal })
      .then(({ data }) => setStoreSettings(data)).catch(() => {});
    return () => controller.abort();
  }, [authSession, currentView]);

  useEffect(() => {
    if (!authSession || isOwner) {
      return;
    }

    if (currentView === 'STOCK' || currentView === 'STAFF' || currentView === 'SETTINGS') {
      setCurrentView('POS');
    }
    setGasPaid(false);
    setGasReturnedTankQuantity(0);
  }, [authSession, currentView, isOwner]);

  useEffect(() => {
    if (!authSession) {
      return undefined;
    }

    let cancelled = false;
    const targetSessionId = sessionFromUrl || createDailySessionId();
    const syncAppSession = () => {
      axios.get<AppSessionResponse>(`${API_BASE_URL}/api/app-sessions/${encodeURIComponent(targetSessionId)}`)
        .then((response) => {
          if (cancelled) {
            return;
          }

          const nextSession = response.data;
          const nextIsOpen = nextSession.status === 'OPEN' || nextSession.status === 'ACTIVE';
          setAppSession(nextSession);
          setScanSessionId(nextSession.session_id);
          if (!nextIsOpen) {
            setPosCheckoutOpen(false);
            setPosAmountField(null);
          }
          setCurrentView((view) => {
            if (!nextIsOpen && ['POS', 'GAS', 'LOTTERY', 'TOPUP'].includes(view)) {
              return 'CLOSING';
            }
            if (nextIsOpen && view === 'CLOSING' && !isOwner) {
              return 'POS';
            }
            return view;
          });
          if (isOwner && nextSession.previousClosedSession) {
            void refreshClosingSummary(nextSession.previousClosedSession.session_id)
              .then((summary) => {
                if (!cancelled) {
                  setPreviousClosingSummary(summary);
                }
              });
          } else {
            setPreviousClosingSummary(null);
          }
        })
        .catch((error) => {
          if (!cancelled && axios.isAxiosError(error) && error.response?.status === 401) {
            setAuthSession(null);
            setUsers([]);
            setPosCart([]);
            setLotteryCart([]);
            setSalesHistory([]);
            setPasswordPanelOpen(false);
            setPasswordResetTarget(undefined);
            setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
            setLoginForm({ username: authSession.user.username, password: '' });
            setLoginNotice('เซสชันหมดอายุหรือรหัสผ่านถูกเปลี่ยน กรุณาเข้าสู่ระบบอีกครั้ง');
            setCurrentView('POS');
          }
        });
    };

    syncAppSession();
    const timer = window.setInterval(syncAppSession, 2500);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [authSession, isOwner, refreshClosingSummary, sessionFromUrl]);

  useEffect(() => {
    if (!authSession) {
      return;
    }

    axios.get<ApiProduct[]>(`${API_BASE_URL}/api/products`)
      .then((response) => {
        const normalized = response.data.map(normalizeProduct);
        setStockItems(normalized);
        setApiStatus(normalized.length > 0 ? 'เชื่อมต่อ tingkum_db แล้ว' : 'tingkum_db ยังไม่มีสินค้า');
      })
      .catch(() => {
        setApiStatus('เชื่อมต่อ tingkum_db ไม่สำเร็จ');
      });
  }, [authSession]);

  useEffect(() => {
    if (!authSession) {
      return;
    }

    axios.get<StaffMember[]>(`${API_BASE_URL}/api/staff`)
      .then((response) => setStaffMembers(response.data))
      .catch(() => setApiStatus('โหลดพนักงานจาก tingkum_db ไม่สำเร็จ'));
  }, [authSession]);

  useEffect(() => {
    if (!authSession || !isOwner) {
      setUsers([]);
      return;
    }

    axios.get<AuthUser[]>(`${API_BASE_URL}/api/users`)
      .then((response) => setUsers(response.data.map(normalizeAuthUser)))
      .catch(() => setApiStatus('โหลด user จาก tingkum_db ไม่สำเร็จ'));
  }, [authSession, isOwner]);

  useEffect(() => {
    if (!authSession || !isOwner) {
      setProductRegistrationRequests([]);
      return;
    }

    let cancelled = false;
    const syncProductRequests = () => {
      axios.get<ProductRegistrationRequest[]>(`${API_BASE_URL}/api/product-registration-requests?status=PENDING`)
        .then((response) => {
          if (!cancelled) {
            setProductRegistrationRequests(response.data.map(normalizeProductRegistrationRequest));
          }
        })
        .catch(() => {
          if (!cancelled) {
            setProductRequestNotice('โหลดคำขอลงทะเบียนสินค้าไม่สำเร็จ');
          }
        });
    };

    syncProductRequests();
    const intervalId = window.setInterval(syncProductRequests, 5000);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [authSession, isOwner]);

  useEffect(() => {
    if (!authSession || !isOwner || currentView !== 'CLOSING') {
      return;
    }

    void refreshClosingSummary();
  }, [authSession, currentView, isOwner, refreshClosingSummary, scanSessionId]);

  useEffect(() => {
    if (!authSession) {
      return;
    }

    const syncLottery = () => {
      axios.get<LotteryTicket[]>(`${API_BASE_URL}/api/lottery/tickets`)
        .then((response) => setLotteryTickets(response.data.map(normalizeLotteryTicket)))
        .catch(() => setLotteryNotice('โหลด stock หวยจาก tingkum_db ไม่สำเร็จ'));
    };

    syncLottery();
    const timer = window.setInterval(syncLottery, 3000);
    return () => window.clearInterval(timer);
  }, [authSession]);

  useEffect(() => {
    if (!authSession) {
      return;
    }

    const syncLotteryCart = () => {
      axios.get<CartSessionResponse>(`${API_BASE_URL}/api/lottery-sessions/${encodeURIComponent(scanSessionId)}/cart`)
        .then((response) => setLotteryCart(response.data.items.map(normalizeCartItem)))
        .catch(() => setLotteryNotice('sync รายการหวยจาก tingkum_db ไม่สำเร็จ'));
    };

    syncLotteryCart();
    const timer = window.setInterval(syncLotteryCart, 1000);
    return () => window.clearInterval(timer);
  }, [authSession, scanSessionId]);

  useEffect(() => {
    if (!authSession) {
      return;
    }

    const syncTopups = () => {
      axios.get<MobileTopupOrder[]>(`${API_BASE_URL}/api/app-sessions/${encodeURIComponent(scanSessionId)}/topups?includeCancelled=${isOwner ? 'true' : 'false'}`)
        .then((response) => setTopupOrders(response.data.map(normalizeTopupOrder)))
        .catch(() => setTopupNotice('โหลดรายการเติมเงินจาก tingkum_db ไม่สำเร็จ'));
    };

    syncTopups();
    const timer = window.setInterval(syncTopups, 2500);
    return () => window.clearInterval(timer);
  }, [authSession, isOwner, scanSessionId]);

  useEffect(() => {
    if (!authSession || !isOwner) {
      setStockLog([]);
      return;
    }

    axios.get<StockAdjustment[]>(`${API_BASE_URL}/api/stock/movements?date=${encodeURIComponent(stockLogDateFilter)}`)
      .then((response) => setStockLog(response.data.map(normalizeStockMovement)))
      .catch(() => setApiStatus('โหลด stock log จาก tingkum_db ไม่สำเร็จ'));
  }, [authSession, isOwner, stockLogDateFilter]);

  useEffect(() => writeStoredValue(storageKeys.appSessionId, scanSessionId), [scanSessionId]);
  useEffect(() => writeStoredValue(storageKeys.deviceId, deviceId), [deviceId]);

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

  useEffect(() => {
    const mediaQuery = window.matchMedia(compactPosQuery);
    const syncViewport = () => {
      setIsCompactPos(mediaQuery.matches);
      if (!mediaQuery.matches) {
        setMobileScannerOpen(false);
      }
    };
    syncViewport();
    mediaQuery.addEventListener('change', syncViewport);

    return () => mediaQuery.removeEventListener('change', syncViewport);
  }, []);

  useEffect(() => {
    if (!isMobileViewport || currentView !== 'GAS' || typeof window === 'undefined') {
      return undefined;
    }

    const scrollContainer = pageScrollRef.current;
    if (!scrollContainer) {
      return undefined;
    }

    const editableSelector = 'input, textarea, select';
    const visualViewport = window.visualViewport;
    let lastViewportHeight = visualViewport?.height ?? window.innerHeight;
    let restoreTimer: number | undefined;

    const isGasEditable = (target: EventTarget | null) => (
      target instanceof HTMLElement
      && target.matches(editableSelector)
      && Boolean(target.closest('.gas-sales-page'))
    );

    const restoreGasScroll = () => {
      const activeElement = document.activeElement;
      if (isGasEditable(activeElement)) {
        return;
      }

      const previousScrollTop = gasKeyboardScrollTopRef.current;
      if (previousScrollTop === null) {
        return;
      }

      window.requestAnimationFrame(() => {
        scrollContainer.scrollTo({ top: previousScrollTop, behavior: 'smooth' });
        gasKeyboardScrollTopRef.current = null;
      });
    };

    const scheduleRestore = (delay = 160) => {
      if (restoreTimer !== undefined) {
        window.clearTimeout(restoreTimer);
      }
      restoreTimer = window.setTimeout(restoreGasScroll, delay);
    };

    const handleFocusIn = (event: FocusEvent) => {
      if (isGasEditable(event.target)) {
        gasKeyboardScrollTopRef.current = scrollContainer.scrollTop;
      }
    };

    const handleFocusOut = () => scheduleRestore(180);

    const handleViewportChange = () => {
      const nextViewportHeight = visualViewport?.height ?? window.innerHeight;
      if (nextViewportHeight >= lastViewportHeight - 4) {
        scheduleRestore(120);
      }
      lastViewportHeight = nextViewportHeight;
    };

    document.addEventListener('focusin', handleFocusIn);
    document.addEventListener('focusout', handleFocusOut);
    visualViewport?.addEventListener('resize', handleViewportChange);
    visualViewport?.addEventListener('scroll', handleViewportChange);

    return () => {
      document.removeEventListener('focusin', handleFocusIn);
      document.removeEventListener('focusout', handleFocusOut);
      visualViewport?.removeEventListener('resize', handleViewportChange);
      visualViewport?.removeEventListener('scroll', handleViewportChange);
      if (restoreTimer !== undefined) {
        window.clearTimeout(restoreTimer);
      }
    };
  }, [currentView, isMobileViewport]);

  function applyGasState(state: GasStateResponse) {
    setGasItems(state.items.map(normalizeGasItem));
    setGasJobs(state.jobs.map(normalizeGasJob));
    setPendingGasReturns(state.pendingReturns);
  }

  useEffect(() => {
    if (!authSession) {
      return;
    }

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
  }, [authSession, scanSessionId]);

  useEffect(() => {
    if (!authSession) {
      return;
    }

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
  }, [authSession, scanSessionId, selectedSaleId]);

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
    if (!authSession) {
      return undefined;
    }

    if (currentView !== 'ANALYTICS') {
      return undefined;
    }

    // Do not display the previous period's amounts while a new filter loads.
    setAnalyticsSales([]);
    setAnalyticsTransfers([]);
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
          setAnalyticsTransfers(response.data.transfers ?? []);
          setAnalyticsRange({
            startDate: response.data.startDate,
            endDate: response.data.endDate,
          });
          setAnalyticsNotice(`${records.length} บิลขาย · ${response.data.transfers?.length ?? 0} รายการรับโอน`);
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
  }, [analyticsQuery, authSession, currentView]);

  useEffect(() => {
    if (currentView !== 'POS' || isCompactPos || mobileScannerOpen) {
      return;
    }

    barcodeInputRef.current?.focus();
  }, [currentView, isCompactPos, mobileScannerOpen, posCart.length, unknownBarcode]);

  useEffect(() => {
    if (!authSession) {
      return undefined;
    }

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
  }, [authSession, currentView, scanSessionId]);

  useEffect(() => {
    if (!mobileScannerOpen) {
      stopCameraScanner();
    }
  }, [mobileScannerOpen]);

  useEffect(() => {
    if (currentView !== 'POS') {
      setMobileScannerOpen(false);
      setSessionQrOpen(false);
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

  const visibleGasItems = gasItems.filter((item) => item.brand === gasBrand);
  const gasOrderItems = useMemo(
    () => gasItems
      .filter((item) => item.brand === gasBrand)
      .map((item) => ({ ...item, quantity: gasQuantities[item.id] ?? 0 }))
      .filter((item) => item.quantity > 0),
    [gasItems, gasQuantities, gasBrand],
  );
  const gasSelectedCount = gasOrderItems.reduce((sum, item) => sum + item.quantity, 0);
  const gasSubtotal = gasOrderItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const gasTotal = gasSubtotal + Math.max(0, gasDeliveryFee);
  const gasFullStockTotal = gasItems.reduce((sum, item) => sum + item.fullStock, 0);
  const gasEmptyStockTotal = gasItems.reduce((sum, item) => sum + item.emptyStock, 0);
  const gasStockTotal = gasItems.reduce((sum, item) => sum + item.totalStock, 0);
  const gasReturnedCount = Math.min(gasSelectedCount, Math.max(0, gasReturnedTankQuantity));
  const gasPendingTankCount = Math.max(0, gasSelectedCount - gasReturnedCount);
  const activeGasJobs = gasJobs.filter((job) =>
    !isCancelledStatus(job.status) && (job.status === 'กำลังดำเนินการ' || job.status === 'PENDING' || job.paid === false || job.emptyTankReturned === false),
  );
  const activeProductRegistrationRequest = isOwner ? productRegistrationRequests[0] : undefined;

  useEffect(() => {
    setProductRequestNotice('');
  }, [activeProductRegistrationRequest?.id]);

  useEffect(() => {
    setGasReturnedTankQuantity(previous => Math.min(previous, gasSelectedCount));
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
  const selectedGasCorrectionItemId = gasItems.some((item) => item.id === gasCorrectionItemId)
    ? gasCorrectionItemId
    : gasItems[0]?.id ?? '';
  const analyticsRevenueSales = useMemo(
    () => analyticsSales.filter((sale) => !isCancelledStatus(sale.status) && sale.status !== LOTTERY_PENDING),
    [analyticsSales],
  );
  const transferSummary = useMemo(() => summarizeTransfers(analyticsTransfers), [analyticsTransfers]);
  const analyticsSaleCount = analyticsSales.length;
  const analyticsTotal = analyticsRevenueSales.reduce((sum, sale) => sum + sale.total, 0);
  const analyticsCombinedTotal = analyticsTotal + transferSummary.fee / 100;
  const analyticsItemCount = analyticsRevenueSales.reduce(
    (sum, sale) => sum + sale.items.reduce((itemSum, item) => itemSum + item.quantity, 0),
    0,
  );
  const analyticsAverageBill = analyticsRevenueSales.length > 0 ? analyticsTotal / analyticsRevenueSales.length : 0;
  const analyticsDiscountTotal = analyticsRevenueSales.reduce((sum, sale) => sum + sale.discount, 0);
  const analyticsSuccessfulCount = analyticsRevenueSales.filter((sale) =>
    isCompletedStatus(sale.status),
  ).length;
  const analyticsCancelledCount = analyticsSales.filter((sale) => isCancelledStatus(sale.status)).length;
  const analyticsPendingCount = analyticsSales.filter((sale) => !isCancelledStatus(sale.status) && !isCompletedStatus(sale.status)).length;
  const analyticsChannelTotals = analyticsRevenueSales.reduce<Record<SaleChannel, { total: number; count: number }>>(
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
      TOPUP: { total: 0, count: 0 },
    },
  );
  const pendingLotterySales = salesHistory.filter((sale) => sale.channel === 'LOTTERY' && sale.status === LOTTERY_PENDING);
  const possibleLotteryRevenue = lotteryTickets.reduce((sum, ticket) => sum + ticket.remaining * ticket.price, 0);
  const analyticsPaymentTotals = useMemo(() => {
    const totals = new Map<string, { total: number; count: number }>();

    analyticsRevenueSales.forEach((sale) => {
      const current = totals.get(sale.paymentMethod) ?? { total: 0, count: 0 };
      totals.set(sale.paymentMethod, {
        total: current.total + sale.total,
        count: current.count + 1,
      });
    });

    if (transferSummary.count > 0) {
      totals.set('ค่าบริการรับโอน (เงินสด)', { total: transferSummary.fee / 100, count: transferSummary.count });
    }
    return Array.from(totals.entries())
      .map(([method, summary]) => ({ method, ...summary }))
      .sort((a, b) => b.total - a.total);
  }, [analyticsRevenueSales, transferSummary]);
  const categorySales = useMemo(() => {
    const totals = new Map<string, number>();

    analyticsRevenueSales.forEach((sale) => {
      sale.items.forEach((item) => {
        const matchedProduct = stockItems.find((product) =>
          (item.barcode && product.barcode === item.barcode) || product.name === item.name,
        );
        const category = sale.channel === 'POS'
          ? matchedProduct?.category ?? 'สินค้าอื่น'
          : saleChannelMeta[sale.channel].label;
        const lineTotal = Math.max(0, item.price * item.quantity - item.discount);
        totals.set(category, (totals.get(category) ?? 0) + lineTotal);
      });
    });

    if (transferSummary.count > 0) totals.set('ค่าบริการรับโอน', transferSummary.fee / 100);
    const maxValue = Math.max(1, ...totals.values());
    return Array.from(totals.entries())
      .map(([label, value]) => ({ label, value, percent: Math.round((value / maxValue) * 100) }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 6);
  }, [analyticsRevenueSales, stockItems, transferSummary]);
  const staffPerformance = useMemo(() => {
    const totals = new Map<string, { total: number; count: number }>();

    analyticsRevenueSales.forEach((sale) => {
      const current = totals.get(sale.staffName) ?? { total: 0, count: 0 };
      totals.set(sale.staffName, {
        total: current.total + sale.total,
        count: current.count + 1,
      });
    });

    transferSummary.active.forEach((record) => {
      const name = record.staff || 'ไม่ระบุ';
      const current = totals.get(name) ?? { total: 0, count: 0 };
      totals.set(name, { total: current.total + record.fee / 100, count: current.count + 1 });
    });
    return Array.from(totals.entries())
      .map(([name, summary]) => ({ name, ...summary }))
      .sort((a, b) => b.total - a.total);
  }, [analyticsRevenueSales, transferSummary]);
  const analyticsTrendRows = useMemo(() => {
    const buckets = new Map<string, { key: string; label: string; total: number; count: number }>();

    const addToBucket = (date: Date, amount: number) => {
      const { key, label } = analyticsBucket(date, analyticsPeriod);
      const current = buckets.get(key) ?? { key, label, total: 0, count: 0 };
      buckets.set(key, { ...current, total: current.total + amount, count: current.count + 1 });
    };
    analyticsRevenueSales.forEach((sale) => addToBucket(sale.createdAt, sale.total));
    transferSummary.active.forEach((record) => addToBucket(new Date(record.createdAt), record.fee / 100));

    return Array.from(buckets.values()).sort((a, b) => a.key.localeCompare(b.key));
  }, [analyticsPeriod, analyticsRevenueSales, transferSummary]);
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

  async function handleLogin() {
    const username = loginForm.username.trim();
    const password = loginForm.password;
    if (!username || !password) {
      setLoginNotice('กรอก username และ password');
      return;
    }

    try {
      const response = await axios.post<LoginResponse>(`${API_BASE_URL}/api/auth/login`, { username, password });
      const session = {
        ...response.data,
        user: normalizeAuthUser(response.data.user),
      };
      setAuthSession(session);
      setLoginForm({ username, password: '' });
      setLoginNotice(`เข้าสู่ระบบเป็น ${session.user.displayName}`);
    } catch {
      setLoginNotice('เข้าสู่ระบบไม่สำเร็จ');
    }
  }

  async function logout() {
    try {
      await axios.post(`${API_BASE_URL}/api/auth/logout`);
    } catch {
      // Local logout still clears the browser session.
    }
    setAuthSession(null);
    setUsers([]);
    setPosCart([]);
    setLotteryCart([]);
    setSalesHistory([]);
    setCurrentView('POS');
  }

  function openPasswordPanel(target?: AuthUser) {
    setPasswordResetTarget(target);
    setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
    setPasswordNotice(target ? `ตั้งรหัสใหม่ให้ ${target.displayName} (${target.username}) โดยไม่ต้องใช้รหัสเดิม` : 'เปลี่ยนรหัสผ่านของบัญชีที่กำลังใช้งาน');
    setPasswordError('');
    setPasswordSaved(false);
    setPasswordVisible(false);
    setPasswordPanelOpen(true);
  }

  function closePasswordPanel() {
    if (passwordBusy) return;
    setPasswordPanelOpen(false);
    setPasswordResetTarget(undefined);
    setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
    setPasswordError('');
    setPasswordSaved(false);
    setPasswordVisible(false);
  }

  function validateNewPassword() {
    if (passwordForm.newPassword.length < 6 || passwordForm.newPassword.length > 256) {
      setPasswordError('รหัสผ่านใหม่ต้องมี 6–256 ตัวอักษร');
      return false;
    }
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setPasswordError('รหัสผ่านใหม่กับยืนยันรหัสไม่ตรงกัน');
      return false;
    }
    return true;
  }

  async function changeCurrentPassword() {
    if (passwordBusy) return;
    setPasswordError('');
    setPasswordSaved(false);
    if (!passwordForm.currentPassword) {
      setPasswordError('กรอกรหัสผ่านเดิม');
      return;
    }
    if (!validateNewPassword()) return;
    setPasswordBusy(true);
    try {
      const response = await axios.patch<ChangePasswordResponse>(`${API_BASE_URL}/api/auth/password`, {
        currentPassword: passwordForm.currentPassword, newPassword: passwordForm.newPassword,
      });
      if (authSession) setAuthSession({ ...authSession, user: normalizeAuthUser(response.data.user) });
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setPasswordVisible(false);
      setPasswordNotice('เปลี่ยนรหัสผ่านแล้ว อุปกรณ์อื่นต้องเข้าสู่ระบบด้วยรหัสใหม่');
      setPasswordSaved(true);
    } catch (error) {
      setPasswordError(axios.isAxiosError(error) && error.response?.status === 401 ? 'รหัสเดิมไม่ถูกต้อง' : 'เปลี่ยนรหัสผ่านไม่สำเร็จ');
    } finally { setPasswordBusy(false); }
  }

  async function refreshUsers() {
    if (!isOwner) {
      return;
    }

    const response = await axios.get<AuthUser[]>(`${API_BASE_URL}/api/users`);
    setUsers(response.data.map(normalizeAuthUser));
  }

  async function refreshProducts() {
    const response = await axios.get<ApiProduct[]>(`${API_BASE_URL}/api/products`);
    setStockItems(response.data.map(normalizeProduct));
  }

  async function refreshProductRegistrationRequests() {
    if (!isOwner) {
      setProductRegistrationRequests([]);
      return;
    }

    const response = await axios.get<ProductRegistrationRequest[]>(`${API_BASE_URL}/api/product-registration-requests?status=PENDING`);
    setProductRegistrationRequests(response.data.map(normalizeProductRegistrationRequest));
  }

  async function refreshGasItems() {
    const response = await axios.get<ApiGasItem[]>(`${API_BASE_URL}/api/gas/items`);
    setGasItems(response.data.map(normalizeGasItem));
  }

  async function refreshLotteryTickets() {
    const response = await axios.get<LotteryTicket[]>(`${API_BASE_URL}/api/lottery/tickets`);
    setLotteryTickets(response.data.map(normalizeLotteryTicket));
  }

  async function refreshLotteryCart() {
    const response = await axios.get<CartSessionResponse>(
      `${API_BASE_URL}/api/lottery-sessions/${encodeURIComponent(scanSessionId)}/cart`,
    );
    setLotteryCart(response.data.items.map(normalizeCartItem));
  }

  async function refreshTopups() {
    const response = await axios.get<MobileTopupOrder[]>(
      `${API_BASE_URL}/api/app-sessions/${encodeURIComponent(scanSessionId)}/topups?includeCancelled=${isOwner ? 'true' : 'false'}`,
    );
    setTopupOrders(response.data.map(normalizeTopupOrder));
  }

  async function refreshStockLog() {
    if (!isOwner) {
      return;
    }

    const response = await axios.get<StockAdjustment[]>(
      `${API_BASE_URL}/api/stock/movements?date=${encodeURIComponent(stockLogDateFilter)}`,
    );
    setStockLog(response.data.map(normalizeStockMovement));
  }

  function requireShopOpen(setNotice?: (message: string) => void) {
    if (isShopOpen) {
      return true;
    }

    const message = shopStatus === 'CLOSED' ? 'ร้านปิดแล้ว ให้ owner กด Reopen วันนี้ก่อนทำรายการ' : 'ต้องเปิดร้านก่อนทำรายการ';
    setNotice?.(message);
    setClosingNotice(message);
    setCurrentView('CLOSING');
    return false;
  }

  async function openShop() {
    if (!isOwner) {
      setClosingNotice('เฉพาะ owner เท่านั้นที่เปิดร้านได้');
      return;
    }

    setIsClosingLoading(true);
    try {
      const response = await axios.post<AppSessionResponse>(
        `${API_BASE_URL}/api/app-sessions/${encodeURIComponent(scanSessionId)}/open`,
        { reason: 'open shop from topbar' },
      );
      setAppSession(response.data);
      setClosingNotice(`เปิดร้านวันที่ ${response.data.business_date} แล้ว`);
      await refreshClosingSummary(response.data.session_id);
      setCurrentView('POS');
    } catch {
      setClosingNotice('เปิดร้านไม่สำเร็จ');
    } finally {
      setIsClosingLoading(false);
    }
  }

  async function confirmClosingSection(section: ClosingSection) {
    if (!isOwner) {
      setClosingNotice('เฉพาะ owner เท่านั้นที่ยืนยันยอดปิดร้านได้');
      return;
    }

    const currentCheck = closingSummary?.checks.find((check) => check.section === section);
    setIsClosingLoading(true);
    try {
      const response = await axios.patch<ClosingSummary>(
        `${API_BASE_URL}/api/app-sessions/${encodeURIComponent(scanSessionId)}/closing-checks/${section}`,
        { confirmed: !currentCheck?.confirmed },
      );
      setClosingSummary(response.data);
      setAppSession(response.data.session);
      setClosingNotice(`${closingSectionMeta[section].label} ${currentCheck?.confirmed ? 'ยกเลิกการยืนยันแล้ว' : 'เช็คยอดแล้ว'}`);
    } catch {
      setClosingNotice('บันทึกการเช็คยอดไม่สำเร็จ');
    } finally {
      setIsClosingLoading(false);
    }
  }

  async function closeShop() {
    if (!isOwner) {
      setClosingNotice('เฉพาะ owner เท่านั้นที่ปิดร้านได้');
      return;
    }

    setIsClosingLoading(true);
    try {
      const response = await axios.post<ClosingSummary>(
        `${API_BASE_URL}/api/app-sessions/${encodeURIComponent(scanSessionId)}/close`,
        { reason: 'close shop from closing page' },
      );
      setClosingSummary(response.data);
      setAppSession(response.data.session);
      setClosingNotice(`ปิดร้านวันที่ ${response.data.session.business_date} แล้ว`);
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 409) {
        setClosingNotice('ต้องยืนยันยอดทุกหมวดก่อนปิดร้าน');
        const summary = error.response.data?.summary as ClosingSummary | undefined;
        if (summary) {
          setClosingSummary(summary);
        }
        return;
      }
      setClosingNotice('ปิดร้านไม่สำเร็จ');
    } finally {
      setIsClosingLoading(false);
    }
  }

  async function reopenShop() {
    if (!isOwner) {
      setClosingNotice('เฉพาะ owner เท่านั้นที่เปิดร้านซ้ำได้');
      return;
    }

    const reason = window.prompt('เหตุผลที่เปิดร้านวันนี้ซ้ำ')?.trim();
    if (!reason) {
      return;
    }

    setIsClosingLoading(true);
    try {
      const response = await axios.post<ClosingSummary>(
        `${API_BASE_URL}/api/app-sessions/${encodeURIComponent(scanSessionId)}/reopen`,
        { reason },
      );
      setClosingSummary(response.data);
      setAppSession(response.data.session);
      setClosingNotice(`เปิดร้านซ้ำวันที่ ${response.data.session.business_date} แล้ว ต้องเช็คยอดใหม่ก่อนปิดร้านอีกครั้ง`);
      setCurrentView('POS');
    } catch {
      setClosingNotice('เปิดร้านซ้ำไม่สำเร็จ');
    } finally {
      setIsClosingLoading(false);
    }
  }

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
    if (!authSession) {
      return undefined;
    }

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
  }, [authSession, handlePrintRequest, isMobileViewport, scanSessionId]);

  async function handleBarcodeValue(rawBarcode: string, source: 'desktop' | 'mobile' = 'desktop') {
    if (!requireShopOpen(setPosNotice)) {
      return;
    }

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

    scannerControlsRef.current?.stop();
    scannerControlsRef.current = null;

    scannerStreamRef.current?.getTracks().forEach((track) => track.stop());
    scannerStreamRef.current = null;

    if (scannerVideoRef.current) {
      scannerVideoRef.current.srcObject = null;
    }

    if (updateState) {
      setCameraActive(false);
      setActiveCameraLabel('');
      activeCameraDeviceIdRef.current = '';
    }
  }

  async function refreshCameraDeviceState(stream: MediaStream) {
    const devices = await listPreferredCameraDevices();
    const currentDeviceId = getStreamCameraDeviceId(stream);
    setCameraDevices(devices);

    if (currentDeviceId) {
      activeCameraDeviceIdRef.current = currentDeviceId;
      setActiveCameraLabel(getCameraLabel(devices, currentDeviceId));
    } else {
      setActiveCameraLabel('');
    }

    return { devices, currentDeviceId };
  }

  async function switchMobileCamera() {
    const devices = cameraDevices.length > 0 ? cameraDevices : await listPreferredCameraDevices();
    if (devices.length <= 1) {
      setScannerNotice('ไม่พบกล้องอื่นให้สลับ');
      return;
    }

    setCameraDevices(devices);
    const currentDeviceId = activeCameraDeviceIdRef.current || requestedCameraDeviceIdRef.current;
    const currentIndex = devices.findIndex((device) => device.deviceId === currentDeviceId);
    const nextDevice = devices[(currentIndex + 1 + devices.length) % devices.length];
    requestedCameraDeviceIdRef.current = nextDevice.deviceId;

    setScannerNotice(`กำลังสลับกล้องเป็น ${nextDevice.label}`);
    stopCameraScanner();
    window.setTimeout(() => {
      void startCameraScanner(nextDevice.deviceId, false);
    }, 0);
  }

  async function startZxingScanner(stream: MediaStream, video: HTMLVideoElement) {
    const reader = createZxingReader();
    let submittedBarcode = false;

    const controls = await reader.decodeFromStream(stream, video, (result, error, activeControls) => {
      if (submittedBarcode || error || !result) {
        return;
      }

      const barcode = result.getText().trim();
      if (!barcode) {
        return;
      }

      submittedBarcode = true;
      activeControls.stop();
      void (async () => {
        await sendScannerBarcode(barcode);
        stopCameraScanner();
      })();
    });

    if (scannerStreamRef.current !== stream) {
      controls.stop();
      return;
    }

    scannerControlsRef.current = controls;
    setScannerNotice('เปิดกล้องแล้ว กำลังสแกนบาร์โค้ดด้วยตัวอ่านสำหรับมือถือ');
  }

  async function startCameraScanner(requestedDeviceId = requestedCameraDeviceIdRef.current, allowPreferredSwitch = true) {
    const unavailableNotice = getCameraUnavailableNotice();
    if (unavailableNotice) {
      setScannerNotice(unavailableNotice);
      return;
    }

    try {
      const video = scannerVideoRef.current;
      if (!video) {
        setScannerNotice('เปิดกล้องไม่ได้ เพราะหน้าตัวอย่างกล้องยังไม่พร้อม ลองกด Scan ใหม่');
        return;
      }

      const stream = await navigator.mediaDevices.getUserMedia(createCameraStreamConstraints(requestedDeviceId));
      scannerStreamRef.current = stream;
      await tuneBarcodeCameraStream(stream);
      setCameraActive(true);

      const cameraState = await refreshCameraDeviceState(stream);
      const preferredSwitch = getPreferredCameraSwitch(cameraState.devices, cameraState.currentDeviceId, requestedDeviceId);
      if (allowPreferredSwitch && preferredSwitch) {
        requestedCameraDeviceIdRef.current = preferredSwitch.deviceId;
        stream.getTracks().forEach((track) => track.stop());
        scannerStreamRef.current = null;
        setScannerNotice(`กำลังใช้กล้องหลังเลนส์หลัก: ${preferredSwitch.label}`);
        await startCameraScanner(preferredSwitch.deviceId, false);
        return;
      }

      video.srcObject = stream;
      await video.play();

      const BarcodeDetector = getBarcodeDetectorConstructor();
      if (!BarcodeDetector) {
        await startZxingScanner(stream, video);
        return;
      }

      let detector: BarcodeDetectorLike;
      try {
        detector = new BarcodeDetector({
          formats: BARCODE_DETECTOR_FORMATS,
        });
      } catch {
        await startZxingScanner(stream, video);
        return;
      }

      setScannerNotice('เปิดกล้องแล้ว กำลังสแกนบาร์โค้ด');
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
    } catch (error) {
      if (requestedDeviceId && error instanceof DOMException && (error.name === 'OverconstrainedError' || error.name === 'NotFoundError')) {
        requestedCameraDeviceIdRef.current = '';
        setScannerNotice('กล้องที่เลือกไว้ใช้ไม่ได้ กำลังลองเปิดกล้องหลัง default');
        await startCameraScanner('', false);
        return;
      }

      stopCameraScanner();
      setScannerNotice(getCameraErrorNotice(error));
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

    const category = newProductDraft.category.trim() || 'ทั่วไป';
    const unit = newProductDraft.unit.trim() || 'ชิ้น';
    const normalizedMinStock = Number.isFinite(minStock) ? Math.max(0, minStock) : 5;
    const productPayload = {
      barcode,
      name,
      price,
      cost: price,
      stock,
      category,
      minStock: normalizedMinStock,
      unit,
    };

    if (!isOwner) {
      try {
        const response = await axios.post<ProductRegistrationRequest>(
          `${API_BASE_URL}/api/product-registration-requests`,
          { ...productPayload, reason: 'request register from POS scan' },
        );
        setUnknownBarcode('');
        setBarcodeInput('');
        setPosNotice(`ส่งคำขอลงทะเบียน ${response.data.name} ให้ owner แล้ว`);
        return;
      } catch (error) {
        if (axios.isAxiosError(error) && error.response?.status === 409) {
          setPosNotice(`บาร์โค้ด ${barcode} มีอยู่แล้ว หรือมีคำขอค้างอยู่`);
          return;
        }
        setPosNotice('ส่งคำขอลงทะเบียนสินค้าไม่สำเร็จ เพราะเชื่อมต่อ tingkum_db ไม่ได้');
        return;
      }
    }

    let product: Product = {
      id: Math.max(0, ...stockItems.map((item) => item.id)) + 1,
      barcode,
      name,
      price,
      stock: Number.isFinite(stock) ? Math.max(0, stock) : 0,
      category,
      minStock: normalizedMinStock,
      unit,
    };

    try {
      const response = await axios.post<ApiProduct>(`${API_BASE_URL}/api/products`, {
        ...productPayload,
        reason: 'register from POS scan',
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

  async function reviewProductRegistrationRequest(requestId: number, action: 'ACCEPT' | 'REJECT') {
    if (!isOwner || isReviewingProductRequest) {
      return;
    }

    setIsReviewingProductRequest(true);
    setProductRequestNotice(action === 'ACCEPT' ? 'กำลังอนุมัติสินค้าใหม่' : 'กำลังปฏิเสธคำขอ');

    try {
      const response = await axios.patch<{
        request: ProductRegistrationRequest;
        product: ApiProduct | null;
      }>(
        `${API_BASE_URL}/api/product-registration-requests/${encodeURIComponent(String(requestId))}`,
        { action },
      );
      setProductRegistrationRequests((previous) => previous.filter((request) => request.id !== requestId));
      if (response.data.product) {
        const product = normalizeProduct(response.data.product);
        setStockItems((previous) =>
          previous.some((item) => item.id === product.id)
            ? previous.map((item) => item.id === product.id ? product : item)
            : [...previous, product],
        );
        await refreshStockLog();
        setProductRequestNotice(`อนุมัติสินค้า ${product.name} แล้ว`);
        return;
      }
      setProductRequestNotice(`ปฏิเสธคำขอ ${response.data.request.name} แล้ว`);
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 409) {
        setProductRequestNotice('อนุมัติไม่ได้ เพราะบาร์โค้ดนี้มีสินค้าอยู่แล้ว');
        await refreshProductRegistrationRequests();
        return;
      }
      setProductRequestNotice('รีวิวคำขอสินค้าไม่สำเร็จ');
    } finally {
      setIsReviewingProductRequest(false);
    }
  }

  async function updateCartQuantity(id: string, delta: number) {
    if (!requireShopOpen(setPosNotice)) {
      return;
    }

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
    if (!requireShopOpen(setPosNotice)) {
      return;
    }

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

  function closePosCheckout() {
    posCheckoutRef.current?.close();
    setPosCheckoutOpen(false);
    setPosAmountField(null);
  }

  async function completePosSale() {
    if (!requireShopOpen(setPosNotice)) {
      return;
    }

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
          customerName: 'ลูกค้าทั่วไป',
          paymentMethod: posPayment,
          billDiscount,
          cashReceived: posPayment === 'เงินสด' ? cashReceived : posTotal,
          note: 'ขายหน้าร้าน',
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
      closePosCheckout();
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

  function applyGasVoice(text: string) {
    const draft = parseGasVoice(text);
    if (draft.errors.length) return { ok: false, message: `${draft.errors.join(' · ')} · ฟอร์มยังไม่เปลี่ยน` };

    const notes = [...draft.notes];
    const summary: string[] = [];
    const wantsProduct = draft.brand !== undefined || draft.items.length > 0;
    let selectedOrder: Array<{ item: GasItem; sizeKg: 4 | 15; quantity: number }> = [];
    const brand = draft.brand ?? (gasBrand || undefined);
    if (wantsProduct) {
      if (!brand) return { ok: false, message: 'ระบุยี่ห้อแก๊ส เช่น ปตท. หรือสยาม หรือเลือกยี่ห้อในฟอร์มก่อน · ฟอร์มยังไม่เปลี่ยน' };
      const requested = draft.items.length ? draft.items : [{}];
      const fallbackSize = gasOrderItems.length === 1 ? gasSizeFromName(gasOrderItems[0].name) : undefined;
      const result = resolveVoiceGasOrder(gasItems, brand, requested, fallbackSize);
      if (!result.lines) return { ok: false, message: `${result.error} · ฟอร์มยังไม่เปลี่ยน` };
      selectedOrder = result.lines;
      summary.push(...selectedOrder.map((line) => `${brand} ${line.sizeKg} กก. × ${line.quantity} ถัง`));
      if (requested.some((line) => line.quantity === undefined)) notes.push(requested.length > 1 ? 'ไม่ได้บอกจำนวนบางขนาด ใช้ขนาดละ 1 ถัง' : 'ไม่ได้บอกจำนวน ใช้ 1 ถัง');
    }

    const changesCustomer = wantsProduct || (draft.customerName !== undefined && draft.customerName !== gasCustomer.name)
      || (draft.address !== undefined && draft.address !== gasCustomer.address);
    // A different destination must not inherit another customer's name or phone.
    const customer = {
      name: draft.customerName ?? (changesCustomer ? '' : gasCustomer.name),
      address: draft.address ?? (changesCustomer ? '' : gasCustomer.address),
      phone: draft.phone ?? (changesCustomer ? '' : gasCustomer.phone),
    };
    if (selectedOrder.length && brand) {
      setGasBrand(brand);
      setGasQuantities(Object.fromEntries(selectedOrder.map((line) => [line.item.id, line.quantity])));
      setGasReturnedTankQuantity(0);
    }
    setGasCustomer(customer);
    if (draft.customerName) summary.push(draft.customerName);
    if (draft.address) summary.push(`ส่งที่ ${draft.address}`);
    if (draft.phone) summary.push(`โทร ${draft.phone}`);
    if (!customer.name) notes.push('ยังขาดชื่อลูกค้า');
    if (!customer.address) notes.push('ยังขาดจุดส่ง');
    if (selectedOrder.length || gasSelectedCount > 0) setGasStep('delivery');
    else notes.push('เลือกยี่ห้อและขนาดถังต่อในฟอร์ม');
    return { ok: true, message: `กรอกให้แล้ว: ${summary.join(' · ')}${notes.length ? ` · ${notes.join(' · ')}` : ''} · ตรวจข้อมูลและคนส่งก่อนกดทำรายการ` };
  }

  function selectGasBrand(brand: GasBrand) {
    if (brand === gasBrand) return;
    setGasBrand(brand);
    setGasQuantities({});
    setGasReturnedTankQuantity(0);
    setGasNotice('');
  }

  function updateGasQuantity(id: string, delta: number) {
    const gasItem = gasItems.find((item) => item.id === id);
    if (!gasItem || gasItem.brand !== gasBrand) {
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
    if (!isOwner) {
      return;
    }

    setGasReturnedTankQuantity((previous) =>
      Math.max(0, Math.min(gasSelectedCount, previous + delta)),
    );
  }

  function pendingReturnQuantityFor(item: PendingGasReturn) {
    const quantity = gasPendingReturnQuantities[item.id] ?? Math.min(1, item.quantity);
    return Math.max(1, Math.min(item.quantity, quantity));
  }

  function updatePendingReturnQuantity(item: PendingGasReturn, delta: number) {
    if (!isOwner) {
      return;
    }

    setGasPendingReturnQuantities((previous) => ({
      ...previous,
      [item.id]: Math.max(1, Math.min(item.quantity, pendingReturnQuantityFor(item) + delta)),
    }));
  }

  async function createGasJob() {
    if (gasVoiceBusy) return;
    if (!requireShopOpen(setGasNotice)) {
      return;
    }

    if (gasOrderItems.length === 0) {
      setGasNotice('เลือกถังแก๊สอย่างน้อย 1 รายการ');
      return;
    }

    if (!gasCustomer.name.trim() || !gasCustomer.address.trim()) {
      setGasNotice('กรอกชื่อและที่อยู่สำหรับส่งแก๊ส');
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
          brand: gasBrand,
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
      setGasStep('selection');
      setGasBrand('');
      setGasQuantities({});
      setGasCustomer({ name: '', phone: '', address: '' });
      setGasVoiceSession((previous) => previous + 1);
      setGasDeliveryFee(null);
      setGasReturnedTankQuantity(0);
      setGasPaid(isOwner);
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
    if (!isOwner) {
      setGasNotice('เฉพาะ owner เท่านั้นที่กดจ่ายแล้ว/ปิดงานได้');
      return;
    }

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
    if (!isOwner) {
      setGasNotice('เฉพาะ owner เท่านั้นที่รับคืนถังได้');
      return;
    }

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

  async function cancelGasJob(id: string) {
    if (!isOwner) {
      setGasNotice('เฉพาะ owner เท่านั้นที่ยกเลิกรายการแก๊สได้');
      return;
    }

    const reason = window.prompt('เหตุผลที่ยกเลิกรายการแก๊ส')?.trim();
    if (!reason) {
      return;
    }

    try {
      const response = await axios.post<GasStateResponse>(
        `${API_BASE_URL}/api/app-sessions/${encodeURIComponent(scanSessionId)}/gas/jobs/${encodeURIComponent(id)}/cancel`,
        { reason },
      );
      applyGasState(response.data);
      const salesResponse = await axios.get<ApiSaleRecord[]>(`${API_BASE_URL}/api/app-sessions/${encodeURIComponent(scanSessionId)}/sales`);
      setSalesHistory(salesResponse.data.map(normalizeSaleRecord));
      await refreshProducts();
      setGasNotice(`ยกเลิกรายการ ${id} แล้ว`);
    } catch {
      setGasNotice('ยกเลิกรายการแก๊สไม่สำเร็จ');
    }
  }

  async function cancelSaleRecord(sale: SaleRecord) {
    if (!isOwner) {
      setHistoryNotice('เฉพาะ owner เท่านั้นที่ยกเลิกรายการขายได้');
      return;
    }

    if (isCancelledStatus(sale.status)) {
      setHistoryNotice('รายการนี้ถูกยกเลิกแล้ว');
      return;
    }

    const reason = window.prompt(`เหตุผลที่ยกเลิกรายการ ${sale.id}`)?.trim();
    if (!reason) {
      return;
    }

    if (sale.channel === 'TOPUP') {
      try {
        await axios.delete(
          `${API_BASE_URL}/api/app-sessions/${encodeURIComponent(scanSessionId)}/topups/${encodeURIComponent(sale.id)}`,
          { data: { reason } },
        );
        const salesResponse = await axios.get<ApiSaleRecord[]>(`${API_BASE_URL}/api/app-sessions/${encodeURIComponent(scanSessionId)}/sales`);
        const records = salesResponse.data.map(normalizeSaleRecord);
        setSalesHistory(records);
        setSelectedSaleId(sale.id);
        await refreshTopups();
        setHistoryNotice(`ยกเลิกรายการ ${sale.id} แล้ว`);
      } catch {
        setHistoryNotice('ยกเลิกรายการเติมเงินไม่สำเร็จ');
      }
      return;
    }

    try {
      const response = await axios.post<ApiSaleRecord>(
        `${API_BASE_URL}/api/app-sessions/${encodeURIComponent(scanSessionId)}/sales/${encodeURIComponent(sale.id)}/cancel`,
        { reason },
      );
      const cancelledSale = normalizeSaleRecord(response.data);
      setSalesHistory((previous) => previous.map((item) => item.id === sale.id ? cancelledSale : item));
      setSelectedSaleId(cancelledSale.id);
      await refreshProducts();
      await refreshLotteryTickets();
      setHistoryNotice(`ยกเลิกรายการ ${sale.id} แล้ว`);
    } catch {
      setHistoryNotice('ยกเลิกรายการขายไม่สำเร็จ');
    }
  }

  function lotteryAvailable(ticket: LotteryTicket) {
    const inCart = lotteryCart.find((item) => item.id === String(ticket.id))?.quantity ?? 0;
    return ticket.remaining - inCart;
  }

  async function addLotteryTicket(ticket: LotteryTicket) {
    if (!requireShopOpen(setLotteryNotice)) {
      return;
    }

    if (lotteryAvailable(ticket) <= 0) {
      setLotteryNotice(`เลข ${ticket.number} หมดแล้ว`);
      return;
    }

    try {
      const response = await axios.post<CartSessionResponse>(
        `${API_BASE_URL}/api/lottery-sessions/${encodeURIComponent(scanSessionId)}/cart/items`,
        { number: ticket.number },
      );
      setLotteryCart(response.data.items.map(normalizeCartItem));
      setLotteryNotice(`เพิ่มเลข ${ticket.number} แล้ว`);
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 409) {
        setLotteryNotice(`เลข ${ticket.number} คงเหลือไม่พอ`);
        return;
      }
      setLotteryNotice('เพิ่มเลขหวยจาก tingkum_db ไม่สำเร็จ');
    }
  }

  function searchLottery() {
    const number = lotteryInput.trim();
    const ticket = lotteryTickets.find((item) => item.number === number);
    if (!ticket) {
      setLotteryNotice(`ไม่พบเลข ${number || '-'}`);
      return;
    }
    void addLotteryTicket(ticket);
    setLotteryInput('');
  }

  async function removeLottery(id: string) {
    try {
      const response = await axios.delete<CartSessionResponse>(
        `${API_BASE_URL}/api/lottery-sessions/${encodeURIComponent(scanSessionId)}/cart/items/${encodeURIComponent(id)}`,
      );
      setLotteryCart(response.data.items.map(normalizeCartItem));
    } catch {
      setLotteryNotice('ลบเลขจากรายการไม่สำเร็จ');
    }
  }

  async function updateLotteryQuantity(id: string, delta: number) {
    const ticket = lotteryTickets.find((item) => String(item.id) === id);
    const cartItem = lotteryCart.find((item) => item.id === id);
    if (!ticket) {
      return;
    }

    const nextQuantity = Math.max(1, Math.min(ticket.remaining, (cartItem?.quantity ?? 1) + delta));
    try {
      const response = await axios.patch<CartSessionResponse>(
        `${API_BASE_URL}/api/lottery-sessions/${encodeURIComponent(scanSessionId)}/cart/items/${encodeURIComponent(id)}`,
        { quantity: nextQuantity },
      );
      setLotteryCart(response.data.items.map(normalizeCartItem));
    } catch {
      setLotteryNotice('ปรับจำนวนเลขหวยไม่สำเร็จ');
    }
  }

  async function completeLotterySale() {
    if (lotteryCheckoutBusy) return;
    if (!requireShopOpen(setLotteryNotice)) {
      return;
    }

    if (lotteryCart.length === 0) {
      setLotteryNotice('ยังไม่มีเลขในรายการขาย');
      return;
    }

    if (lotteryPayment === 'เงินสด' && lotteryReceived < lotterySubtotal) {
      setLotteryNotice(`รับเงินยังไม่พอ ขาด ${formatMoney(lotterySubtotal - lotteryReceived)}`);
      return;
    }

    const insufficientTicket = lotteryCart.find((cartItem) => {
      const ticket = lotteryTickets.find((item) => String(item.id) === cartItem.id);
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

    setLotteryCheckoutBusy(true);
    try {
      const response = await axios.post<{ sale: ApiSaleRecord; cart: CartSessionResponse }>(
        `${API_BASE_URL}/api/app-sessions/${encodeURIComponent(scanSessionId)}/lottery/checkout`,
        {
          cashierName: saleRecord.staffName,
          customerName: saleRecord.customerName,
          paymentMethod: lotteryPayment,
          cashReceived: lotteryPayment === 'เงินสด' ? lotteryReceived : lotterySubtotal,
          note: saleRecord.note,
        },
      );
      const completedSale = normalizeSaleRecord(response.data.sale);
      setSalesHistory((previous) => [completedSale, ...previous.filter((sale) => sale.id !== completedSale.id)]);
      setSelectedSaleId(completedSale.id);
      setLotteryCart(response.data.cart.items.map(normalizeCartItem));
      await refreshLotteryTickets();
      setLotteryNotice(completedSale.status === LOTTERY_PENDING ? 'ส่งรายการให้เจ้าของร้านตรวจและยืนยันแล้ว สต็อกหวยถูกกันไว้สำหรับรายการนี้' : `ขายหวยสำเร็จ ${formatMoney(lotterySubtotal)}`);
      setLotteryReceived(0);
    } catch {
      setLotteryNotice('บันทึกขายหวยไม่สำเร็จ กรุณาตรวจรายการและลองอีกครั้ง');
    } finally { setLotteryCheckoutBusy(false); }
  }

  async function confirmLotteryPayment(sale: SaleRecord) {
    if (!isOwner || lotteryApprovalBusy) return;
    const cashReceived = Number(lotteryApprovalCash[sale.id] ?? sale.reportedCashReceived ?? sale.total);
    if (!Number.isFinite(cashReceived) || cashReceived < sale.total) {
      setLotteryNotice('เงินที่ตรวจรับจริงต้องไม่น้อยกว่ายอดรายการ'); return;
    }
    setLotteryApprovalBusy(sale.id);
    try {
      const { data } = await axios.post<ApiSaleRecord>(`${API_BASE_URL}/api/app-sessions/${encodeURIComponent(scanSessionId)}/lottery/${encodeURIComponent(sale.id)}/confirm`, { cashReceived });
      setSalesHistory((previous) => previous.map((row) => row.id === data.id ? normalizeSaleRecord(data) : row));
      setLotteryNotice(`ยืนยันรับเงินรายการ ${sale.id} แล้ว`);
    } catch (error) { setLotteryNotice(errorText(error)); }
    finally { setLotteryApprovalBusy(''); }
  }

  function appendTopupPhoneDigit(digit: string) {
    setTopupPhone((previous) => `${previous}${digit}`.slice(0, 10));
  }

  function deleteTopupPhoneDigit() {
    setTopupPhone((previous) => previous.slice(0, -1));
  }

  async function confirmTopupOrder() {
    if (!requireShopOpen(setTopupNotice)) {
      return;
    }

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

    try {
      const response = await axios.post<MobileTopupOrder>(
        `${API_BASE_URL}/api/app-sessions/${encodeURIComponent(scanSessionId)}/topups`,
        { provider: topupProvider, phone, amount },
      );
      const order = normalizeTopupOrder(response.data);
      setTopupOrders((previous) => [order, ...previous.filter((item) => item.id !== order.id)]);
      setTopupPhone('');
      setTopupAmount(null);
      setTopupNotice(`เพิ่มรายการ ${topupProvider} ${phone} ${formatMoney(amount)} แล้ว`);
    } catch {
      setTopupNotice('เพิ่มรายการเติมเงินลง tingkum_db ไม่สำเร็จ');
    }
  }

  async function toggleTopupOrderStatus(id: string, field: 'toppedUp' | 'paid') {
    if (!isOwner) {
      setTopupNotice('เฉพาะ owner เท่านั้นที่เปลี่ยนสถานะเติมแล้ว/จ่ายแล้วได้');
      return;
    }

    const order = topupOrders.find((item) => item.id === id);
    if (!order) {
      return;
    }

    try {
      const response = await axios.patch<MobileTopupOrder>(
        `${API_BASE_URL}/api/app-sessions/${encodeURIComponent(scanSessionId)}/topups/${encodeURIComponent(id)}`,
        { [field]: !order[field], reason: `toggle ${field}` },
      );
      const updated = normalizeTopupOrder(response.data);
      setTopupOrders((previous) => previous.map((item) => item.id === id ? updated : item));
    } catch {
      setTopupNotice('เปลี่ยนสถานะเติมเงินไม่สำเร็จ');
    }
  }

  async function removeTopupOrder(id: string) {
    if (!isOwner) {
      setTopupNotice('เฉพาะ owner เท่านั้นที่ยกเลิกรายการเติมเงินได้');
      return;
    }

    const reason = window.prompt('เหตุผลที่ยกเลิกรายการเติมเงิน')?.trim();
    if (!reason) {
      return;
    }

    try {
      await axios.delete(
        `${API_BASE_URL}/api/app-sessions/${encodeURIComponent(scanSessionId)}/topups/${encodeURIComponent(id)}`,
        { data: { reason } },
      );
      await refreshTopups();
      setTopupNotice(`ยกเลิกรายการ ${id} แล้ว`);
    } catch {
      setTopupNotice('ยกเลิกรายการเติมเงินไม่สำเร็จ');
    }
  }

  async function applyStockCorrection() {
    if (!isOwner) {
      setApiStatus('เฉพาะ owner เท่านั้นที่ปรับ stock ได้');
      return;
    }

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
      await refreshStockLog();
      setApiStatus('ปรับ stock ใน tingkum_db แล้ว');
    } catch {
      setApiStatus('ปรับ stock ไม่สำเร็จ | เชื่อมต่อ tingkum_db ไม่ได้');
      return;
    }

    setCorrectionDelta('1');
    setCorrectionReason('');
  }

  async function createStockProduct() {
    if (!isOwner) {
      setApiStatus('เฉพาะ owner เท่านั้นที่เพิ่มสินค้าได้');
      return;
    }

    const barcode = stockProductDraft.barcode.trim();
    const name = stockProductDraft.name.trim();
    const price = Number(stockProductDraft.price);
    const stock = Number(stockProductDraft.stock);
    const minStock = Number(stockProductDraft.minStock);
    const category = stockProductDraft.category.trim() || 'ทั่วไป';
    const unit = stockProductDraft.unit.trim() || 'ชิ้น';

    if (!barcode || !name || !Number.isFinite(price) || price <= 0 || !Number.isFinite(stock) || stock < 0) {
      setApiStatus('กรอกบาร์โค้ด ชื่อสินค้า ราคา และจำนวนเริ่มต้นให้ถูกต้อง');
      return;
    }

    try {
      const response = await axios.post<ApiProduct>(`${API_BASE_URL}/api/products`, {
        barcode,
        name,
        price,
        cost: price,
        stock,
        category,
        minStock: Number.isFinite(minStock) ? minStock : 5,
        unit,
        reason: 'create product from stock page',
      });
      const product = normalizeProduct(response.data);
      await refreshProducts();
      await refreshStockLog();
      setSelectedStockCategory(product.category);
      setCorrectionProductId(String(product.id));
      setStockProductDraft({
        barcode: '',
        name: '',
        price: '',
        stock: '1',
        category,
        minStock: '5',
        unit,
      });
      setApiStatus(`เพิ่มสินค้า ${product.name} ลง tingkum_db แล้ว`);
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 409) {
        setApiStatus(`บาร์โค้ด ${barcode} มีอยู่แล้ว`);
        return;
      }
      setApiStatus('เพิ่มสินค้าไม่สำเร็จ');
    }
  }

  async function deleteStockProduct(product: Product) {
    if (!isOwner) {
      setApiStatus('เฉพาะ owner เท่านั้นที่ลบสินค้าได้');
      return;
    }

    const reason = window.prompt(`เหตุผลที่ลบสินค้า ${product.name}`)?.trim();
    if (!reason) {
      return;
    }

    try {
      await axios.delete(`${API_BASE_URL}/api/products/${product.id}`, { data: { reason } });
      await refreshProducts();
      await refreshStockLog();
      setApiStatus(`ลบสินค้า ${product.name} แล้ว`);
    } catch {
      setApiStatus('ลบสินค้าไม่สำเร็จ');
    }
  }

  async function saveProductDetails(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!productEdit || productEditBusy) return;
    setProductEditBusy(true);
    setProductEditError('');
    try {
      const { data } = await axios.patch<ApiProduct>(`${API_BASE_URL}/api/products/${productEdit.id}`, {
        barcode: productEdit.barcode.trim(), price: Number(productEdit.price || 0),
      });
      setStockItems((items) => items.map((item) => item.id === data.id ? normalizeProduct(data) : item));
      setProductEdit(undefined);
    } catch (error) {
      setProductEditError(axios.isAxiosError(error) && error.response?.status === 409 ? 'บาร์โค้ดนี้มีสินค้าใช้อยู่แล้ว' : errorText(error));
    } finally {
      setProductEditBusy(false);
    }
  }

  async function createGasStockItem() {
    if (!isOwner) {
      setApiStatus('เฉพาะ owner เท่านั้นที่เพิ่มรายการแก๊สได้');
      return;
    }

    const brand = gasItemDraft.brand;
    if (!brand) {
      setApiStatus('กรุณาเลือกยี่ห้อแก๊ส');
      return;
    }
    const id = gasItemDraft.id.trim().toUpperCase();
    const name = gasItemDraft.name.trim();
    const operation = gasItemDraft.operation.trim() || 'ขายแก๊ส';
    const price = Number(gasItemDraft.price);
    const fullStock = Number(gasItemDraft.fullStock);
    const emptyStock = Number(gasItemDraft.emptyStock);
    const imageUrl = gasItemDraft.imageUrl.trim();

    if (!id || !name || !Number.isFinite(price) || price <= 0 || !Number.isFinite(fullStock) || fullStock < 0 || !Number.isFinite(emptyStock) || emptyStock < 0) {
      setApiStatus('กรอกรหัส ชื่อถัง ราคา จำนวนถังเต็ม และจำนวนถังเปล่าให้ถูกต้อง');
      return;
    }

    try {
      const response = await axios.post<ApiGasItem>(`${API_BASE_URL}/api/gas/items`, {
        id,
        brand,
        name,
        operation,
        price,
        stock: fullStock,
        fullStock,
        emptyStock,
        imageUrl,
        reason: 'create gas item from stock page',
      });
      const gasItem = normalizeGasItem(response.data);
      await refreshGasItems();
      await refreshStockLog();
      setGasCorrectionItemId(gasItem.id);
      setGasItemDraft({
        id: '',
        brand,
        name: '',
        operation,
        price: '',
        fullStock: '1',
        emptyStock: '0',
        imageUrl: '',
      });
      setApiStatus(`เพิ่มแก๊ส ${gasItem.name} ลง tingkum_db แล้ว`);
    } catch {
      setApiStatus('เพิ่มรายการแก๊สไม่สำเร็จ');
    }
  }

  async function updateGasItemBrand(item: GasItem, brand: GasBrand) {
    if (!isOwner || !GAS_BRANDS.includes(brand)) return;
    try {
      await axios.patch(`${API_BASE_URL}/api/gas/items/${encodeURIComponent(item.id)}`, {
        brand, reason: 'กำหนดยี่ห้อถังแก๊ส',
      });
      setGasQuantities({});
      await refreshGasItems();
      setApiStatus(`กำหนดยี่ห้อ ${item.name} เป็น${brand}แล้ว`);
    } catch {
      setApiStatus('กำหนดยี่ห้อแก๊สไม่สำเร็จ');
    }
  }

  async function deleteGasStockItem(item: GasItem) {
    if (!isOwner) {
      setApiStatus('เฉพาะ owner เท่านั้นที่ลบรายการแก๊สได้');
      return;
    }

    const reason = window.prompt(`เหตุผลที่ลบรายการแก๊ส ${item.name}`)?.trim();
    if (!reason) {
      return;
    }

    try {
      await axios.delete(`${API_BASE_URL}/api/gas/items/${encodeURIComponent(item.id)}`, { data: { reason } });
      await refreshGasItems();
      await refreshStockLog();
      setApiStatus(`ลบรายการแก๊ส ${item.name} แล้ว`);
    } catch {
      setApiStatus('ลบรายการแก๊สไม่สำเร็จ');
    }
  }

  async function applyGasStockCorrection() {
    if (!isOwner) {
      setApiStatus('เฉพาะ owner เท่านั้นที่ปรับ stock แก๊สได้');
      return;
    }

    const gasItem = gasItems.find((item) => item.id === selectedGasCorrectionItemId);
    const delta = Number(gasCorrectionDelta);
    if (!gasItem || !Number.isFinite(delta) || delta === 0) {
      return;
    }

    if (!gasCorrectionReason.trim()) {
      setGasCorrectionReason('กรุณาระบุเหตุผล');
      return;
    }

    try {
      await axios.patch<ApiGasItem>(
        `${API_BASE_URL}/api/gas/items/${encodeURIComponent(gasItem.id)}/stock`,
        { delta, reason: gasCorrectionReason.trim(), stockKind: gasCorrectionStockKind },
      );
      await refreshGasItems();
      await refreshStockLog();
      setApiStatus('ปรับ stock แก๊สใน tingkum_db แล้ว');
    } catch {
      setApiStatus('ปรับ stock แก๊สไม่สำเร็จ');
      return;
    }

    setGasCorrectionDelta('1');
    setGasCorrectionReason('');
  }

  async function receiveBook() {
    if (receivingBook) return;
    setReceivingBook(true);
    try {
      const {data} = await axios.post(`${API_BASE_URL}/api/lottery/books`, {quantity: Number(lotteryStockDraft.quantity), price: Number(lotteryStockDraft.price)});
      setLotteryStockNotice(`รับสลากเข้าแล้ว ${data.total} ใบ`);
      await Promise.all([refreshLotteryTickets(), refreshStockLog()]);
    } catch { setLotteryStockNotice('รับเล่มไม่สำเร็จ ตรวจจำนวนและราคาอีกครั้ง'); }
    finally { setReceivingBook(false); }
  }

  async function addManualLotteryStock() {
    if (!isOwner) {
      setLotteryStockNotice('เฉพาะ owner เท่านั้นที่จัดการ stock หวยได้');
      return;
    }

    const number = lotteryStockDraft.number.trim();
    const quantity = Math.floor(Number(lotteryStockDraft.quantity));
    const price = Number(lotteryStockDraft.price);

    if (!/^\d{6}$/.test(number) || !Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(price) || price <= 0) {
      setLotteryStockNotice('กรอกเลข 6 หลัก จำนวน และราคาให้ถูกต้อง');
      return;
    }

    try {
      const response = await axios.post<LotteryTicket>(`${API_BASE_URL}/api/lottery/tickets`, {
        number,
        quantity,
        price,
        series: 'Manual',
        reason: 'manual lottery stock',
      });
      await refreshLotteryTickets();
      await refreshStockLog();
      setLotteryCart((previous) =>
        previous.map((item) =>
          item.id === String(response.data.id) ? { ...item, price } : item,
        ),
      );
      setLotteryStockDraft({ number: '', quantity: '1', price: String(price) });
      setLotteryStockNotice(`เพิ่ม/อัปเดตเลข ${number} จำนวน ${quantity} ใบแล้ว`);
      setLotteryNotice(`stock เลข ${number} พร้อมขายแล้ว`);
    } catch {
      setLotteryStockNotice('เพิ่ม stock หวยลง tingkum_db ไม่สำเร็จ');
    }
  }

  async function removeManualLotteryStock(number: string) {
    if (!isOwner) {
      setLotteryStockNotice('เฉพาะ owner เท่านั้นที่ลบ stock หวยได้');
      return;
    }

    const ticket = lotteryTickets.find((item) => item.number === number);
    if (!ticket) {
      return;
    }

    try {
      await axios.delete(`${API_BASE_URL}/api/lottery/tickets/${encodeURIComponent(String(ticket.id))}`, {
        data: { reason: 'remove lottery stock' },
      });
      await refreshLotteryTickets();
      await refreshLotteryCart();
      setLotteryStockNotice(`ลบเลข ${ticket.number} ออกจาก stock หวยแล้ว`);
    } catch {
      setLotteryStockNotice('ลบ stock หวยจาก tingkum_db ไม่สำเร็จ');
    }
  }

  async function addStaff() {
    if (!isOwner) {
      return;
    }

    if (!staffForm.name.trim() || !staffForm.phone.trim()) {
      return;
    }

    try {
      const response = await axios.post<StaffMember>(`${API_BASE_URL}/api/staff`, staffForm);
      setStaffMembers((previous) => [...previous, response.data]);
      setStaffForm({ name: '', phone: '', role: 'ขายหน้าร้าน' });
    } catch {
      setApiStatus('เพิ่มพนักงานลง tingkum_db ไม่สำเร็จ');
    }
  }

  async function toggleStaffStatus(id: string) {
    if (!isOwner) {
      return;
    }

    const staff = staffMembers.find((item) => item.id === id);
    if (!staff) {
      return;
    }

    try {
      const response = await axios.patch<StaffMember>(`${API_BASE_URL}/api/staff/${encodeURIComponent(id)}`, {
        active: !staff.active,
        reason: 'toggle staff active',
      });
      setStaffMembers((previous) => previous.map((item) => item.id === id ? response.data : item));
    } catch {
      setApiStatus('เปลี่ยนสถานะพนักงานไม่สำเร็จ');
    }
  }

  async function addUser() {
    if (!isOwner) {
      return;
    }

    if (!userForm.username.trim() || !userForm.displayName.trim() || userForm.password.length < 6) {
      setApiStatus('กรอก username, ชื่อผู้ใช้ และ password อย่างน้อย 6 ตัว');
      return;
    }

    try {
      await axios.post<AuthUser>(`${API_BASE_URL}/api/users`, userForm);
      await refreshUsers();
      setUserForm({ username: '', displayName: '', password: '', role: 'user' });
      setApiStatus('เพิ่ม user แล้ว');
    } catch {
      setApiStatus('เพิ่ม user ไม่สำเร็จ');
    }
  }

  async function toggleUserStatus(user: AuthUser) {
    if (!isOwner || user.id === currentUser?.id) {
      return;
    }

    try {
      await axios.patch<AuthUser>(`${API_BASE_URL}/api/users/${user.id}`, {
        active: !user.active,
        reason: 'toggle user active',
      });
      await refreshUsers();
    } catch {
      setApiStatus('เปลี่ยนสถานะ user ไม่สำเร็จ');
    }
  }

  async function resetUserPassword() {
    if (!isOwner || !passwordResetTarget || passwordBusy) return;
    setPasswordError('');
    setPasswordSaved(false);
    if (!validateNewPassword()) return;
    setPasswordBusy(true);
    try {
      const { data } = await axios.patch<AuthUser>(`${API_BASE_URL}/api/users/${passwordResetTarget.id}`, {
        password: passwordForm.newPassword, reason: 'owner reset password',
      });
      setUsers((previous) => previous.map((user) => user.id === data.id ? normalizeAuthUser(data) : user));
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setPasswordVisible(false);
      setPasswordNotice(`ตั้งรหัสผ่านใหม่ให้ ${passwordResetTarget.username} แล้ว อุปกรณ์อื่นของบัญชีนี้ต้องเข้าสู่ระบบใหม่`);
      setPasswordSaved(true);
    } catch { setPasswordError('ตั้งรหัสผ่านไม่สำเร็จ กรุณาลองอีกครั้ง'); }
    finally { setPasswordBusy(false); }
  }

  async function downloadSaleRecordPdf(sale: SaleRecord) {
    if (sale.status === LOTTERY_PENDING) { setHistoryNotice('รอเจ้าของร้านยืนยันก่อนออกใบเสร็จ'); return; }
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
      ['ยอดขายและค่าบริการ', analyticsCombinedTotal],
      ['ยอดขาย', analyticsTotal],
      ['ค่าบริการรับโอน', transferSummary.fee / 100],
      ['ยอดโอนให้ลูกค้า', transferSummary.principal / 100],
      ['รายการรับโอนสำเร็จ', transferSummary.count],
      ['รายการรับโอนยกเลิก', transferSummary.cancelled],
      ['เงินสดรับจากบริการโอน', transferSummary.cashReceived / 100],
      ['เงินทอนจากบริการโอน', transferSummary.change / 100],
      ['เงินสดสุทธิที่รับจากบริการโอน', transferSummary.cashNet / 100],
      ['จำนวนบิล', analyticsSaleCount],
      ['ยอดเฉลี่ยต่อบิล', Math.round(analyticsAverageBill * 100) / 100],
      ['จำนวนชิ้นที่ขาย', analyticsItemCount],
      ['ส่วนลดรวม', analyticsDiscountTotal],
      ['บิลสำเร็จ', analyticsSuccessfulCount],
      ['บิลยกเลิก', analyticsCancelledCount],
      ['บิลค้าง/กำลังดำเนินการ', analyticsPendingCount],
      ['สินค้าใกล้หมด', lowStockCount],
      ['มูลค่าสต็อกประมาณ', stockValue],
      ['มูลค่าหวยคงเหลือ', possibleLotteryRevenue],
      [],
      ['ช่องทาง', 'จำนวนรายการ', 'ยอดขายและค่าบริการ'],
      ...saleChannels.map((channel) => [
        saleChannelMeta[channel].label,
        analyticsChannelTotals[channel].count,
        analyticsChannelTotals[channel].total,
      ]),
      ['รับโอนเงิน (ค่าบริการ)', transferSummary.count, transferSummary.fee / 100],
      [],
      ['การชำระเงิน', 'จำนวนรายการ', 'ยอดขายและค่าบริการ'],
      ...analyticsPaymentTotals.map((payment) => [payment.method, payment.count, payment.total]),
      [],
      ['Trend', 'จำนวนรายการ', 'ยอดขายและค่าบริการ'],
      ...analyticsTrendRows.map((row) => [row.label, row.count, row.total]),
      [],
      ['หมวดและบริการ', 'ยอดขายและค่าบริการ'],
      ...categorySales.map((category) => [category.label, category.value]),
      [],
      ['ผลงานพนักงาน', 'จำนวนรายการ', 'ยอดขายและค่าบริการ'],
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
        `${sale.note ?? ''}${sale.submittedByName ? ' | ผู้ทำ: ' + sale.submittedByName : ''}${sale.confirmedByName ? ' | ผู้ยืนยัน: ' + sale.confirmedByName + ' ' + (sale.confirmedAt ?? '') : ''}`,
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
        excelWorksheet('Transfers', [
          ['วันที่เวลา', 'เลขที่', 'ผู้บันทึก', 'ธนาคาร', 'ยอดโอน', 'ค่าบริการ', 'เงินสดรับ', 'เงินทอน', 'สถานะ', 'เหตุผลยกเลิก', 'หมายเหตุ'],
          ...analyticsTransfers.map((record) => [formatReceiptDateTime(new Date(record.createdAt)), record.id, record.staff, record.bank,
            record.principal / 100, record.fee / 100, record.cashReceived / 100, record.change / 100,
            record.cancelledAt ? 'ยกเลิก' : 'สำเร็จ', record.cancelReason ?? '', record.note]),
        ]),
      ],
    );
    setAnalyticsNotice(`ส่งออก Excel ${analyticsSales.length} บิลขายและ ${analyticsTransfers.length} รายการรับโอนแล้ว`);
  }

  function renderPosCheckout() {
    const titles = ['รายการสินค้า', 'เลือกคนขาย', 'รับเงินและเงินทอน', 'ชำระเงินและพิมพ์ใบเสร็จ'];
    function back() {
      if (isPrintingReceipt) return;
      if (checkoutStep === 0) closePosCheckout();
      else setCheckoutStep(checkoutStep - 1);
    }
    function chooseAmount(field: PosAmountField) {
      setPosAmountField(field);
      setAmountBuffer('');
    }
    function keypress(key: string) {
      const next = key === 'ลบ' ? amountBuffer.slice(0,-1) : amountBuffer + key;
      if (!/^\d{0,8}(?:\.\d{0,2})?$/.test(next)) return;
      setAmountBuffer(next);
      (posAmountField === 'discount' ? setBillDiscount : setCashReceived)(Number(next) || 0);
    }
    const canAdvance = posCart.length > 0 && (checkoutStep < 1 || !!cashierId) && (checkoutStep < 2 || cashReceived >= posTotal && billDiscount <= posSubtotal);
    return <dialog className="pos-checkout-dialog shop-wizard" id="pos-checkout-dialog" aria-labelledby="pos-checkout-title"
      ref={dialog => {posCheckoutRef.current = dialog; if (dialog && !dialog.open) dialog.showModal();}}
      onCancel={event => {event.preventDefault(); back();}}>
      <header><small>ชำระเงิน · {checkoutStep + 1} / 4</small><h2 id="pos-checkout-title">{titles[checkoutStep]}</h2></header>
      {checkoutStep === 0 && <div>{posCart.map(item => <div className="bill-line" key={item.id}><span>{item.name} × {item.quantity}</span><b>{formatMoney(item.price * item.quantity - item.discount)}</b></div>)}<strong>รวม {formatMoney(posSubtotal)}</strong></div>}
      {checkoutStep === 1 && <div className="touch-options">{activeStaff.map(staff => <button key={staff.id} aria-pressed={cashierId === staff.id} onClick={() => setCashierId(staff.id)}>{staff.name}</button>)}</div>}
      {checkoutStep === 2 && <div className="tender-grid"><div className="money-fields">
        <button aria-pressed={posAmountField === 'discount'} onClick={() => chooseAmount('discount')}>ส่วนลดท้ายบิล <b>{formatMoney(billDiscount)}</b></button>
        <div>ยอดที่ต้องชำระ <strong>{formatMoney(posTotal)}</strong></div>
        <button aria-pressed={posAmountField !== 'discount'} onClick={() => chooseAmount('cash')}>รับเงินมา <b>{formatMoney(cashReceived)}</b></button>
        <button onClick={() => {setCashReceived(posTotal);chooseAmount('cash');}}>รับพอดี</button>
        <div>{cashReceived < posTotal ? 'ยังขาด' : 'เงินทอน'} <strong>{formatMoney(Math.abs(cashReceived-posTotal))}</strong></div>
        {billDiscount > posSubtotal && <p>ส่วนลดเกินยอดสินค้า</p>}</div>
        <div className="number-pad"><output className="keypad-readout">{posAmountField === 'discount' ? 'ส่วนลด' : 'รับเงิน'} · {amountBuffer || (posAmountField === 'discount' ? billDiscount : cashReceived)}</output>{['7','8','9','4','5','6','1','2','3','.','0','ลบ'].map(key => <button key={key} onClick={() => keypress(key)}>{key}</button>)}</div></div>}
      {checkoutStep === 3 && <div className="money-fields"><div>คนขาย <b>{activeStaff.find(staff => staff.id === cashierId)?.name}</b></div><div>ยอดสุทธิ <strong>{formatMoney(posTotal)}</strong></div><div>รับเงิน <b>{formatMoney(cashReceived)}</b></div><div>เงินทอน <strong>{formatMoney(posChange)}</strong></div></div>}
      <p role="status">{posNotice}</p><footer><button disabled={isPrintingReceipt} onClick={back}>ย้อนกลับ</button><button className="primary-action" disabled={!canAdvance || isPrintingReceipt} onClick={() => checkoutStep === 3 ? void completePosSale() : setCheckoutStep(checkoutStep + 1)}>{['ยืนยันรายการ','ถัดไป','ถัดไป',isPrintingReceipt ? 'กำลังบันทึก…' : 'ชำระเงิน / พิมพ์ใบเสร็จ'][checkoutStep]}</button></footer>
    </dialog>;
  }

  function renderPosPage() {
    return (
      <div className={`pos-layout${isCompactPos ? ' compact-pos' : ''}`}>
        <section className="panel pos-workspace">
          <PanelTitle
            icon="barcode_scanner"
            title="ขายสินค้า"
            detail={posNotice}
            actions={(
              <button
                className="session-qr-top-button"
                type="button"
                aria-haspopup="dialog"
                aria-expanded={sessionQrOpen}
                onClick={() => setSessionQrOpen(true)}
              >
                <Icon name="qr_code_2" /> QR มือถือ
              </button>
            )}
          />

          <div className="input-grid">
            <label className="field">
              <span>สแกนสินค้า</span>
              <div className="input-with-button">
                <input
                  ref={barcodeInputRef}
                  value={barcodeInput}
                  onChange={(event) => setBarcodeInput(event.target.value)}
                  onKeyDown={(event) => event.key === 'Enter' && scanProduct()}
                  placeholder={isCompactPos ? 'บาร์โค้ด / ชื่อสินค้า' : 'ยิงบาร์โค้ดหรือพิมพ์ชื่อสินค้า'}
                  autoFocus={!isCompactPos}
                />
                <button type="button" onClick={scanProduct}><Icon name="add_shopping_cart" /> เพิ่ม</button>
                <button className="mobile-camera-toggle" type="button" onClick={toggleMobileScanner}>
                  <Icon name={mobileScannerOpen ? 'keyboard_arrow_up' : 'photo_camera'} />
                  {mobileScannerOpen ? 'ปิด' : 'Scan'}
                </button>
              </div>
            </label>


          </div>

          <div className={`mobile-camera-panel ${mobileScannerOpen ? 'open' : ''}`}>
            <div className="scanner-camera-frame mobile-camera-frame">
              <video ref={scannerVideoRef} muted playsInline autoPlay aria-label="Barcode camera preview" />
              {!cameraActive && (
                <div>
                  <Icon name="photo_camera" />
                  <span>กด Scan เพื่อเปิดกล้อง หรือกรอกบาร์โค้ดด้านล่าง</span>
                </div>
              )}
            </div>

            {(activeCameraLabel || cameraDevices.length > 1) && (
              <div className="mobile-camera-actions">
                <small>{activeCameraLabel ? `กล้อง: ${activeCameraLabel}` : 'กำลังเลือกกล้องหลัง'}</small>
                {cameraDevices.length > 1 && (
                  <button type="button" onClick={() => void switchMobileCamera()}>
                    <Icon name="cameraswitch" /> สลับกล้อง
                  </button>
                )}
              </div>
            )}

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

          {sessionQrOpen && (
            <div className="session-qr-overlay" role="presentation" onClick={() => setSessionQrOpen(false)}>
              <div
                className="session-qr-dialog"
                role="dialog"
                aria-modal="true"
                aria-labelledby="session-qr-title"
                onClick={(event) => event.stopPropagation()}
              >
                <div className="session-qr-dialog-head">
                  <div>
                    <span className="badge neutral">POS Session</span>
                    <h3 id="session-qr-title">สแกน QR เพื่อเปิดบนมือถือ</h3>
                    <small>Session {scanSessionId}</small>
                  </div>
                  <button type="button" aria-label="ปิด QR" onClick={() => setSessionQrOpen(false)}>
                    <Icon name="close" />
                  </button>
                </div>

                <div className="session-qr-code large">
                  <QRCodeSVG
                    value={scannerUrl}
                    size={248}
                    level="M"
                    marginSize={2}
                    bgColor="#ffffff"
                    fgColor="#111827"
                    title={`POS session ${scanSessionId}`}
                  />
                </div>

                <label className="field session-qr-url">
                  <span>ลิงก์สำรอง</span>
                  <input value={scannerUrl} readOnly onFocus={(event) => event.target.select()} />
                </label>
              </div>
            </div>
          )}

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
                  <Icon name="inventory" /> {isOwner ? 'ลงทะเบียนสินค้าใหม่' : 'ส่งให้ owner อนุมัติ'}
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

        <button className="secondary-action" disabled={!posCart.length} onClick={clearPosCart}>ล้างบิล</button>
        <>
            <button
              className="pos-cart-trigger"
              type="button"
              aria-haspopup="dialog"
              aria-expanded={posCheckoutOpen}
              aria-controls={posCheckoutOpen ? 'pos-checkout-dialog' : undefined}
              onClick={(event) => {
                event.currentTarget.focus({ preventScroll: true });
                setMobileScannerOpen(false);
                setCheckoutStep(0); setAmountBuffer(''); setPosAmountField('cash'); setPosCheckoutOpen(true);
              }}
            >
              <span className="pos-cart-symbol"><Icon name="shopping_cart" /></span>
              <span>ตะกร้า <small>{posCart.length} รายการ</small></span>
              <strong>{formatMoney(posTotal)}</strong>
              <Icon name="chevron_right" />
            </button>
            {posCheckoutOpen && renderPosCheckout()}
          </>
      </div>
    );
  }

  function renderGasPage() {
    const gasSaleCount = gasJobs.length;

    return (
      <div className={`gas-sales-page gas-step-${gasStep}`}>
        <section className="gas-sale-header">
          <div>
            <h2>ขายแก๊ส</h2>

          </div>
          <div className="gas-header-actions">
            <button className="secondary-action" type="button" onClick={() => setCurrentView('HISTORY')}>
              <Icon name="history" /> ประวัติย้อนหลัง
            </button>

          </div>
        </section>

        <GasVoiceInput key={gasVoiceSession} onApply={applyGasVoice} onBusyChange={setGasVoiceBusy} />

        {gasStep === 'selection' && <section className="panel gas-tank-panel">
          <PanelTitle icon="propane_tank" title="เลือกยี่ห้อแก๊ส" detail={gasNotice} />
          <div className="touch-options gas-brands">{GAS_BRANDS.map(brand => <button key={brand} aria-pressed={gasBrand === brand} onClick={() => selectGasBrand(brand)}><img src={brand === 'สยาม' ? '/brands/siam.png' : '/brands/ptt.svg'} alt=""/>{brand}</button>)}</div>
          {gasBrand && <h3>เลือกขนาดถัง · {gasBrand}</h3>}
          <div className="gas-tank-grid">
            {!gasBrand ? null : visibleGasItems.length === 0 ? (
              <EmptyState text={`ยังไม่มีถังยี่ห้อ${gasBrand} ไปเพิ่มหรือกำหนดยี่ห้อที่เมนูสต็อก`} />
            ) : visibleGasItems.map((item) => (
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

                <img src={item.imageUrl} alt={item.name} />
                <strong>{item.name}</strong>
                <span>{formatMoney(item.price)}</span>
                <div className="gas-stock-counts">
                  <small><b>{item.fullStock}</b> เต็ม</small>
                  <small><b>{item.emptyStock}</b> เปล่า</small>
                  <small><b>{item.totalStock}</b> รวม</small>
                </div>
                <div className="stepper large">
                  <button
                    type="button"
                    disabled={(gasQuantities[item.id] ?? 0) <= 0}
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
                    disabled={(gasQuantities[item.id] ?? 0) >= item.fullStock}
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
          {gasItems.some((item) => !item.brand) && <p role="status">มีถังที่ยังไม่ระบุยี่ห้อ กรุณากำหนดยี่ห้อที่เมนูสต็อกก่อนขาย</p>}
          <button className="primary-action gas-next" disabled={!gasSelectedCount} onClick={() => setGasStep('delivery')}>ถัดไป · กรอกรายละเอียด</button>
        </section>}

        {gasStep === 'delivery' && <section className="panel gas-details-panel">
          <button className="secondary-action" onClick={() => setGasStep('selection')}>ย้อนกลับ · แก้ไขถัง</button>
          <PanelTitle icon="pin_drop" title="รายละเอียดการส่ง" detail={gasBrand + ' · ' + gasOrderItems.map(item => item.name + ' × ' + item.quantity).join(', ')} />
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
              <span>เบอร์โทรศัพท์ (ถ้ามี)</span>
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
        </section>}

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

        {gasStep === 'delivery' && <aside className="panel gas-status-panel">
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
              <input type="checkbox" checked={gasPaid} disabled={!isOwner} onChange={(event) => setGasPaid(event.target.checked)} />
              <i></i>
            </label>
          </div>

          <div className="gas-summary-lines">
            <div><span>ถังเต็มคงเหลือ</span><strong>{gasFullStockTotal}</strong></div>
            <div><span>ถังเปล่าคงเหลือ</span><strong>{gasEmptyStockTotal}</strong></div>
            <div><span>ถังรวมในระบบ</span><strong>{gasStockTotal}</strong></div>
            <div><span>จำนวนถัง</span><strong>{gasSelectedCount}</strong></div>
            <div><span>ราคาสินค้า</span><strong>{formatMoney(gasSubtotal)}</strong></div>
            <label>
              <span>ค่าส่ง</span>
              <input type="number" min="0" value={gasDeliveryFee || ''} onChange={(event) => setGasDeliveryFee(Number(event.target.value))} />
            </label>
            <div className="gas-net-total"><span>ยอดรวมสุทธิ</span><strong>{formatMoney(gasTotal)}</strong></div>
          </div>
          <button className="primary-action" disabled={gasVoiceBusy || !gasBrand || !gasOrderItems.length || !gasCustomer.name.trim() || !gasCustomer.address.trim() || !gasDriverId} onClick={createGasJob}>ทำรายการแก๊ส</button>
        </aside>}

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
                    <div className="row-actions">
                      <button type="button" disabled={!isOwner} onClick={() => completeGasJob(job.id)}>ปิดงาน</button>
                      <button className="link-button danger" type="button" disabled={!isOwner} onClick={() => cancelGasJob(job.id)}>ยกเลิก</button>
                    </div>
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
                        <button type="button" disabled={!isOwner} onClick={() => updatePendingReturnQuantity(item, -1)}><Icon name="remove" /></button>
                        <span>{pendingReturnQuantityFor(item)}</span>
                        <button type="button" disabled={!isOwner} onClick={() => updatePendingReturnQuantity(item, 1)}><Icon name="add" /></button>
                      </div>
                      <button type="button" disabled={!isOwner} onClick={() => completeGasReturn(item.id, pendingReturnQuantityFor(item))}>รับคืน</button>
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
    const inCart = lotteryCart.find(item => item.id === String(matchingTicket?.id))?.quantity ?? 0;
    const sold = matchingTicket ? salesHistory.filter(sale => sale.channel === 'LOTTERY' && !sale.cancelledAt).flatMap(sale => sale.items)
      .filter(item => String(item.ticketId ?? item.id) === String(matchingTicket.id)).reduce((sum,item) => sum + item.quantity,0) : 0;

    return (
      <div className="lottery-sales-page">
        <section className="panel lottery-entry-panel">
          <PanelTitle icon="confirmation_number" title="ขายหวย" detail={lotteryNotice} />
          <div className="touch-options lottery-tabs">
            <button aria-pressed={lotteryTab === 'keypad'} onClick={() => setLotteryTab('keypad')}>แป้นเลข</button>
            <button aria-pressed={lotteryTab === 'map'} onClick={() => setLotteryTab('map')}>ผังสี 00–99</button>
          </div>
          {lotteryTab === 'map' ? <div>
            <div className="lottery-stock-legend" aria-label="คำอธิบายสีสต็อกหวย">
              <span data-stock-level="empty">หมด · 0%</span><span data-stock-level="low">น้อย · 1–33%</span>
              <span data-stock-level="medium">กลาง · 34–66%</span><span data-stock-level="high">มาก/เต็ม · 67–100%</span>
            </div>
            <p className="lottery-stock-hint">สีเทียบยอดเต็มของแต่ละเลข · จำนวนพร้อมขายหักรายการในตะกร้าแล้ว</p>
            <div className="suffix-grid">{Array.from({ length: 100 }, (_, i) => String(i).padStart(2, '0')).map(number => {
              const ticket = lotteryTickets.find(row => row.number === number);
              const available = Math.max(0, ticket ? lotteryAvailable(ticket) : 0);
              const heat = lotteryStockLevel(available, ticket?.stockReference ?? ticket?.remaining ?? 0);
              return <button key={number} data-stock-level={heat.level} aria-pressed={lotteryInput === number}
                aria-label={`เลข ${number} เหลือ ${available} ใบ ${heat.label}`} title={`${available}/${ticket?.stockReference ?? 0} ใบ · ${heat.percent}%`}
                disabled={available === 0} onClick={() => { setLotteryInput(number); setLotteryTab('keypad'); }}>
                {number}<small>{available} ใบ</small>
              </button>;
            })}</div>
          </div> : <div className="lottery-dial">
            <div className="lottery-selection" aria-live="polite">
              <label>เลขสลาก<input inputMode="numeric" aria-label="เลขสลาก" value={lotteryInput} maxLength={6} placeholder="– –" onChange={e => setLotteryInput(e.target.value.replace(/\D/g,''))}/></label>
              {lotteryInput.length >= 2 && <><strong>{matchingTicket ? 'เหลือให้เลือก ' + lotteryAvailable(matchingTicket) + ' ใบ' : 'ไม่พบเลขนี้ในสต็อก'}</strong>
                {matchingTicket && <span>ในบิลนี้ {inCart} ใบ · ขายรอบนี้ {sold} ใบ</span>}</>}
              <button className="primary-action" disabled={!matchingTicket || lotteryAvailable(matchingTicket)<1} onClick={searchLottery}>เพิ่มเข้ารายการ</button>
            </div>
            <div className="counter-keys">{['1','2','3','4','5','6','7','8','9','ล้าง','0','ลบ'].map(key =>
              <button key={key} onClick={() => setLotteryInput(prev => key === 'ล้าง' ? '' : key === 'ลบ' ? prev.slice(0,-1) : (prev.length >= 2 ? '' : prev)+key)}>{key}</button>)}</div>
          </div>}
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
          <button className="primary-action" type="button" disabled={lotteryCheckoutBusy || lotteryCart.length === 0} onClick={completeLotterySale}>
            <Icon name="paid" /> {lotteryCheckoutBusy ? 'กำลังส่งรายการ…' : isOwner ? 'ยืนยันรายการและจ่ายแล้ว' : 'ส่งรายการให้เจ้าของร้านยืนยัน'}
          </button>
        </aside>
        <section className="panel lottery-approval-panel">
          <PanelTitle icon="fact_check" title={isOwner ? 'รายการหวยรอยืนยัน' : 'รายการหวยของฉันที่รอยืนยัน'} detail="กันสต็อกไว้แล้ว ยอดขายจะนับเมื่อเจ้าของร้านยืนยันรับเงิน" />
          {pendingLotterySales.filter((sale) => isOwner || sale.submittedBy === currentUser?.id).length === 0 ? <EmptyState text="ไม่มีรายการรอยืนยัน" /> :
            pendingLotterySales.filter((sale) => isOwner || sale.submittedBy === currentUser?.id).map((sale) => (
              <article className="lottery-approval-card" key={sale.id}>
                <strong>{sale.id}</strong><span>ผู้ทำรายการ: {sale.submittedByName || sale.staffName} · {formatReceiptDateTime(sale.createdAt)}</span>
                <p>{sale.items.map((item) => `${item.barcode || item.name} × ${item.quantity}`).join(' · ')}</p>
                <div>ยอดต้องเก็บ <b>{formatMoney(sale.total)}</b> · {sale.paymentMethod} · แจ้งรับเงิน {formatMoney(sale.reportedCashReceived ?? 0)}</div>
                {isOwner && <div className="lottery-approval-actions">
                  {sale.paymentMethod === 'เงินสด' && <label className="field"><span>เงินที่ตรวจรับจริง (บาท)</span><input type="number" min={sale.total} step="0.01" value={lotteryApprovalCash[sale.id] ?? String(sale.reportedCashReceived ?? sale.total)} onChange={(event) => setLotteryApprovalCash({ ...lotteryApprovalCash, [sale.id]: event.target.value })} /></label>}
                  <button type="button" className="primary-action" disabled={Boolean(lotteryApprovalBusy)} onClick={() => void confirmLotteryPayment(sale)}>ยืนยันรายการ / จ่ายแล้ว</button>
                  <button type="button" className="secondary-action" disabled={Boolean(lotteryApprovalBusy)} onClick={() => void cancelSaleRecord(sale)}>ยกเลิกรายการ</button>
                </div>}
              </article>
            ))}
        </section>
      </div>
    );
  }

  function renderTopupPage() {
    const pendingTopupCount = topupOrders.filter((order) => !order.toppedUp).length;
    const unpaidTopupCount = topupOrders.filter((order) => !order.paid).length;
    const topupTotal = topupOrders.reduce((sum, order) => sum + order.amount, 0);

    return (
      <div className="topup-page">
        <div className="touch-options" role="group" aria-label="หน้าเติมเงิน">
          <button type="button" aria-pressed={topupTab === 'entry'} onClick={() => setTopupTab('entry')}>เติมเงิน</button>
          <button type="button" aria-pressed={topupTab === 'orders'} onClick={() => setTopupTab('orders')}>รายการเติมเงิน ({topupOrders.length})</button>
        </div>
        {topupTab === 'entry' ? <section className="panel topup-entry-panel">
          <PanelTitle icon="phone_iphone" title="เติมเงินมือถือ" detail={topupNotice} />

          <div className="topup-provider-grid" aria-label="เลือกผู้ให้บริการ">
            {topupProviders.map((provider) => (
              <button
                type="button"
                key={provider}
                className={topupProvider === provider ? 'active' : ''}
                onClick={() => setTopupProvider(provider)}
              >
                <img className={'carrier-logo carrier-'+provider} src={'/brands/'+provider+(provider === 'DTAC' ? '.png' : '.svg')} alt="" />
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
              ลบ
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
              <span>ระบุยอดอื่น (บาท)</span>
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
        </section> : <section className="panel topup-orders-panel">
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
                          disabled={!isOwner || order.status === 'CANCELLED'}
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
                          disabled={!isOwner || order.status === 'CANCELLED'}
                          onClick={() => toggleTopupOrderStatus(order.id, 'paid')}
                        >
                          <Icon name={order.paid ? 'payments' : 'pending'} />
                          {order.paid ? 'จ่ายแล้ว' : 'ยังไม่จ่าย'}
                        </button>
                      </td>
                      <td>
                        <button className="link-button" type="button" disabled={!isOwner || order.status === 'CANCELLED'} onClick={() => removeTopupOrder(order.id)}>
                          {order.status === 'CANCELLED' ? 'ยกเลิกแล้ว' : 'ยกเลิก'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>}
      </div>
    );
  }

  function renderHistoryPage() {
    const filterOptions: Array<{ value: SaleChannel | 'ALL'; label: string; icon: string }> = [
      { value: 'ALL', label: 'ทั้งหมด', icon: 'receipt_long' },
      { value: 'POS', label: 'POS', icon: saleChannelMeta.POS.icon },
      { value: 'GAS', label: 'แก๊ส', icon: saleChannelMeta.GAS.icon },
      { value: 'LOTTERY', label: 'หวย', icon: saleChannelMeta.LOTTERY.icon },
      { value: 'TOPUP', label: 'Topup', icon: saleChannelMeta.TOPUP.icon },
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
              <button
                className="secondary-action danger"
                type="button"
                onClick={() => cancelSaleRecord(selectedSale)}
                disabled={!isOwner || isCancelledStatus(selectedSale.status)}
              >
                <Icon name="cancel" /> {isCancelledStatus(selectedSale.status) ? 'ยกเลิกแล้ว' : 'ยกเลิกรายการ'}
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
      <div className="analytics-page" aria-busy={isAnalyticsLoading}>
        <section className="analytics-toolbar panel">
          <div>
            <h2>Analytics Dashboard</h2>
            <p>{periodLabel} {analyticsRangeLabel} | {isAnalyticsLoading ? 'กำลังโหลดข้อมูล…' : analyticsNotice}</p>
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
            <span>ยอดขายและค่าบริการ</span>
            <strong>{formatMoney(analyticsCombinedTotal)}</strong>
            <small>ขาย {formatMoney(analyticsTotal)} + ค่าบริการ {baht(transferSummary.fee)}</small>
          </div>
          <div className="metric-card success">
            <span>บิลขายสำเร็จ</span>
            <strong>{analyticsSuccessfulCount}</strong>
            <small>ค้าง {analyticsPendingCount} | ยกเลิก {analyticsCancelledCount}</small>
          </div>
          <div className="metric-card blue">
            <span>ยอดเฉลี่ยต่อบิลขาย</span>
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
          {saleChannels.map((channel) => {
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
          <div className="analytics-channel-card analytics-transfer-channel">
            <span className="sale-channel transfer"><Icon name="currency_exchange" /> รับโอนเงิน</span>
            <strong>{baht(transferSummary.fee)}</strong>
            <small>ค่าบริการ · {transferSummary.count} รายการสำเร็จ</small>
          </div>
        </section>

        <section className="panel analytics-transfer-summary" aria-label="สรุปบริการรับโอนเงิน">
          <PanelTitle icon="currency_exchange" title="บริการรับโอนเงิน" detail="ยอดรวมและกราฟรวมเฉพาะค่าบริการรับโอน" />
          <div className="analytics-transfer-metrics">
            <div><span>ยอดโอนให้ลูกค้า</span><strong>{baht(transferSummary.principal)}</strong></div>
            <div><span>ค่าบริการรับโอน</span><strong>{baht(transferSummary.fee)}</strong></div>
            <div><span>รายการรับโอนสำเร็จ</span><strong>{transferSummary.count} รายการ</strong></div>
            <div><span>เงินสดสุทธิที่รับ</span><strong>{baht(transferSummary.cashNet)}</strong></div>
          </div>
          <p className="analytics-transfer-note">เงินสดรับ {baht(transferSummary.cashReceived)} · เงินทอน {baht(transferSummary.change)} · ยกเลิก {transferSummary.cancelled} รายการ</p>
        </section>

        <section className="analytics-dashboard-grid">
          <section className="panel">
            <PanelTitle icon="show_chart" title={`ยอดขายและค่าบริการตาม${analyticsPeriod === 'day' ? 'ชั่วโมง' : analyticsPeriod === 'month' ? 'วัน' : 'เดือน'}`} detail={analyticsRange.startDate ? `${analyticsRange.startDate} ถึง ${analyticsRange.endDate}` : undefined} />
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
            <PanelTitle icon="bar_chart" title="ยอดตามหมวดและบริการ" />
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
                  <span>{payment.count} รายการ</span>
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
                  <span>{staff.count} รายการ</span>
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

        <section className="panel analytics-transfer-panel">
          <PanelTitle icon="currency_exchange" title="รายการรับโอนเงิน" detail={`${analyticsTransfers.length} รายการ | ${periodLabel} ${analyticsRangeLabel}`} />
          <div className="analytics-sales-table">
            {analyticsTransfers.length === 0 ? <EmptyState text="ยังไม่มีรายการรับโอนในช่วงนี้" /> : (
              <table>
                <thead><tr><th>วันที่เวลา</th><th>ธนาคาร</th><th>ผู้บันทึก</th><th>ยอดโอน</th><th>ค่าบริการ</th><th>เงินสดรับ</th><th>เงินทอน</th><th>สถานะ</th></tr></thead>
                <tbody>{analyticsTransfers.map((record) => (
                  <tr key={record.id}>
                    <td>{formatReceiptDateTime(new Date(record.createdAt))}</td>
                    <td>{record.bank || '—'}</td><td>{record.staff}</td>
                    <td>{baht(record.principal)}</td><td>{baht(record.fee)}</td>
                    <td>{baht(record.cashReceived)}</td><td>{baht(record.change)}</td>
                    <td><span className={`badge ${record.cancelledAt ? 'danger' : 'success'}`}>{record.cancelledAt ? 'ยกเลิก' : 'สำเร็จ'}</span>{record.cancelReason && <small>{record.cancelReason}</small>}</td>
                  </tr>
                ))}</tbody>
              </table>
            )}
          </div>
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
                      <td>{sale.staffName}{sale.confirmedByName && <small>ยืนยันโดย {sale.confirmedByName}</small>}</td>
                      <td>{sale.items.reduce((sum, item) => sum + item.quantity, 0)}</td>
                      <td>
                        <span className={`badge ${isCancelledStatus(sale.status) ? 'danger' : isCompletedStatus(sale.status) ? 'success' : 'warning'}`}>
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

          <div className="stock-inline-section">
            <PanelTitle icon="add_box" title="เพิ่มสินค้าใหม่" detail="สร้างสินค้า POS ลงฐานข้อมูลและบันทึก stock เริ่มต้น" />
            <div className="new-product-grid stock-product-form">
              <label className="field">
                <span>บาร์โค้ด</span>
                <input
                  value={stockProductDraft.barcode}
                  onChange={(event) => setStockProductDraft({ ...stockProductDraft, barcode: event.target.value.trim() })}
                  onKeyDown={(event) => event.key === 'Enter' && createStockProduct()}
                  placeholder="เช่น 8850001"
                />
              </label>
              <label className="field">
                <span>ชื่อสินค้า</span>
                <input
                  value={stockProductDraft.name}
                  onChange={(event) => setStockProductDraft({ ...stockProductDraft, name: event.target.value })}
                  onKeyDown={(event) => event.key === 'Enter' && createStockProduct()}
                  placeholder="เช่น น้ำดื่ม"
                />
              </label>
              <label className="field">
                <span>ราคาขาย</span>
                <input
                  type="number"
                  min="0"
                  value={stockProductDraft.price}
                  onChange={(event) => setStockProductDraft({ ...stockProductDraft, price: event.target.value })}
                  onKeyDown={(event) => event.key === 'Enter' && createStockProduct()}
                />
              </label>
              <label className="field">
                <span>จำนวนเริ่มต้น</span>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={stockProductDraft.stock}
                  onChange={(event) => setStockProductDraft({ ...stockProductDraft, stock: event.target.value })}
                />
              </label>
              <label className="field">
                <span>หมวดหมู่</span>
                <input
                  value={stockProductDraft.category}
                  onChange={(event) => setStockProductDraft({ ...stockProductDraft, category: event.target.value })}
                />
              </label>
              <label className="field">
                <span>ขั้นต่ำ</span>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={stockProductDraft.minStock}
                  onChange={(event) => setStockProductDraft({ ...stockProductDraft, minStock: event.target.value })}
                />
              </label>
              <label className="field">
                <span>หน่วย</span>
                <input
                  value={stockProductDraft.unit}
                  onChange={(event) => setStockProductDraft({ ...stockProductDraft, unit: event.target.value })}
                />
              </label>
              <button className="primary-action" type="button" disabled={!isOwner} onClick={createStockProduct}>
                <Icon name="add" /> เพิ่มสินค้า
              </button>
            </div>
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
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filteredStockItems.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <strong>{item.name}</strong>
                      <small>{item.barcode || 'ยังไม่มีบาร์โค้ด'}</small>
                    </td>
                    <td>{item.category}</td>
                    <td>{item.stock} {item.unit}</td>
                    <td>{item.minStock}</td>
                    <td>
                      <span className={`badge ${item.stock <= item.minStock ? 'warning' : 'success'}`}>
                        {item.stock <= item.minStock ? 'ใกล้หมด' : 'ปกติ'}
                      </span>
                    </td>
                    <td>
                      <button className="text-action" type="button" onClick={() => { setProductEditError(''); setProductEdit({ id: item.id, name: item.name, barcode: item.barcode, price: item.price ? String(item.price) : '' }); }}>แก้บาร์โค้ด / ราคา</button>
                      {' '}
                      <button className="link-button danger" type="button" disabled={!isOwner} onClick={() => deleteStockProduct(item)}>
                        ลบ
                      </button>
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

          <div className="stock-inline-section">
            <PanelTitle icon="propane_tank" title="ปรับ stock แก๊ส" detail="เพิ่มหรือลดยอดถังจากการนับผิดหรือรับของเข้า" />
            <div className="form-stack">
              <label className="field">
                <span>ถังแก๊ส</span>
                <select value={selectedGasCorrectionItemId} onChange={(event) => setGasCorrectionItemId(event.target.value)}>
                  {gasItems.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                </select>
              </label>
              <label className="field">
                <span>ชนิดถัง</span>
                <select value={gasCorrectionStockKind} onChange={(event) => setGasCorrectionStockKind(event.target.value as GasStockKind)}>
                  <option value="FULL">ถังเต็ม</option>
                  <option value="EMPTY">ถังเปล่า</option>
                </select>
              </label>
              <label className="field">
                <span>เพิ่ม/ลดจำนวน</span>
                <input type="number" value={gasCorrectionDelta} onChange={(event) => setGasCorrectionDelta(event.target.value)} />
              </label>
              <label className="field">
                <span>เหตุผล</span>
                <textarea value={gasCorrectionReason} onChange={(event) => setGasCorrectionReason(event.target.value)} placeholder="เช่น รับถังเพิ่ม / นับถังผิด / ถังเสีย" />
              </label>
              <button className="primary-action" type="button" onClick={applyGasStockCorrection}>
                <Icon name="save" /> บันทึก stock แก๊ส
              </button>
            </div>
          </div>
        </aside>

        <section className="panel wide-panel gas-stock-panel">
          <PanelTitle icon="propane_tank" title="Stock แก๊ส" detail={`${gasItems.length} รายการจาก tingkum_db`} />
          <div className="new-product-grid gas-stock-form">
            <label className="field">
              <span>ยี่ห้อแก๊ส</span>
              <select value={gasItemDraft.brand} onChange={(event) => setGasItemDraft({ ...gasItemDraft, brand: event.target.value as GasBrand })}>
                <option value="" disabled>เลือกยี่ห้อ</option>
                {GAS_BRANDS.map((brand) => <option key={brand} value={brand}>{brand}</option>)}
              </select>
            </label>
            <label className="field">
              <span>รหัสถัง</span>
              <input
                value={gasItemDraft.id}
                onChange={(event) => setGasItemDraft({ ...gasItemDraft, id: event.target.value.toUpperCase().replace(/\s/g, '-') })}
                onKeyDown={(event) => event.key === 'Enter' && createGasStockItem()}
                placeholder="เช่น GAS-450"
              />
            </label>
            <label className="field">
              <span>ชื่อถัง</span>
              <input
                value={gasItemDraft.name}
                onChange={(event) => setGasItemDraft({ ...gasItemDraft, name: event.target.value })}
                onKeyDown={(event) => event.key === 'Enter' && createGasStockItem()}
                placeholder="เช่น ถังแก๊ส 450"
              />
            </label>
            <label className="field">
              <span>ประเภท/ขนาด</span>
              <input
                value={gasItemDraft.operation}
                onChange={(event) => setGasItemDraft({ ...gasItemDraft, operation: event.target.value })}
                placeholder="เช่น ขายแก๊ส / 450"
              />
            </label>
            <label className="field">
              <span>ราคา</span>
              <input
                type="number"
                min="0"
                value={gasItemDraft.price}
                onChange={(event) => setGasItemDraft({ ...gasItemDraft, price: event.target.value })}
              />
            </label>
            <label className="field">
              <span>ถังเต็มเริ่มต้น</span>
              <input
                type="number"
                min="0"
                step="1"
                value={gasItemDraft.fullStock}
                onChange={(event) => setGasItemDraft({ ...gasItemDraft, fullStock: event.target.value })}
              />
            </label>
            <label className="field">
              <span>ถังเปล่าเริ่มต้น</span>
              <input
                type="number"
                min="0"
                step="1"
                value={gasItemDraft.emptyStock}
                onChange={(event) => setGasItemDraft({ ...gasItemDraft, emptyStock: event.target.value })}
              />
            </label>
            <label className="field">
              <span>รูปถัง</span>
              <input
                value={gasItemDraft.imageUrl}
                onChange={(event) => setGasItemDraft({ ...gasItemDraft, imageUrl: event.target.value })}
                placeholder="https://..."
              />
            </label>
            <button className="primary-action" type="button" disabled={!isOwner} onClick={createGasStockItem}>
              <Icon name="add" /> เพิ่มแก๊ส
            </button>
          </div>

          <div className="table-wrap gas-stock-table">
            {gasItems.length === 0 ? (
              <EmptyState text="ยังไม่มี stock แก๊ส" />
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>ถังแก๊ส</th>
                    <th>ยี่ห้อ</th>
                    <th>ประเภท/ขนาด</th>
                    <th>ราคา</th>
                    <th>ถังเต็ม</th>
                    <th>ถังเปล่า</th>
                    <th>รวม</th>
                    <th>สถานะ</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {gasItems.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <strong>{item.name}</strong>
                        <small>{item.id}</small>
                      </td>
                      <td>
                        <select aria-label={`ยี่ห้อ ${item.name}`} value={item.brand} disabled={!isOwner} onChange={(event) => updateGasItemBrand(item, event.target.value as GasBrand)}>
                          <option value="" disabled>ยังไม่ระบุ</option>
                          {GAS_BRANDS.map((brand) => <option key={brand} value={brand}>{brand}</option>)}
                        </select>
                      </td>
                      <td>{item.operation}</td>
                      <td>{formatMoney(item.price)}</td>
                      <td>{item.fullStock} ถัง</td>
                      <td>{item.emptyStock} ถัง</td>
                      <td>{item.totalStock} ถัง</td>
                      <td>
                        <span className={`badge ${item.fullStock > 0 ? 'success' : 'warning'}`}>
                          {item.fullStock > 0 ? 'พร้อมขาย' : 'ถังเต็มหมด'}
                        </span>
                      </td>
                      <td>
                        <button className="link-button danger" type="button" disabled={!isOwner} onClick={() => deleteGasStockItem(item)}>
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
                <strong>
                  {log.productName}
                  {log.itemType === 'GAS' && log.stockKind === 'FULL' ? ' (ถังเต็ม)' : ''}
                  {log.itemType === 'GAS' && log.stockKind === 'EMPTY' ? ' (ถังเปล่า)' : ''}
                </strong>
                <span className={log.delta > 0 ? 'text-success' : 'text-danger'}>{log.delta > 0 ? '+' : ''}{log.delta}</span>
                <span>{log.reason}</span>
                <small>{log.staffName} | {formatReceiptDateTime(new Date(log.createdAt))}</small>
              </div>
            ))}
          </div>
        </section>

        <section className="panel wide-panel lottery-stock-panel">
          <PanelTitle icon="confirmation_number" title="Stock หวย" detail={lotteryStockNotice} />
          <div className="book-intake"><h3>รับเล่ม 00–99</h3><label>จำนวนใบต่อเลข<input type="number" min="1" value={lotteryStockDraft.quantity} onChange={e => setLotteryStockDraft({...lotteryStockDraft,quantity:e.target.value})}/></label><label>ราคาต่อใบ<input type="number" min="1" value={lotteryStockDraft.price} onChange={e => setLotteryStockDraft({...lotteryStockDraft,price:e.target.value})}/></label><button className="primary-action" disabled={receivingBook || Number(lotteryStockDraft.quantity)<1 || Number(lotteryStockDraft.price)<=0} onClick={receiveBook}>รับเข้า {100 * Number(lotteryStockDraft.quantity)} ใบ</button></div>
          <details><summary>จัดการเลข 6 หลักเดิม</summary><div className="lottery-stock-form">
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
          </div></details>

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
        <div className="touch-options staff-account-tabs" role="group" aria-label="จัดการพนักงานและบัญชี">
          <button type="button" aria-pressed={staffTab === 'staff'} onClick={() => setStaffTab('staff')}>ข้อมูลพนักงาน</button>
          {isOwner && <button type="button" aria-pressed={staffTab === 'accounts'} onClick={() => setStaffTab('accounts')}>บัญชีและรหัสผ่าน</button>}
        </div>
        {staffTab === 'staff' && <>
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

        </>}
        {isOwner && staffTab === 'accounts' && <section className="panel wide-panel">
          <PanelTitle icon="manage_accounts" title="บัญชีและรหัสผ่าน" detail="เจ้าของร้านตั้งรหัสใหม่ให้บัญชีที่ลืมรหัสได้ ไม่สามารถดูรหัสเดิม" />
          <div className="user-admin-grid">
            <div className="form-stack">
              <label className="field">
                <span>ชื่อผู้ใช้</span>
                <input value={userForm.username} onChange={(event) => setUserForm({ ...userForm, username: event.target.value })} />
              </label>
              <label className="field">
                <span>ชื่อแสดงผล</span>
                <input value={userForm.displayName} onChange={(event) => setUserForm({ ...userForm, displayName: event.target.value })} />
              </label>
              <label className="field">
                <span>รหัสผ่านเริ่มต้น (อย่างน้อย 6 ตัว)</span>
                <input type="password" minLength={6} maxLength={256} autoComplete="new-password" value={userForm.password} onChange={(event) => setUserForm({ ...userForm, password: event.target.value })} />
              </label>
              <label className="field">
                <span>สิทธิ์</span>
                <select value={userForm.role} onChange={(event) => setUserForm({ ...userForm, role: event.target.value as AppRole })}>
                  <option value="user">พนักงาน (user)</option>
                  <option value="owner">เจ้าของร้าน (owner)</option>
                </select>
              </label>
              <button className="primary-action" type="button" onClick={() => void addUser()}>
                <Icon name="person_add" /> เพิ่มบัญชี
              </button>
            </div>

            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>ชื่อผู้ใช้</th>
                    <th>ชื่อ</th>
                    <th>สิทธิ์</th>
                    <th>สถานะ</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => (
                    <tr key={user.id}>
                      <td><strong>{user.username}</strong></td>
                      <td>{user.displayName}</td>
                      <td>{user.role === 'owner' ? 'เจ้าของร้าน' : 'พนักงาน'}</td>
                      <td>{user.active ? 'ใช้งาน' : 'ปิด'}</td>
                      <td>
                        <div className="row-actions">
                          <button className="link-button" type="button" onClick={() => openPasswordPanel(user)}>ตั้งรหัสผ่านใหม่</button>
                          <button className="link-button danger" type="button" disabled={user.id === currentUser?.id} onClick={() => toggleUserStatus(user)}>
                            {user.active ? 'ปิด' : 'เปิด'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>}
      </div>
    );
  }

  function closingCheckFor(section: ClosingSection) {
    return closingSummary?.checks.find((check) => check.section === section) ?? {
      section,
      confirmed: false,
      confirmedAt: null,
      confirmedBy: '',
      note: '',
    };
  }

  function closingStatusText(status = shopStatus) {
    if (status === 'OPEN' || status === 'ACTIVE') {
      return 'เปิดร้าน';
    }
    if (status === 'CLOSED') {
      return 'ปิดร้านแล้ว';
    }
    return 'รอเปิดร้าน';
  }

  function gasBalanceText(row: ClosingSummary['sections']['gas']['tankBalance'][number]) {
    if (row.status === 'BALANCED') {
      return 'ยอดเท่าเดิม';
    }
    if (row.status === 'PENDING_RETURN') {
      return `ยังไม่คืน ${row.pendingQuantity} ถัง`;
    }
    return `ควรตรวจข้อมูล ${Math.abs(row.expectedMissing - row.pendingQuantity)} ถัง`;
  }

  function renderClosingConfirm(section: ClosingSection) {
    const check = closingCheckFor(section);
    return (
      <button
        className={check.confirmed ? 'status-button active' : 'status-button'}
        type="button"
        disabled={!isOwner || !isShopOpen || isClosingLoading}
        onClick={() => confirmClosingSection(section)}
      >
        <Icon name={check.confirmed ? 'check_circle' : 'radio_button_unchecked'} />
        {check.confirmed ? 'เช็คยอดแล้ว' : 'ยืนยันยอด'}
      </button>
    );
  }

  function renderPreviousClosingSummary() {
    if (!previousClosingSummary) {
      return null;
    }

    const total = previousClosingSummary.sections.pos.total
      + previousClosingSummary.sections.gas.total
      + previousClosingSummary.sections.lottery.total
      + previousClosingSummary.sections.topup.total;

    return (
      <section className="panel closing-previous-panel">
        <PanelTitle
          icon="event_repeat"
          title="สรุปรอบก่อนหน้า"
          detail={`${previousClosingSummary.session.business_date} | ${closingStatusText(previousClosingSummary.session.status)}`}
        />
        <div className="closing-metric-grid">
          <div><span>ยอดรวม</span><strong>{formatMoney(total)}</strong></div>
          <div><span>POS</span><strong>{formatMoney(previousClosingSummary.sections.pos.total)}</strong></div>
          <div><span>แก๊ส</span><strong>{formatMoney(previousClosingSummary.sections.gas.total)}</strong></div>
          <div><span>เติมเงิน</span><strong>{formatMoney(previousClosingSummary.sections.topup.total)}</strong></div>
        </div>
      </section>
    );
  }

  function renderClosingPage() {
    const confirmedCount = closingSummary?.checks.filter((check) => check.confirmed).length ?? 0;
    const canCloseShop = Boolean(closingSummary?.readyToClose && isOwner && isShopOpen);
    const transfers = closingSummary?.sections.transfers;

    return (
      <div className="closing-page">
        <section className="panel closing-hero-panel">
          <div>
            <span className={`badge ${shopStatus === 'CLOSED' ? 'danger' : isShopOpen ? 'success' : 'warning'}`}>
              {closingStatusText()}
            </span>
            <h2>{appSession?.business_date ?? currentDateInput()}</h2>
            <p>{closingNotice}</p>
          </div>
          <div className="closing-actions">
            <button className="secondary-action" type="button" disabled={!isOwner || isClosingLoading} onClick={() => refreshClosingSummary()}>
              <Icon name="refresh" /> รีเฟรช
            </button>
            {!isShopOpen && shopStatus !== 'CLOSED' && (
              <button className="primary-action" type="button" disabled={!isOwner || isClosingLoading} onClick={openShop}>
                <Icon name="storefront" /> เปิดร้านวันนี้
              </button>
            )}
            {isShopOpen && (
              <button className="primary-action" type="button" disabled={!canCloseShop || isClosingLoading} onClick={closeShop}>
                <Icon name="lock" /> ปิดร้าน
              </button>
            )}
            {shopStatus === 'CLOSED' && (
              <button className="primary-action" type="button" disabled={!isOwner || isClosingLoading} onClick={reopenShop}>
                <Icon name="lock_open" /> Reopen วันนี้
              </button>
            )}
          </div>
          <div className="closing-progress">
            <strong>{confirmedCount}/{closingSummary?.checks.length ?? 5}</strong>
            <span>หมวดที่เช็คยอดแล้ว</span>
          </div>
        </section>

        {!isShopOpen && renderPreviousClosingSummary()}

        {!isOwner ? (
          <section className="panel wide-panel">
            <EmptyState text="การเปิดร้านและปิดร้านต้องใช้สิทธิ์ owner" />
          </section>
        ) : !closingSummary ? (
          <section className="panel wide-panel">
            <EmptyState text={isClosingLoading ? 'กำลังโหลดสรุปปิดร้าน' : 'ยังไม่มีสรุปปิดร้าน'} />
          </section>
        ) : (
          <>
            <section className="panel closing-section">
              <div className="closing-section-head">
                <PanelTitle icon={closingSectionMeta.POS.icon} title={closingSectionMeta.POS.label} detail={`${closingSummary.sections.pos.billCount} บิล | ${closingSummary.sections.pos.itemCount} ชิ้น`} />
                {renderClosingConfirm('POS')}
              </div>
              <div className="closing-metric-grid">
                <div><span>ยอดขาย POS</span><strong>{formatMoney(closingSummary.sections.pos.total)}</strong></div>
                <div><span>ก่อนส่วนลด</span><strong>{formatMoney(closingSummary.sections.pos.subtotal)}</strong></div>
                <div><span>ส่วนลด</span><strong>{formatMoney(closingSummary.sections.pos.discount)}</strong></div>
              </div>
              <div className="table-wrap closing-table">
                {closingSummary.sections.pos.items.length === 0 ? (
                  <EmptyState text="ยังไม่มีรายการ POS วันนี้" />
                ) : (
                  <table>
                    <thead><tr><th>สินค้า</th><th>บาร์โค้ด</th><th>จำนวน</th><th>ยอด</th></tr></thead>
                    <tbody>
                      {closingSummary.sections.pos.items.map((item) => (
                        <tr key={`${item.barcode}-${item.name}`}>
                          <td><strong>{item.name}</strong></td>
                          <td>{item.barcode || '-'}</td>
                          <td>{item.quantity}</td>
                          <td>{formatMoney(item.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </section>

            <section className="panel closing-section">
              <div className="closing-section-head">
                <PanelTitle icon={closingSectionMeta.GAS.icon} title={closingSectionMeta.GAS.label} detail={`${closingSummary.sections.gas.jobCount} งาน | ค้างคืน ${closingSummary.sections.gas.pendingReturnQuantity} ถัง`} />
                {renderClosingConfirm('GAS')}
              </div>
              <div className="closing-metric-grid">
                <div><span>ยอดแก๊ส</span><strong>{formatMoney(closingSummary.sections.gas.total)}</strong></div>
                <div><span>ขายถัง</span><strong>{closingSummary.sections.gas.soldQuantity}</strong></div>
                <div><span>คืนถัง</span><strong>{closingSummary.sections.gas.returnedQuantity}</strong></div>
                <div><span>ค่าส่ง</span><strong>{formatMoney(closingSummary.sections.gas.deliveryFeeTotal)}</strong></div>
                <div><span>งานเสร็จ</span><strong>{closingSummary.sections.gas.serviceStats?.completedJobs ?? 0}</strong></div>
                <div><span>งานเปิดค้าง</span><strong>{closingSummary.sections.gas.serviceStats?.openJobs ?? 0}</strong></div>
                <div><span>ค้างชำระ</span><strong>{closingSummary.sections.gas.serviceStats?.unpaidJobs ?? 0}</strong></div>
                <div><span>ยังไม่คืนถังครบ</span><strong>{closingSummary.sections.gas.serviceStats?.pendingReturnJobs ?? 0}</strong></div>
              </div>
              <div className="table-wrap closing-table">
                {closingSummary.sections.gas.tankBalance.length === 0 ? (
                  <EmptyState text="ยังไม่มีรายการแก๊สให้ตรวจ" />
                ) : (
                  <table>
                    <thead><tr><th>ถัง</th><th>ต้นวัน</th><th>ขาย</th><th>คืน</th><th>ท้ายวัน</th><th>สถานะ</th></tr></thead>
                    <tbody>
                      {closingSummary.sections.gas.tankBalance.map((item) => {
                        const openingFullStock = item.openingFullStock ?? item.openingStock;
                        const openingEmptyStock = item.openingEmptyStock ?? 0;
                        const openingTotalStock = item.openingTotalStock ?? item.openingStock;
                        const currentFullStock = item.currentFullStock ?? item.currentStock;
                        const currentEmptyStock = item.currentEmptyStock ?? 0;
                        const currentTotalStock = item.currentTotalStock ?? item.currentStock;
                        return (
                          <tr key={item.id}>
                            <td><strong>{item.name}</strong><small>{item.operation}</small></td>
                            <td>
                              <strong>{openingTotalStock}</strong>
                              <small>เต็ม {openingFullStock} | เปล่า {openingEmptyStock}</small>
                            </td>
                            <td>{item.soldQuantity}</td>
                            <td>{item.returnedQuantity}</td>
                            <td>
                              <strong>{currentTotalStock}</strong>
                              <small>เต็ม {currentFullStock} | เปล่า {currentEmptyStock}</small>
                            </td>
                            <td>
                              <span className={`badge ${item.status === 'BALANCED' ? 'success' : item.status === 'PENDING_RETURN' ? 'warning' : 'danger'}`}>
                                {gasBalanceText(item)}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </section>

            <section className="panel closing-section">
              <div className="closing-section-head">
                <PanelTitle icon={closingSectionMeta.LOTTERY.icon} title={closingSectionMeta.LOTTERY.label} detail={`${closingSummary.sections.lottery.billCount} บิล | ${closingSummary.sections.lottery.ticketCount} ใบ`} />
                {renderClosingConfirm('LOTTERY')}
              </div>
              <div className="closing-metric-grid">
                <div><span>ยอดหวย</span><strong>{formatMoney(closingSummary.sections.lottery.total)}</strong></div>
              </div>
              <div className="log-table compact-log">
                {closingSummary.sections.lottery.items.length === 0 ? <EmptyState text="ยังไม่มีรายการหวยวันนี้" /> : closingSummary.sections.lottery.items.slice(0, 12).map((item) => (
                  <div key={item.number}>
                    <strong>{item.number}</strong>
                    <span>{item.quantity} ใบ</span>
                    <span>{formatMoney(item.total)}</span>
                    <small>Lottery</small>
                  </div>
                ))}
              </div>
            </section>

            <section className="panel closing-section">
              <div className="closing-section-head">
                <PanelTitle icon={closingSectionMeta.TOPUP.icon} title={closingSectionMeta.TOPUP.label} detail={`${closingSummary.sections.topup.orderCount} รายการ`} />
                {renderClosingConfirm('TOPUP')}
              </div>
              <div className="closing-metric-grid">
                <div><span>ยอดเติมเงิน</span><strong>{formatMoney(closingSummary.sections.topup.total)}</strong></div>
              </div>
              <div className="table-wrap closing-table">
                {closingSummary.sections.topup.providers.length === 0 ? (
                  <EmptyState text="ยังไม่มีรายการเติมเงินวันนี้" />
                ) : (
                  <table>
                    <thead><tr><th>ค่าย</th><th>รายการ</th><th>เติมแล้ว</th><th>จ่ายแล้ว</th><th>ยอดรวม</th></tr></thead>
                    <tbody>
                      {closingSummary.sections.topup.providers.map((item) => (
                        <tr key={item.provider}>
                          <td><strong>{item.provider}</strong></td>
                          <td>{item.orderCount}</td>
                          <td>{item.toppedUpCount}</td>
                          <td>{item.paidCount} | {formatMoney(item.paidTotal)}</td>
                          <td>{formatMoney(item.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </section>

            {transfers && transfers.records > 0 && <section className="panel closing-section">
              <div className="closing-section-head">
                <PanelTitle icon={closingSectionMeta.TRANSFER.icon} title={closingSectionMeta.TRANSFER.label} detail={`${transfers.count} รายการสำเร็จ`} />
                {renderClosingConfirm('TRANSFER')}
              </div>
              <div className="closing-metric-grid">
                <div><span>ยอดที่โอน</span><strong>{baht(transfers.principal)}</strong></div>
                <div><span>ค่าบริการ</span><strong>{baht(transfers.fee)}</strong></div>
                <div><span>เงินสดรับ</span><strong>{baht(transfers.cash)}</strong></div>
                <div><span>เงินทอน</span><strong>{baht(transfers.change)}</strong></div>
              </div>
              <button className="secondary-action" type="button" onClick={() => setCurrentView('TRANSFER')}>ดูรายการรับโอน</button>
            </section>}
            <section className="panel closing-section wide-panel">
              <div className="closing-section-head">
                <PanelTitle icon={closingSectionMeta.STOCK.icon} title={closingSectionMeta.STOCK.label} detail={`${closingSummary.sections.stock.movementCount} movement | ใกล้หมด ${closingSummary.sections.stock.lowProducts.length}`} />
                {renderClosingConfirm('STOCK')}
              </div>
              <div className="closing-stock-grid">
                <div className="log-table compact-log">
                  {closingSummary.sections.stock.movements.length === 0 ? <EmptyState text="วันนี้ยังไม่มี movement stock" /> : closingSummary.sections.stock.movements.slice(0, 18).map((item) => (
                    <div key={`${item.itemType}-${item.itemName}`}>
                      <strong>{item.itemName}</strong>
                      <span className={item.netDelta >= 0 ? 'text-success' : 'text-danger'}>{item.netDelta >= 0 ? '+' : ''}{item.netDelta}</span>
                      <span>{item.movementCount} ครั้ง</span>
                      <small>{item.itemType}</small>
                    </div>
                  ))}
                </div>
                <div className="risk-list">
                  {closingSummary.sections.stock.lowProducts.length === 0 ? <EmptyState text="ไม่มีสินค้าใกล้หมด" /> : closingSummary.sections.stock.lowProducts.slice(0, 12).map((item) => {
                    const product = normalizeProduct(item);
                    return (
                      <div key={product.id}>
                        <strong>{product.name}</strong>
                        <span>เหลือ {product.stock} {product.unit}</span>
                        <small>ขั้นต่ำ {product.minStock}</small>
                      </div>
                    );
                  })}
                </div>
              </div>
            </section>
          </>
        )}
      </div>
    );
  }

  function renderLoginPage() {
    return (
      <main className="login-shell">
        <section className="login-panel">
          <div>
            <div className="brand-mark"><Icon name="storefront" /></div>
            <h1>เข้าสู่ระบบ Tingkum</h1>
            <p>{loginNotice}</p>
          </div>

          <label className="field">
            <span>ชื่อผู้ใช้</span>
            <input
              autoComplete="username"
              value={loginForm.username}
              onChange={(event) => setLoginForm({ ...loginForm, username: event.target.value })}
              onKeyDown={(event) => event.key === 'Enter' && void handleLogin()}
              autoFocus
            />
          </label>

          <label className="field">
            <span>รหัสผ่าน</span>
            <input
              type="password"
              autoComplete="current-password"
              value={loginForm.password}
              onChange={(event) => setLoginForm({ ...loginForm, password: event.target.value })}
              onKeyDown={(event) => event.key === 'Enter' && void handleLogin()}
            />
          </label>

          <button className="primary-action" type="button" onClick={() => void handleLogin()}>
            <Icon name="login" /> เข้าสู่ระบบ
          </button>
        </section>
      </main>
    );
  }

  function renderPasswordPanel() {
    if (!passwordPanelOpen || (passwordResetTarget && !isOwner)) return null;
    const resetting = Boolean(passwordResetTarget);
    const inputType = passwordVisible ? 'text' : 'password';
    return (
      <dialog className="password-panel password-dialog" aria-labelledby="password-panel-title" ref={(dialog) => {
        if (dialog && !dialog.open) dialog.showModal();
      }} onCancel={(event) => { event.preventDefault(); closePasswordPanel(); }}>
          <div className="modal-head">
            <div>
              <span className="badge neutral">{resetting ? 'เจ้าของร้าน' : 'บัญชีของฉัน'}</span>
              <h2 id="password-panel-title">{resetting ? `ตั้งรหัสผ่านให้ ${passwordResetTarget?.username}` : 'เปลี่ยนรหัสผ่านของฉัน'}</h2>
              <p role={passwordSaved ? 'status' : undefined}>{passwordNotice}</p>
            </div>
            <button className="icon-button" type="button" title="ปิด" aria-label="ปิดหน้ารหัสผ่าน" disabled={passwordBusy} onClick={closePasswordPanel}><Icon name="close" /></button>
          </div>
          <form onSubmit={(event) => { event.preventDefault(); void (resetting ? resetUserPassword() : changeCurrentPassword()); }}>
            <fieldset className="password-fields form-stack" disabled={passwordBusy}>
              {!resetting && <label className="field">
                <span>รหัสผ่านเดิม</span>
                <input type={inputType} autoComplete="current-password" required value={passwordForm.currentPassword} onChange={(event) => setPasswordForm({ ...passwordForm, currentPassword: event.target.value })} autoFocus />
              </label>}
              <label className="field">
                <span>รหัสผ่านใหม่</span>
                <input type={inputType} autoComplete="new-password" required minLength={6} maxLength={256} value={passwordForm.newPassword} onChange={(event) => { setPasswordSaved(false); setPasswordForm({ ...passwordForm, newPassword: event.target.value }); }} autoFocus={resetting} />
              </label>
              <label className="field">
                <span>ยืนยันรหัสผ่านใหม่</span>
                <input type={inputType} autoComplete="new-password" required minLength={6} maxLength={256} value={passwordForm.confirmPassword} onChange={(event) => setPasswordForm({ ...passwordForm, confirmPassword: event.target.value })} />
              </label>
              <label className="password-visibility"><input type="checkbox" checked={passwordVisible} onChange={(event) => setPasswordVisible(event.target.checked)} /> แสดงรหัสผ่าน</label>
              {passwordError && <p className="operation-feedback error" role="alert">{passwordError}</p>}
              <button className="primary-action" type="submit"><Icon name="lock_reset" /> {passwordBusy ? 'กำลังบันทึก…' : 'บันทึกรหัสผ่านใหม่'}</button>
              <button className="secondary-action" type="button" onClick={closePasswordPanel}>ปิด</button>
            </fieldset>
          </form>
      </dialog>
    );
  }

  function renderProductRegistrationRequestPanel() {
    if (!activeProductRegistrationRequest) {
      return null;
    }

    const request = activeProductRegistrationRequest;
    return (
      <div className="modal-backdrop product-request-backdrop" role="presentation">
        <section
          className="password-panel product-request-panel"
          role="dialog"
          aria-modal="true"
          aria-labelledby="product-request-title"
        >
          <div className="modal-head">
            <div>
              <span className="badge warning">คำขอลงทะเบียนสินค้า</span>
              <h2 id="product-request-title">{request.name}</h2>
              <p>{request.requestedByName} ส่งคำขอจาก POS</p>
            </div>
            <span className="badge neutral">#{request.id}</span>
          </div>

          <div className="product-request-detail">
            <div><span>บาร์โค้ด</span><strong>{request.barcode}</strong></div>
            <div><span>ราคา</span><strong>{formatMoney(Number(request.price))}</strong></div>
            <div><span>สต็อกเริ่มต้น</span><strong>{request.stock}</strong></div>
            <div><span>หมวดหมู่</span><strong>{request.category || 'ทั่วไป'}</strong></div>
            <div><span>ขั้นต่ำ</span><strong>{request.minStock ?? request.min_stock ?? 5}</strong></div>
            <div><span>หน่วย</span><strong>{request.unit || 'ชิ้น'}</strong></div>
          </div>

          {productRequestNotice && <p className="modal-note">{productRequestNotice}</p>}

          <div className="member-create-actions">
            <button
              className="secondary-action danger"
              type="button"
              disabled={isReviewingProductRequest}
              onClick={() => void reviewProductRegistrationRequest(request.id, 'REJECT')}
            >
              ปฏิเสธ
            </button>
            <button
              className="primary-action"
              type="button"
              disabled={isReviewingProductRequest}
              onClick={() => void reviewProductRegistrationRequest(request.id, 'ACCEPT')}
            >
              <Icon name={isReviewingProductRequest ? 'hourglass_top' : 'inventory'} />
              {isReviewingProductRequest ? 'กำลังบันทึก...' : 'Accept'}
            </button>
          </div>
        </section>
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
      case 'TRANSFER':
        return <TransferPage key={scanSessionId} api={API_BASE_URL} sessionId={scanSessionId} isOwner={isOwner} isShopOpen={isShopOpen} />;
      case 'HISTORY':
        return renderHistoryPage();
      case 'ANALYTICS':
        return <div className="operation-page">
          {isOwner && <div className="workspace-switcher" role="group" aria-label="แดชบอร์ด">
            <button type="button" aria-pressed={dashboardTab === 'sales'} onClick={() => setDashboardTab('sales')}><Icon name="monitoring" /> ภาพรวมร้าน</button>
            <button type="button" aria-pressed={dashboardTab === 'tax'} onClick={() => setDashboardTab('tax')}><Icon name="receipt_long" /> จัดการภาษี</button>
          </div>}
          {isOwner && dashboardTab === 'tax' ? <TaxDashboard api={API_BASE_URL} /> : renderAnalyticsPage()}
        </div>;
      case 'STOCK':
        return isOwner && <div className="operation-page">
          <div className="workspace-switcher" role="group" aria-label="สต็อก">
            <button type="button" aria-pressed={stockTab === 'products'} onClick={() => setStockTab('products')}><Icon name="inventory_2" /> สินค้าและสต็อก</button>
            <button type="button" aria-pressed={stockTab === 'orders'} onClick={() => setStockTab('orders')}><Icon name="local_shipping" /> ใบสั่งซื้อและรับของ</button>
            <button type="button" aria-pressed={stockTab === 'issue'} onClick={() => setStockTab('issue')}><Icon name="warehouse" /> โกดัง / เบิกของ</button>
            <button type="button" aria-pressed={stockTab === 'count'} onClick={() => setStockTab('count')}><Icon name="fact_check" /> ตรวจนับสต็อก</button>
          </div>
          {stockTab === 'orders' ? <PurchaseOrders api={API_BASE_URL} products={stockItems} onRestock={async () => {
            await Promise.all([refreshProducts(), refreshStockLog()]);
          }} /> : stockTab === 'issue' ? <WarehouseStock api={API_BASE_URL} products={stockItems} /> : stockTab === 'count' ? <StockDocuments api={API_BASE_URL} products={stockItems} onRefreshStock={async () => {
            await Promise.all([refreshProducts(), refreshStockLog()]);
          }} /> : renderStockPage()}
        </div>;
      case 'SETTINGS':
        return isOwner && <StoreSettingsPage api={API_BASE_URL} onSave={setStoreSettings} onChangePassword={() => openPasswordPanel()} onManageUsers={() => { setStaffTab('accounts'); setCurrentView('STAFF'); }} />;
      case 'STAFF':
        return renderStaffPage();
      case 'CLOSING':
        return renderClosingPage();
      default:
        return renderPosPage();
    }
  }

  if (!authSession) {
    return renderLoginPage();
  }

  return (
    <>
      <div className="app-shell">
        <aside className="sidebar">
          <div className="brand-block">
            <div className="brand-mark"><Icon name="storefront" /></div>
            <div><strong>Tingkum</strong><small>ระบบหน้าร้าน</small></div>
          </div>

          <nav className="nav-list" aria-label="เมนูหลัก">
            {navigationGroups.map((group) => <div className={group.label === 'จัดการร้าน' ? 'nav-group management-nav' : 'nav-group'} key={group.label}>
              <p className="nav-group-label">{group.label}</p>
              {group.views.filter((view) => allowedViews.includes(view)).map((view) => (
                <button
                  type="button"
                  key={view}
                  aria-current={currentView === view ? 'page' : undefined}
                  className={`nav-item ${currentView === view ? 'selected' : ''}`}
                  onClick={() => setCurrentView(view)}
                >
                  <Icon name={viewMeta[view].icon} />
                  <span>{viewMeta[view].title}</span>
                </button>
              ))}
            </div>)}
          </nav>
          <label className="mobile-view-picker">
            <span>ไปที่</span>
            <select aria-label="เลือกหน้าจอ" value={currentView} onChange={(event) => setCurrentView(event.target.value as View)}>
              {currentView === 'CLOSING' && <option value="CLOSING">{viewMeta.CLOSING.title}</option>}
              {navigationGroups.flatMap((group) => group.views).filter((view) => allowedViews.includes(view))
                .map((view) => <option key={view} value={view}>{viewMeta[view].title}</option>)}
            </select>
          </label>

          <div className="sidebar-status">
            <strong>{scanSessionId}</strong>
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
              <span className="topbar-user">{currentUser?.displayName}</span>
              <span className={`shop-status-chip ${shopStatus === 'CLOSED' ? 'closed' : isShopOpen ? 'open' : 'pending'}`}>
                {closingStatusText()}
              </span>
              {isOwner && (
                <button
                  type="button"
                  className="topbar-close-button"
                  onClick={() => {
                    setCurrentView('CLOSING');
                    void refreshClosingSummary();
                  }}
                >
                  <Icon name={isShopOpen ? 'lock_clock' : 'storefront'} />
                  {isShopOpen ? 'ปิดร้าน' : shopStatus === 'CLOSED' ? 'เปิดรอบอีกครั้ง' : 'เปิดร้าน'}
                </button>
              )}
              {isOwner && pendingLotterySales.length > 0 && <button type="button" className="secondary-action" onClick={() => setCurrentView('LOTTERY')}><Icon name="pending_actions" /> หวยรอยืนยัน ({pendingLotterySales.length})</button>}
              <span className="topbar-date">{todayLabel}</span>
              <button type="button" aria-label="เปลี่ยนรหัสผ่าน" title="เปลี่ยนรหัสผ่าน" onClick={() => openPasswordPanel()}>
                <Icon name="lock_reset" />
              </button>
              <button type="button" aria-label="ออกจากระบบ" title="ออกจากระบบ" onClick={() => void logout()}><Icon name="logout" /></button>
            </div>
          </header>

          <main className="page-scroll" ref={pageScrollRef}>
            {navigationGroups[1].views.some(view => view === currentView) && <nav className="manage-tools" aria-label="เครื่องมือจัดการร้าน">{navigationGroups[1].views.filter(view => allowedViews.includes(view)).map(view => <button key={view} aria-current={currentView === view ? 'page' : undefined} onClick={() => setCurrentView(view)}><Icon name={viewMeta[view].icon}/>{viewMeta[view].title}</button>)}</nav>}
            {renderPage()}
          </main>
        </div>
      </div>
      {renderPasswordPanel()}
      {renderProductRegistrationRequestPanel()}
      {isOwner && productEdit && <dialog className="product-details-dialog" aria-labelledby="product-details-title" ref={(dialog) => {
        if (dialog && !dialog.open) dialog.showModal();
      }} onCancel={(event) => { event.preventDefault(); if (!productEditBusy) setProductEdit(undefined); }}>
        <form className="panel operation-panel" onSubmit={saveProductDetails}>
          <h2 id="product-details-title">{productEdit.name}</h2>
          <fieldset className="operation-fields" disabled={productEditBusy}>
            <label className="field"><span>บาร์โค้ด</span><input autoFocus maxLength={100} value={productEdit.barcode} onChange={(event) => setProductEdit({ ...productEdit, barcode: event.target.value })} /></label>
            <label className="field"><span>ราคาขาย (บาท)</span><input type="number" min="0" max="9999999999.99" step="0.01" value={productEdit.price} onChange={(event) => setProductEdit({ ...productEdit, price: event.target.value })} /></label>
            {productEditError && <p className="operation-feedback error" role="alert">{productEditError}</p>}
            <div className="operation-actions"><button type="submit" className="primary-action">บันทึก</button><button type="button" className="secondary-action" onClick={() => setProductEdit(undefined)}>ยกเลิก</button></div>
          </fieldset>
        </form>
      </dialog>}
    </>
  );
}
