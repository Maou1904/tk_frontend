export const LOTTERY_PENDING = 'รอเจ้าของร้านยืนยัน';

export function lotteryStockLevel(available: number, reference: number) {
  const count = Number.isFinite(available) ? Math.max(0, available) : 0;
  const full = Math.max(count, Number.isFinite(reference) ? reference : 0);
  const ratio = full > 0 ? count / full : 0;
  if (count === 0) return { level: 'empty', label: 'หมด', percent: 0 };
  if (ratio <= 1 / 3) return { level: 'low', label: 'เหลือน้อย', percent: Math.round(ratio * 100) };
  if (ratio <= 2 / 3) return { level: 'medium', label: 'ปานกลาง', percent: Math.round(ratio * 100) };
  return { level: 'high', label: 'เหลือมาก/เต็ม', percent: Math.round(ratio * 100) };
}
