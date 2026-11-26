import { useEffect, useRef, useState } from 'react';
import axios from 'axios';

type Preview = { ticketCount: number; total: number; pendingCount: number; version: string };

export default function LotteryStockReset({ api, onReset }: { api: string; onReset: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<Preview>();
  const [reason, setReason] = useState('เปลี่ยนงวดสลาก');
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const heading = useRef<HTMLHeadingElement>(null);
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);
  useEffect(() => { if (open) heading.current?.focus(); }, [open]);
  async function show() {
    request.current?.abort();
    const controller = new AbortController(); request.current = controller;
    setPreview(undefined); setChecked(false); setNotice(''); setOpen(true);
    try {
      const { data } = await axios.get<Preview>(`${api}/api/lottery/stock/reset-preview`, { signal: controller.signal });
      if (!controller.signal.aborted) setPreview(data);
    } catch { if (!controller.signal.aborted) setNotice('โหลดสรุปสต็อกไม่สำเร็จ ปิดแล้วเปิดใหม่เพื่อลองอีกครั้ง'); }
  }
  function close() { if (!busy) { request.current?.abort(); setOpen(false); } }
  async function reset() {
    if (!preview || !checked || !reason.trim() || busy) return;
    setBusy(true); setNotice('');
    try {
      const { data } = await axios.post<{ cleared: number }>(`${api}/api/lottery/stock/reset`, {
        confirm: 'RESET_LOTTERY_STOCK', expectedVersion: preview.version, reason: reason.trim(),
      });
      // The reset has committed; a refresh error must not invite repeating the reset.
      setOpen(false); setNotice(`เคลียร์สต็อกงวดเดิมแล้ว ${data.cleared} ใบ เริ่มรับสลากงวดใหม่ได้`);
      try { await onReset(); } catch { setNotice('เคลียร์สต็อกแล้ว กรุณารีเฟรชหน้าเพื่อดูยอดล่าสุด'); }
    } catch (error) {
      if (axios.isAxiosError<{ error?: string; preview?: Preview }>(error)) {
        setNotice(error.response?.data.error || 'เคลียร์สต็อกไม่สำเร็จ กรุณาตรวจยอดแล้วลองใหม่');
        if (error.response?.data.preview) { setPreview(error.response.data.preview); setChecked(false); }
      } else setNotice('เคลียร์สต็อกไม่สำเร็จ');
    } finally { setBusy(false); }
  }
  return <div className="lottery-reset-control">
    <button type="button" className="secondary-action" onClick={() => void show()}>เคลียร์สต็อกงวดเดิม</button>
    {!open && notice && <p role="status">{notice}</p>}
    {open && <div className="modal-backdrop lottery-reset-backdrop" role="presentation">
      <section className="panel lottery-reset-dialog" role="dialog" aria-modal="true" aria-labelledby="lottery-reset-title" onKeyDown={event => {
        if (event.key === 'Escape') close();
        if (event.key === 'Tab') {
          const focusable = [...event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), textarea:not(:disabled)')];
          const first = focusable[0], last = focusable.at(-1);
          if (event.shiftKey && (document.activeElement === first || document.activeElement === heading.current)) { event.preventDefault(); last?.focus(); }
          else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
        }
      }}>
        <h2 ref={heading} tabIndex={-1} id="lottery-reset-title">เคลียร์สต็อกสลากเพื่อเปลี่ยนงวด</h2>
        <p>สต็อกเลข 00–99 จะเป็นศูนย์ และเลขเหล่านี้จะถูกล้างออกจากตะกร้าที่ยังไม่ส่งรายการ</p>
        <p><strong>เก็บประวัติขายและรายการรอยืนยันรับเงินเดิมไว้ครบ</strong> ยกเลิกรายการงวดเก่าภายหลังจะไม่เพิ่มสต็อกงวดใหม่</p>
        {preview ? <div className="lottery-reset-summary"><div><span>สลากคงเหลือที่จะเคลียร์</span><strong>{preview.total.toLocaleString('th-TH')} ใบ</strong></div><div><span>รายการรอยืนยันที่เก็บไว้</span><strong>{preview.pendingCount} รายการ</strong></div></div> : <p>กำลังโหลดสรุปสต็อก…</p>}
        <label className="field"><span>เหตุผล</span><input maxLength={500} value={reason} disabled={busy} onChange={event => setReason(event.target.value)} /></label>
        <label className="lottery-reset-check"><input type="checkbox" checked={checked} disabled={busy || !preview} onChange={event => setChecked(event.target.checked)} /><span>ตรวจแล้ว ต้องการให้สต็อกเลข 00–99 เป็นศูนย์</span></label>
        <p role="status" className="lottery-reset-notice">{notice}</p>
        <div className="lottery-reset-actions"><button type="button" className="secondary-action" disabled={busy} onClick={close}>กลับไปก่อน</button><button type="button" className="primary-action" disabled={busy || !preview || !checked || !reason.trim()} onClick={() => void reset()}>{busy ? 'กำลังเคลียร์สต็อก…' : 'ยืนยันเคลียร์สต็อกงวดเดิม'}</button></div>
      </section>
    </div>}
  </div>;
}
