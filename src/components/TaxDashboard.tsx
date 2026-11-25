import { useState } from 'react';
import type { FormEvent } from 'react';
import axios from 'axios';
import { baht, currentMonth, dateTime, downloadCsv, errorText, useOperationData } from '../storeOperations';
import type { Transfer } from '../storeOperations';

type Review = { reviewed: boolean; note: string; updatedAt?: string };
type TaxData = { sales: { channel: string; count: number; amount: number }[]; transfers: Transfer[]; review: Review };
const channels: Record<string, string> = { POS: 'ขายหน้าร้าน', GAS: 'ขายแก๊ส', LOTTERY: 'สลาก', TOPUP: 'เติมเงินมือถือ' };

export default function TaxDashboard({ api }: { api: string }) {
  const [month, setMonth] = useState(currentMonth);
  const [revision, setRevision] = useState(0);
  const { data, loading, error } = useOperationData<TaxData>(month ? `${api}/api/tax-report?month=${month}` : null, revision);
  const valid = data?.transfers.filter((row) => !row.cancelledAt) ?? [];
  const totals = valid.reduce((sum, row) => ({
    principal: sum.principal + row.principal, fee: sum.fee + row.fee,
    cash: sum.cash + row.cashReceived, change: sum.change + row.change,
  }), { principal: 0, fee: 0, cash: 0, change: 0 });
  const sales = data?.sales.reduce((sum, row) => sum + row.amount, 0) ?? 0;

  function exportReport() {
    if (!data) return;
    downloadCsv(`tingkum-tax-${month}.csv`, [
      ['เดือน', month, 'เวลาประเทศไทย'],
      ['ยอดจากรายการขายที่สำเร็จ', sales / 100],
      ...data.sales.map((row) => [channels[row.channel] || row.channel, row.amount / 100, row.count]),
      ['ยอดเงินลูกค้าที่โอน', totals.principal / 100],
      ['ค่าบริการรับโอน', totals.fee / 100],
      ['เงินสดรับจากบริการโอน', totals.cash / 100],
      ['เงินทอนจากบริการโอน', totals.change / 100],
      ['สถานะตรวจข้อมูล', data.review.reviewed ? 'ตรวจแล้ว' : 'รอตรวจ', data.review.note],
      [],
      ['รหัสบันทึก', 'เวลาบันทึก (ไทย)', 'ผู้บันทึก', 'ธนาคาร', 'เลขอ้างอิง', 'ยอดโอน', 'ค่าบริการ', 'รับสด', 'ทอน', 'หมายเหตุ', 'สถานะ', 'เหตุผลยกเลิก', 'เวลายกเลิก'],
      ...data.transfers.map((row) => [row.id, dateTime(row.createdAt), row.staff, row.bank, row.reference,
        row.principal / 100, row.fee / 100, row.cashReceived / 100, row.change / 100, row.note,
        row.cancelledAt ? 'ยกเลิก' : 'บันทึกแล้ว', row.cancelReason || '', row.cancelledAt ? dateTime(row.cancelledAt) : '']),
    ]);
  }

  return <div className="operation-page">
    <section className="panel operation-panel">
      <div className="operation-title-row">
        <div className="operation-heading"><span className="material-symbols-outlined" aria-hidden="true">receipt_long</span><div><h2>จัดการข้อมูลภาษี</h2><p>เทียบยอดร้านกับสลิปและ Statement ประจำเดือน</p></div></div>
        <div className="operation-actions">
          <label className="field"><span>เดือนที่ตรวจ</span><input type="month" min="2000-01" max="2099-12" value={month} onChange={(event) => setMonth(event.target.value)} /></label>
          <button className="primary-action" type="button" disabled={!data || loading} onClick={exportReport}><span className="material-symbols-outlined" aria-hidden="true">download</span> ส่งออก CSV</button>
        </div>
      </div>
      {error && <p className="operation-feedback error" role="alert">{error} <button className="text-action" type="button" onClick={() => setRevision((value) => value + 1)}>ลองอีกครั้ง</button></p>}
      {data ? <>
        <div className="operation-metrics">
          <div><span>ยอดขายที่สำเร็จ</span><strong>{baht(sales)}</strong></div>
          <div><span>ค่าบริการรับโอน</span><strong>{baht(totals.fee)}</strong></div>
          <div><span>ยอดเงินลูกค้าที่โอน</span><strong>{baht(totals.principal)}</strong></div>
          <div><span>รายการรับโอนสำเร็จ</span><strong>{valid.length.toLocaleString('th-TH')}</strong></div>
        </div>
        <p className="operation-feedback">สรุปนี้ใช้กระทบยอดและเตรียมเอกสารให้ผู้ทำบัญชี เก็บสลิปหรือหลักฐานที่ตรงกับเลขอ้างอิงไว้ประกอบการตรวจ</p>
      </> : !error && <p className="operation-empty">{loading ? 'กำลังโหลดข้อมูลเดือนนี้…' : 'เลือกเดือนที่ต้องการตรวจ'}</p>}
    </section>
    {data && <>
      <div className="transfer-workspace">
        <section className="panel operation-panel">
          <h2>ยอดขายตามช่องทาง</h2>
          <div className="operation-table"><table><thead><tr><th>ช่องทาง</th><th>รายการ</th><th>ยอด</th></tr></thead>
            <tbody>{Object.entries(channels).map(([channel, label]) => {
              const row = data.sales.find((entry) => entry.channel === channel);
              return <tr key={channel}><td>{label}</td><td>{row?.count ?? 0}</td><td>{baht(row?.amount ?? 0)}</td></tr>;
            })}</tbody>
          </table></div>
        </section>
        <MonthlyReview key={month} api={api} month={month} initial={data.review} refresh={() => setRevision((value) => value + 1)} />
      </div>
      <section className="panel operation-panel">
        <div className="operation-title-row"><div><h2>หลักฐานรายการรับโอน</h2><p>เงินสดรับ {baht(totals.cash)} · เงินทอน {baht(totals.change)}</p></div></div>
        {data.transfers.length ? <div className="operation-table tax-transfer-table"><table><thead><tr><th>เวลา</th><th>ธนาคาร / เลขอ้างอิง</th><th>ยอดโอน</th><th>ค่าบริการ</th><th>สถานะ</th></tr></thead>
          <tbody>{data.transfers.map((row) => <tr key={row.id}><td>{dateTime(row.createdAt)}<small>{row.staff}</small></td><td>{row.bank || '—'}<small>{row.reference || 'ไม่มีเลขอ้างอิง'}{row.note && ` · ${row.note}`}</small></td><td>{baht(row.principal)}</td><td>{baht(row.fee)}</td><td><span className={`badge ${row.cancelledAt ? 'danger' : 'success'}`}>{row.cancelledAt ? 'ยกเลิก' : 'บันทึกแล้ว'}</span>{row.cancelReason && <small>{row.cancelReason}</small>}</td></tr>)}</tbody>
        </table></div> : <p className="operation-empty">ยังไม่มีรายการรับโอนในเดือนนี้</p>}
      </section>
    </>}
  </div>;
}

