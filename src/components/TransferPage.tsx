import { useId, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import axios from 'axios';
import ActionKeypad from './ActionKeypad';
import CashShortcuts from './CashShortcuts';
import { baht, bahtInput, dateTime, errorText, operationId, parseMoney, useOperationData } from '../storeOperations';
import type { CompletionDetails } from './TransactionCompletion';
import type { Transfer, TransferTotals } from '../storeOperations';

type TransferData = { totals: TransferTotals; records: Transfer[]; defaultFee: number };
type Props = { api: string; sessionId: string; isOwner: boolean; isShopOpen: boolean; service?: 'TRANSFER' | 'ELECTRICITY'; onComplete?: (notice: CompletionDetails) => void };
const banks = ['กสิกรไทย', 'ไทยพาณิชย์', 'กรุงไทย', 'กรุงเทพ', 'กรุงศรี', 'ออมสิน', 'ธ.ก.ส.', 'ทหารไทยธนชาต', 'พร้อมเพย์', 'อื่น ๆ'];
const logos = ['KBANK', 'SCB', 'KTB', 'BBL', 'BAY', 'GSB', 'BAAC', 'TTB', 'PromptPay'];
const emptyForm = { principal: '', fee: null as string | null, cash: '', bank: '', reference: '', note: '' };

export default function TransferPage({ api, sessionId, isOwner, isShopOpen, service = 'TRANSFER', onComplete }: Props) {
  const formId = useId();
  const electricity = service === 'ELECTRICITY';
  const principalLabel = electricity ? 'ยอดค่าไฟ' : 'ยอดโอน';
  const path = `${api}/api/app-sessions/${encodeURIComponent(sessionId)}/${electricity ? 'electricity' : 'transfers'}`;
  const [revision, setRevision] = useState(0);
  const { data, loading, error } = useOperationData<TransferData>(path, revision);
  const [form, setForm] = useState(emptyForm);
  const [amountField, setAmountField] = useState<'principal' | 'fee'>('principal');
  const [replaceAmount, setReplaceAmount] = useState(false);
  const [review, setReview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [failure, setFailure] = useState('');
  const [cancel, setCancel] = useState<Transfer>();
  const [reason, setReason] = useState('');
  const pending = useRef<{ key: string; id: string } | null>(null);
  const principalInput = useRef<HTMLInputElement>(null);
  const refresh = () => setRevision((value) => value + 1);
  const feeValue = form.fee ?? (data ? bahtInput(data.defaultFee) : '');
  const principal = parseMoney(form.principal);
  const fee = parseMoney(feeValue);
  const cash = parseMoney(form.cash);
  const due = principal !== null && fee !== null ? principal + fee : null;
  const difference = due !== null && cash !== null ? cash - due : null;

  function update(field: keyof typeof emptyForm, value: string) {
    setReplaceAmount(false);
    setForm((previous) => ({ ...previous, [field]: value }));
  }

  function enterKey(key: string) {
    const field = review ? 'cash' : amountField;
    const value = (field === 'fee' ? feeValue : form[field]) || '';
    const next = key === 'ล้าง' ? '' : key === 'ลบ' ? value.slice(0,-1) : (replaceAmount ? '' : value) + key;
    if (!/^\d{0,9}(?:\.\d{0,2})?$/.test(next)) return;
    update(field, next === '.' ? '0.' : next);
    setReplaceAmount(false);
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (busy || !isShopOpen) return;
    if (!review) { if (principal && fee !== null && (electricity || form.bank)) setReview(true); return; }
    setNotice('');
    setFailure('');
    if (!principal || fee === null || cash === null || difference === null || difference < 0) {
      setFailure(`ตรวจ${principalLabel} ค่าบริการ และเงินสดรับอีกครั้ง`);
      return;
    }
    const body = { principal, fee, cashReceived: cash, bank: electricity ? '' : form.bank, reference: electricity ? form.reference : '', note: form.note };
    const key = JSON.stringify(body);
    if (pending.current?.key !== key) pending.current = { key, id: operationId() };
    setBusy(true);
    try {
      await axios.post(path, { ...body, id: pending.current.id });
      pending.current = null;
      setNotice(`บันทึกแล้ว · ${principalLabel} ${baht(principal)} · ทอน ${baht(difference)}`);
      onComplete?.({ title: 'ทำรายการสำเร็จ', detail: `${electricity ? 'จ่ายค่าไฟ' : 'รับโอนเงิน'} · ${baht(due!)}`, change: difference / 100 });
      setForm(emptyForm);
      setAmountField('principal'); setReplaceAmount(false);
      setReview(false);
      refresh();
    } catch (err) {
      setFailure(errorText(err));
    } finally {
      setBusy(false);
      requestAnimationFrame(() => principalInput.current?.focus());
    }
  }


  async function cancelTransfer(event: FormEvent) {
    event.preventDefault();
    if (!cancel || !reason.trim() || busy) return;
    setBusy(true);
    setNotice('');
    setFailure('');
    try {
      await axios.post(`${path}/${cancel.id}/cancel`, { reason });
      setCancel(undefined);
      setReason('');
      setNotice('ยกเลิกบันทึกรายการแล้ว');
      refresh();
    } catch (err) {
      setFailure(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="operation-page transfer-page">
      {(failure || error) && <div className="operation-feedback error" role="alert">{failure || error}</div>}
      {notice && <div className="operation-feedback success" role="status">{notice}</div>}
      <div className="transfer-workspace">
        <section className="panel operation-panel">
          <div className="operation-heading">
            <span className="material-symbols-outlined" aria-hidden="true">{electricity ? 'bolt' : 'account_balance'}</span>
            <div><h2>{electricity ? 'บันทึกรับจ่ายค่าไฟ' : 'บันทึกรับเงินสดเพื่อโอน'}</h2><p>{electricity ? 'จ่ายค่าไฟผ่านช่องทางของร้าน แล้วบันทึกยอดค่าไฟและค่าบริการที่นี่' : 'โอนผ่านแอปธนาคาร แล้วบันทึกรายการที่นี่'}</p></div>
          </div>
          {!isShopOpen && <p className="operation-feedback">เปิดร้านก่อนบันทึกรายการ</p>}
          <form id={formId} onSubmit={save}>
            <fieldset disabled={!isShopOpen || busy || !data} className="operation-fields">
              {!review ? <>
              <div className="operation-form-grid">
                <label className="field"><span>{electricity ? 'ยอดค่าไฟ (บาท)' : 'ยอดที่ลูกค้าต้องการโอน (บาท)'}</span><input ref={principalInput} onFocus={() => {setAmountField('principal');setReplaceAmount(true);}} required inputMode="decimal" placeholder="0.00" value={form.principal} onChange={(event) => update('principal', event.target.value)} /></label>
                <label className="field"><span>ค่าบริการ (บาท)</span><input onFocus={() => {setAmountField('fee');setReplaceAmount(true);}} required inputMode="decimal" value={feeValue} onChange={(event) => update('fee', event.target.value)} /></label>
              </div>
              {!electricity && <div className="touch-options bank-options">{banks.map((bank,index) => <button type="button" aria-pressed={form.bank === bank} key={bank} onClick={() => update('bank', bank)}>{logos[index] && <img src={'/banks/'+logos[index]+'.png'} alt=""/>}{bank}</button>)}</div>}
              {electricity && <label className="field"><span>เลขผู้ใช้ไฟ / เลขอ้างอิง (ถ้ามี)</span><input maxLength={100} value={form.reference} onChange={event => update('reference', event.target.value)} /></label>}
              <label className="field"><span>หมายเหตุ</span><input maxLength={250} value={form.note} onChange={(event) => update('note', event.target.value)} /></label>
              </> : <><div className="fee-ticket"><span>{electricity ? 'ค่าไฟพร้อมค่าบริการ' : form.bank} · ยอดที่ต้องรับจริง</span><strong>{baht(due ?? 0)}</strong></div>
              <label className="field"><span>เงินสดที่รับจริง (บาท)</span><input required inputMode="decimal" placeholder="0.00" value={form.cash} onChange={(event) => update('cash', event.target.value)} /></label>
              <CashShortcuts due={due} value={cash} onSelect={amount => update('cash', bahtInput(amount))} />
              <div className="operation-actions"><button type="button" className="secondary-action" onClick={() => setReview(false)}>ย้อนกลับ</button></div></>}


            </fieldset>
          </form>
        </section>
        <div className="operation-stack">
          <section className="panel cash-dial">
            <h2>{review ? 'เงินสดที่รับ' : amountField === 'fee' ? 'ค่าบริการ' : principalLabel}</h2>
            <output>{(review ? form.cash : amountField === 'fee' ? feeValue : form.principal) || '0'} บาท</output>
            <ActionKeypad className="counter-keys" formId={formId} disabled={!data || !isShopOpen || busy}
              actionLabel={busy ? 'กำลังบันทึก…' : review ? 'รับเงิน' : 'สรุปรายการ'}
              actionDisabled={!principal || fee === null || (!electricity && !form.bank) || (review && (difference === null || difference < 0))}
              onDigit={enterKey} onDelete={() => enterKey('ลบ')} onClear={() => enterKey('ล้าง')} />
            {review && difference !== null && <p aria-live="polite">{difference < 0 ? 'เงินสดยังขาด' : 'เงินทอน'} <b>{baht(Math.abs(difference))}</b></p>}
          </section>
        </div>
      </div>
      <section className="panel operation-panel">
        <div className="operation-title-row"><div><h2>{electricity ? 'รายการจ่ายค่าไฟรอบนี้' : 'รายการรับโอนรอบนี้'}</h2><p>{data ? `${data.totals.count} รายการสำเร็จ · แสดงล่าสุดสูงสุด 100 รายการ` : ''}</p></div><button className="secondary-action" type="button" onClick={refresh} disabled={loading}>รีเฟรช</button></div>
        {data && <div className="operation-metrics">
          {([[electricity ? 'ยอดค่าไฟ' : 'ยอดที่โอน', data.totals.principal], ['ค่าบริการ', data.totals.fee], ['เงินสดรับ', data.totals.cash], ['เงินทอน', data.totals.change]] as const).map(([label, value]) => <div key={label}><span>{label}</span><strong>{baht(value)}</strong></div>)}
        </div>}
        {cancel && <form className="operation-feedback operation-stack" onSubmit={cancelTransfer}>
          <strong>ยกเลิกบันทึกรายการ {baht(cancel.principal)}</strong><p>{electricity ? 'ตรวจสอบการจ่ายค่าไฟก่อน การยกเลิกนี้มีผลกับบันทึกของร้าน' : 'ตรวจสอบธุรกรรมในแอปธนาคารก่อน การยกเลิกนี้มีผลกับบันทึกของร้าน'}</p>
          <label className="field"><span>เหตุผล</span><input required maxLength={250} value={reason} onChange={(event) => setReason(event.target.value)} /></label>
          <div className="operation-actions"><button className="secondary-action" type="button" onClick={() => { setCancel(undefined); setReason(''); }} disabled={busy}>กลับ</button><button className="danger-action" type="submit" disabled={busy || !reason.trim()}>ยืนยันยกเลิก</button></div>
        </form>}
        {data?.records.length ? <div className="operation-table"><table>
          <thead><tr><th>เวลา / ผู้บันทึก</th><th>{electricity ? 'เลขผู้ใช้ไฟ / อ้างอิง' : 'ธนาคาร / อ้างอิง'}</th><th>{principalLabel}</th><th>ค่าบริการ</th><th>รับสด</th><th>ทอน</th><th>สถานะ</th></tr></thead>
          <tbody>{data.records.map((row) => <tr key={row.id}>
            <td>{dateTime(row.createdAt)}<small>{row.staff}</small></td>
            <td>{electricity ? row.reference || '—' : row.bank || '—'}<small>{!electricity && row.reference}{!electricity && row.reference && row.note ? ' · ' : ''}{row.note}</small></td>
            <td>{baht(row.principal)}</td><td>{baht(row.fee)}</td><td>{baht(row.cashReceived)}</td><td>{baht(row.change)}</td>
            <td>{row.cancelledAt ? <><span className="badge danger">ยกเลิกแล้ว</span><small>{row.cancelReason}</small></> : isOwner && isShopOpen ? <button type="button" className="text-action" disabled={busy} onClick={() => { setCancel(row); setReason(''); }}>ยกเลิกบันทึก</button> : <span className="badge success">บันทึกแล้ว</span>}</td>
          </tr>)}</tbody>
        </table></div> : <p className="operation-empty">{loading ? 'กำลังโหลดรายการ…' : electricity ? 'ยังไม่มีรายการจ่ายค่าไฟในรอบนี้' : 'ยังไม่มีรายการรับโอนในรอบนี้'}</p>}
      </section>
    </div>
  );
}
