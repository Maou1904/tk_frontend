import { useEffect, useState } from 'react';
import axios from 'axios';

export type Transfer = {
  serviceType?: 'TRANSFER' | 'ELECTRICITY';
  id: string;
  principal: number;
  fee: number;
  cashReceived: number;
  change: number;
  bank: string;
  reference: string;
  note: string;
  staff: string;
  createdAt: string;
  cancelledAt: string | null;
  cancelReason: string | null;
};

export type TransferTotals = { records: number; count: number; principal: number; fee: number; cash: number; change: number };
export type StoreSettings = { defaultFee: number; electricityFee: number; gasDeliveryFee: number; topupAmount: number };
export type StockProduct = { id: number; name: string; barcode: string; stock: number; unit: string };

const money = new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB' });
const timestamp = new Intl.DateTimeFormat('th-TH', { timeZone: 'Asia/Bangkok', dateStyle: 'short', timeStyle: 'short' });
const month = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit' });

export const baht = (satang: number) => money.format(satang / 100);
export const dateTime = (value: string) => timestamp.format(new Date(value));
export const currentMonth = () => month.format(new Date());
export const bahtInput = (satang: number) => (satang / 100).toFixed(2);

export function parseMoney(value: string) {
  if (!/^\d{1,9}(\.\d{1,2})?$/.test(value)) return null;
  const [whole, fraction = ''] = value.split('.');
  return Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
}

export function errorText(error: unknown, fallback = 'ทำรายการไม่สำเร็จ กรุณาลองอีกครั้ง') {
  return axios.isAxiosError(error) && typeof error.response?.data?.error === 'string'
    ? error.response.data.error : fallback;
}

// Mobile POS can also run on a plain HTTP LAN address.
export function operationId() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
  return hex.replace(/^(........)(....)(....)(....)/, '$1-$2-$3-$4-');
}

export function downloadCsv(filename: string, rows: (string | number)[][]) {
  const csv = rows.map((row) => row.map((cell) => {
    if (typeof cell === 'number') return String(cell);
    const safe = /^\s*[=+\-@\t\r\n]/.test(cell) ? "'" + cell : cell;
    return '"' + safe.replaceAll('"', '""') + '"';
  }).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob(['\ufeff', csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function useOperationData<T>(url: string | null, revision: number) {
  const [result, setResult] = useState<{ url: string; revision: number; data?: T; error?: string }>();
  useEffect(() => {
    if (!url) return;
    const controller = new AbortController();
    axios.get<T>(url, { signal: controller.signal })
      .then(({ data }) => setResult({ url, revision, data }))
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setResult({ url, revision, error: errorText(error, 'โหลดข้อมูลไม่สำเร็จ') });
      });
    return () => controller.abort();
  }, [url, revision]);
  const current = result?.url === url ? result : undefined;
  return { data: current?.data, error: current?.error, loading: Boolean(url && current?.revision !== revision) };
}