function MonthlyReview({ api, month, initial, refresh }: { api: string; month: string; initial: Review; refresh: () => void }) {
  const [review, setReview] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [failure, setFailure] = useState('');

  async function save(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setFailure('');
    setNotice('');
    try {
      const { data } = await axios.put<Review>(`${api}/api/tax-report/${month}/review`, review);
      setReview(data);
      setNotice('บันทึกผลการตรวจแล้ว');
      refresh();
    } catch (error) {
      setFailure(errorText(error));
    } finally {
      setBusy(false);
    }
  }

  return <form className="panel operation-panel" onSubmit={save}>
    <h2>ตรวจยอดประจำเดือน</h2>
    <fieldset className="operation-fields" disabled={busy}>
      <label className="operation-checkbox"><input type="checkbox" checked={review.reviewed} onChange={(event) => setReview({ ...review, reviewed: event.target.checked })} /> ตรวจยอดกับหลักฐานแล้ว</label>
      <label className="field"><span>หมายเหตุสำหรับผู้ทำบัญชี</span><textarea rows={3} maxLength={1500} value={review.note} onChange={(event) => setReview({ ...review, note: event.target.value })} /></label>
      {review.updatedAt && <small>บันทึกล่าสุด {dateTime(review.updatedAt)}</small>}
      <button className="secondary-action" type="submit">{busy ? 'กำลังบันทึก…' : 'บันทึกผลการตรวจ'}</button>
    </fieldset>
    {failure && <p className="operation-feedback error" role="alert">{failure}</p>}
    {notice && <p className="operation-feedback success" role="status">{notice}</p>}
  </form>;
}
