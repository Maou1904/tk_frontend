import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import ActionKeypad from './ActionKeypad';
import CashShortcuts from './CashShortcuts';
import { baht, bahtInput, parseMoney } from '../storeOperations';

type Props = {
  total: number; value: number; approval?: boolean; busy: boolean; error?: string;
  onConfirm: (value: number) => Promise<void> | void; onCancel: () => void;
};

export default function LotteryCashDialog({ total, value, approval, busy, error, onConfirm, onCancel }: Props) {
  const [amount, setAmount] = useState(value > 0 ? bahtInput(Math.round(value * 100)) : '');
  const [replace, setReplace] = useState(true);
  const input = useRef<HTMLInputElement>(null);
  const previousFocus = useRef(document.activeElement as HTMLElement | null);
  const cash = parseMoney(amount);
  const due = Math.round(total * 100);
  const change = cash === null ? null : cash - due;
  useEffect(() => {
    const previous = previousFocus.current;
    input.current?.focus();
    return () => previous?.focus();
  }, []);

  function enter(key: string) {
    const next = key === 'ล้าง' ? '' : key === 'ลบ' ? amount.slice(0, -1) : (replace ? '' : amount) + key;
    if (/^\d{0,9}(?:\.\d{0,2})?$/.test(next)) {
      setAmount(next === '.' ? '0.' : next); setReplace(false);
    }
  }
  function shortcut(value: number) { setAmount(bahtInput(value)); setReplace(true); }
  function handleKeys(event: KeyboardEvent<HTMLElement>) {
    if (!busy && !(event.target instanceof HTMLInputElement) && !event.ctrlKey && !event.metaKey && !event.altKey) {
      if (/^[0-9.]$/.test(event.key)) { event.preventDefault(); enter(event.key); }
      else if (event.key === 'Backspace') { event.preventDefault(); enter('ลบ'); }
    }
    if (event.key === 'Escape' && !busy) { event.preventDefault(); onCancel(); }
    if (event.key === 'Tab') {
      const buttons = [...event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled)')];
      const first = buttons[0], last = buttons.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
  }
  return <div className="modal-backdrop lottery-cash-backdrop">
    <section className="panel lottery-cash-dialog" role="dialog" aria-modal="true" aria-labelledby="lottery-cash-title" onKeyDown={handleKeys}>
      <h2 id="lottery-cash-title">{approval ? 'ตรวจรับเงินสลาก' : 'รับเงินสลาก'}</h2>
      <div className="fee-ticket"><span>ยอดที่ต้องรับ</span><strong>{baht(due)}</strong></div>
      {error && <p className="operation-feedback error" role="alert">{error}</p>}
      <form onSubmit={event => { event.preventDefault(); if (!busy && cash !== null && cash >= due) void onConfirm(cash / 100); }}>
        <fieldset disabled={busy} className="operation-fields">
          <label className="field"><span>เงินที่รับจริง (บาท)</span><input ref={input} inputMode="decimal" value={amount} placeholder="0.00" onFocus={() => setReplace(true)} onChange={event => { if (/^\d{0,9}(?:\.\d{0,2})?$/.test(event.target.value)) { setAmount(event.target.value); setReplace(false); } }} /></label>
          <CashShortcuts due={due} value={cash} disabled={busy} showUnit={false} onSelect={shortcut} />
          <ActionKeypad className="counter-keys" label="แป้นตัวเลขรับเงิน" disabled={busy} actionLabel={busy ? 'กำลังยืนยัน…' : 'ยืนยัน'} actionName={approval ? 'ยืนยันว่ารับเงินจริงแล้ว' : 'ยืนยันยอดรับเงิน'} actionDisabled={cash === null || cash < due} onDigit={enter} onDelete={() => enter('ลบ')} onClear={() => enter('ล้าง')} />
          <div className="change-box" aria-live="polite"><span>{change !== null && change < 0 ? 'เงินยังขาด' : 'เงินทอน'}</span><strong>{baht(Math.abs(change ?? 0))}</strong></div>
          <div className="lottery-reset-actions">
            <button type="button" className="secondary-action" onClick={onCancel}>ย้อนกลับ</button>
          </div>
        </fieldset>
      </form>
    </section>
  </div>;
}
