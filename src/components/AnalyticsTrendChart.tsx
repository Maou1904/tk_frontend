import { useId, useState } from 'react';
import type { CSSProperties } from 'react';
import type { AnalyticsSeries, AnalyticsTrendRow } from '../analytics';

const seriesOptions: { key: AnalyticsSeries; label: string; color: string }[] = [
  { key: 'ALL', label: 'รวมทั้งหมด', color: '#246256' },
  { key: 'POS', label: 'ขายหน้าร้าน', color: '#2563eb' },
  { key: 'GAS', label: 'แก๊ส', color: '#b45309' },
  { key: 'LOTTERY', label: 'สลาก', color: '#8b3ab9' },
  { key: 'TOPUP', label: 'เติมเงิน', color: '#0e7490' },
  { key: 'TRANSFER', label: 'ค่าบริการโอน', color: '#ba3b56' },
  { key: 'ELECTRICITY', label: 'ค่าบริการค่าไฟ', color: '#697519' },
];
const money = new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB' });
const compact = new Intl.NumberFormat('th-TH', { notation: 'compact', maximumFractionDigits: 1 });
const width = 860, height = 300, left = 72, right = 22, top = 24, bottom = 48;

export function AnalyticsSparkline({ rows, series }: { rows: AnalyticsTrendRow[]; series: AnalyticsSeries }) {
  const maximum = Math.max(1, ...rows.map(row => row.values[series]));
  const points = rows.map((row, index) => `${index / Math.max(1, rows.length - 1) * 180},${34 - row.values[series] / maximum * 30}`).join(' ');
  return <svg className="analytics-sparkline" viewBox="0 0 180 40" aria-hidden="true"><polyline points={points} fill="none" stroke="currentColor" strokeWidth="2.5" vectorEffect="non-scaling-stroke" /></svg>;
}

export default function AnalyticsTrendChart({ rows, period, loading }: { rows: AnalyticsTrendRow[]; period: 'day' | 'month' | 'year'; loading: boolean }) {
  const [series, setSeries] = useState<AnalyticsSeries>('ALL');
  const [selected, setSelected] = useState<number | null>(null);
  const gradientId = useId();
  const active = seriesOptions.find(option => option.key === series)!;
  const maximum = Math.max(1, ...rows.map(row => row.values[series]));
  const magnitude = 10 ** Math.floor(Math.log10(maximum));
  const ceiling = Math.ceil(maximum / magnitude) * magnitude;
  const x = (index: number) => left + index / Math.max(1, rows.length - 1) * (width - left - right);
  const y = (value: number) => height - bottom - value / ceiling * (height - top - bottom);
  const line = rows.map((row, index) => `${index === 0 ? 'M' : 'L'} ${x(index)} ${y(row.values[series])}`).join(' ');
  const total = rows.reduce((sum, row) => sum + Math.round(row.values[series] * 100), 0) / 100;
  const peakIndex = rows.reduce((best, row, index) => row.values[series] > (rows[best]?.values[series] ?? -1) ? index : best, 0);
  const currentIndex = Math.min(selected ?? peakIndex, Math.max(0, rows.length - 1));
  const current = rows[currentIndex];
  const unit = period === 'day' ? 'ชั่วโมง' : period === 'month' ? 'วัน' : 'เดือน';
  const hasRecords = rows.some(row => row.count > 0);
  return <div className="analytics-time-chart" style={{ '--chart-color': active.color } as CSSProperties}>
    <div className="analytics-chart-options" role="group" aria-label="เลือกยอดขายในกราฟ">
      {seriesOptions.map(option => <button type="button" key={option.key} aria-pressed={series === option.key} onClick={() => { setSeries(option.key); setSelected(null); }}>{option.label}</button>)}
    </div>
    <div className="analytics-chart-readout">
      <div><span>{active.label}ในช่วงที่เลือก</span><strong data-testid="trend-series-total">{money.format(total)}</strong></div>
      <div aria-live="polite"><span>{current ? `${unit} ${current.label}` : 'เลือกช่วงเวลา'}{selected === null && total > 0 ? ' · ยอดสูงสุด' : ''}</span><strong data-testid="trend-point-value">{money.format(current?.values[series] ?? 0)}</strong></div>
    </div>
    <div className="analytics-chart-scroll">
      <svg className="analytics-line-chart" viewBox={`0 0 ${width} ${height}`} role="group" aria-label={`กราฟ${active.label}ตาม${unit} ใช้ลูกศรซ้ายขวาเพื่อดูยอดแต่ละช่วง`} tabIndex={0} onKeyDown={event => {
        let next: number;
        if (event.key === 'ArrowLeft') next = Math.max(0, currentIndex - 1);
        else if (event.key === 'ArrowRight') next = Math.min(rows.length - 1, currentIndex + 1);
        else if (event.key === 'Home') next = 0;
        else if (event.key === 'End') next = rows.length - 1;
        else return;
        event.preventDefault(); setSelected(next);
      }}>
        <defs><linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={active.color} stopOpacity="0.18"/><stop offset="100%" stopColor={active.color} stopOpacity="0.01"/></linearGradient></defs>
        <text x={left} y={14} className="analytics-chart-label">บาท</text>
        {[0, 1, 2, 3, 4].map(step => {
          const value = ceiling * step / 4;
          return <g key={step}><line x1={left} x2={width-right} y1={y(value)} y2={y(value)} className="analytics-chart-grid"/><text x={left-12} y={y(value)+4} textAnchor="end" className="analytics-chart-label">{compact.format(value)}</text></g>;
        })}
        {rows.length > 0 && <><path d={`${line} L ${x(rows.length - 1)} ${height-bottom} L ${left} ${height-bottom} Z`} fill={`url(#${gradientId})`}/><path d={line} fill="none" stroke={active.color} strokeWidth="3" vectorEffect="non-scaling-stroke"/></>}
        {rows.map((row, index) => <g key={row.key}>
          {(index === 0 || index === rows.length - 1 || index % (period === 'year' ? 1 : period === 'day' ? 3 : 5) === 0) && <text x={x(index)} y={height-18} textAnchor="middle" className="analytics-chart-label">{period === 'month' ? index + 1 : row.label}</text>}
          <rect x={x(index)-(width-left-right)/Math.max(1, rows.length-1)/2} y={top} width={(width-left-right)/Math.max(1, rows.length-1)} height={height-top-bottom} fill="transparent" onPointerEnter={() => setSelected(index)} onClick={() => setSelected(index)}><title>{row.label}: {money.format(row.values[series])}</title></rect>
        </g>)}
        {current && <g pointerEvents="none"><line x1={x(currentIndex)} x2={x(currentIndex)} y1={top} y2={height-bottom} stroke={active.color} strokeDasharray="4 5" opacity="0.5"/><circle cx={x(currentIndex)} cy={y(current.values[series])} r="5" fill={active.color} stroke="white" strokeWidth="2"/></g>}
      </svg>
    </div>
    <div className="analytics-chart-point-picker">
      <button type="button" aria-label="ดูช่วงก่อนหน้าในกราฟ" disabled={!current || currentIndex === 0} onClick={() => setSelected(currentIndex-1)}>‹</button>
      <label>ดูยอดแต่ละ{unit}<select aria-label={`เลือก${unit}ในกราฟ`} value={currentIndex} disabled={!current} onChange={event => setSelected(Number(event.target.value))}>{rows.map((row,index) => <option key={row.key} value={index}>{row.label}</option>)}</select></label>
      <button type="button" aria-label="ดูช่วงถัดไปในกราฟ" disabled={!current || currentIndex === rows.length-1} onClick={() => setSelected(currentIndex+1)}>›</button>
    </div>
    <p className="analytics-chart-note">{loading ? 'กำลังอัปเดตข้อมูล…' : !hasRecords ? 'ยังไม่มีรายการในช่วงนี้' : 'แตะกราฟหรือเลือกช่วงเพื่อดูยอด'} · โอนเงินและค่าไฟนับเฉพาะค่าบริการ</p>
  </div>;
}
