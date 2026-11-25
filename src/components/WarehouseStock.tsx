import { useRef, useState } from 'react';
import type { FormEvent } from 'react';
import axios from 'axios';
import { dateTime, errorText, operationId, useOperationData } from '../storeOperations';
import type { StockProduct } from '../storeOperations';

type Item = Omit<StockProduct, 'stock'> & { quantity: number; active: boolean };
type Movement = { id: string; name: string; unit: string; delta: number; balance: number; note: string; actor: string; created_at: string };
type Warehouse = { items: Item[]; movements: Movement[] };
type Draft = { productId: number; name: string; direction: 1 | -1; quantity: string; note: string };

export default function WarehouseStock({ api, products }: { api: string; products: StockProduct[] }) {
  const path = `${api}/api/warehouse`;
  const [revision, setRevision] = useState(0);
  const { data, error, loading } = useOperationData<Warehouse>(path, revision);
  const [search, setSearch] = useState('');
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<Draft>();
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState('');
  const [notice, setNotice] = useState('');
  const pending = useRef<{ key: string; id: string }>(null);
  const term = search.trim().toLowerCase();
  const matches = (item: Pick<StockProduct, 'name' | 'barcode'>) =>
    item.name.toLowerCase().includes(term) || item.barcode.toLowerCase().includes(term);
  const balance = data?.items.find((item) => item.id === draft?.productId)?.quantity ?? 0;
  const refresh = () => setRevision((value) => value + 1);

  function select(item: Pick<StockProduct, 'id' | 'name'>, direction: Draft['direction']) {
    setDraft({ productId: item.id, name: item.name, direction, quantity: '1', note: '' });
    setAdding(false);
    setSearch('');
    setFailure('');
    setNotice('');
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!draft || busy || loading) return;
    const quantity = Number(draft.quantity);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 1000000) return;
    const body = { productId: draft.productId, delta: quantity * draft.direction, note: draft.note.trim() };
    const key = JSON.stringify(body);
    if (pending.current?.key !== key) pending.current = { key, id: operationId() };
    setBusy(true);
    setFailure('');
    setNotice('');
    try {
      await axios.post(`${path}/movements`, { ...body, id: pending.current.id });
      pending.current = null;
      setDraft(undefined);
      setNotice(draft.direction > 0 ? `เพิ่ม ${draft.name} เข้าโกดังแล้ว` : `เบิก ${draft.name} ออกจากโกดังแล้ว`);
      refresh();
    } catch (err) {
      setFailure(errorText(err));
      if (axios.isAxiosError(err) && err.response?.status === 409) refresh();
    } finally {
      setBusy(false);
    }
  }

  return <div className="operation-page">
    <section className="panel operation-panel">
      <div className="operation-title-row">
        <div><h2>สต็อกโกดัง</h2><p>ยอดคงเหลือแยกจากหน้าร้าน</p></div>
        <div className="operation-actions">
          <button type="button" className="secondary-action" disabled={busy || loading} onClick={refresh}>รีเฟรช</button>
          <button type="button" className="primary-action" disabled={busy || loading} onClick={() => { setAdding(true); setDraft(undefined); setSearch(''); setNotice(''); setFailure(''); }}>เพิ่มของเข้าโกดัง</button>
        </div>
      </div>
      {(failure || error) && <p className="operation-feedback error" role="alert">{failure || error}</p>}
      {notice && <p className="operation-feedback success" role="status">{notice}</p>}
      {adding && <div className="order-editor operation-stack">
        <label className="field"><span>เลือกสินค้าที่จะเพิ่มเข้าโกดัง</span><input autoFocus placeholder="ค้นหาชื่อหรือบาร์โค้ด" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
        <div className="order-search-results">{products.filter(matches).slice(0, 12).map((item) => <button type="button" className="secondary-action" key={item.id} onClick={() => select(item, 1)}>{item.name}{item.barcode && ` · ${item.barcode}`}</button>)}</div>
        {!products.some(matches) && <p>ไม่พบสินค้าในรายการสินค้า</p>}
        <div className="operation-actions"><button type="button" className="secondary-action" onClick={() => { setAdding(false); setSearch(''); }}>ยกเลิก</button></div>
      </div>}
      {draft && <form className="order-editor" onSubmit={save}>
        <fieldset className="operation-fields" disabled={busy || loading}>
          <h3>{draft.direction > 0 ? 'เพิ่มเข้าโกดัง' : 'เบิกจากโกดัง'} · {draft.name}</h3>
          <p>คงเหลือในโกดัง {balance}</p>
          <div className="operation-form-grid">
            <label className="field"><span>จำนวน</span><input autoFocus type="number" required min="1" max={draft.direction > 0 ? 1000000 : Math.min(balance, 1000000)} value={draft.quantity} onChange={(event) => setDraft({ ...draft, quantity: event.target.value })} /></label>
            <label className="field"><span>หมายเหตุ</span><input maxLength={250} value={draft.note} onChange={(event) => setDraft({ ...draft, note: event.target.value })} /></label>
          </div>
          <div className="operation-actions"><button type="submit" className="primary-action" disabled={draft.direction < 0 && Number(draft.quantity) > balance}>{draft.direction > 0 ? 'บันทึกเพิ่มของ' : 'ยืนยันเบิกของ'}</button><button type="button" className="secondary-action" onClick={() => setDraft(undefined)}>ยกเลิก</button></div>
        </fieldset>
      </form>}
      {!adding && !draft && <label className="field"><span>ค้นหาในโกดัง</span><input placeholder="ชื่อหรือบาร์โค้ด" value={search} onChange={(event) => setSearch(event.target.value)} /></label>}
      {data?.items.length ? <div className="operation-table"><table><thead><tr><th>สินค้า</th><th>คงเหลือในโกดัง</th><th>จัดการ</th></tr></thead>
        <tbody>{data.items.filter((item) => adding || matches(item)).map((item) => <tr key={item.id}>
          <td><strong>{item.name}</strong>{item.barcode && <small>{item.barcode}</small>}{!item.active && <small>ปิดใช้งานในรายการสินค้า</small>}</td>
          <td>{item.quantity.toLocaleString('th-TH')} {item.unit}</td>
          <td><div className="operation-actions"><button type="button" className="secondary-action" disabled={busy || loading || !item.active} onClick={() => select(item, 1)}>เพิ่ม</button><button type="button" className="secondary-action" disabled={busy || loading || !item.quantity} onClick={() => select(item, -1)}>เบิก</button></div></td>
        </tr>)}</tbody></table></div> : <p className="operation-empty">{loading ? 'กำลังโหลด…' : 'ยังไม่มีสินค้าในโกดัง'}</p>}
      {data?.items.length && !adding && !data.items.some(matches) ? <p className="operation-empty">ไม่พบสินค้าที่ค้นหาในโกดัง</p> : null}
    </section>
    <section className="panel operation-panel">
      <h2>ประวัติโกดังล่าสุด</h2>
      {data?.movements.length ? <div className="operation-table"><table><thead><tr><th>วันเวลา / ผู้บันทึก</th><th>สินค้า</th><th>เพิ่ม / เบิก</th><th>คงเหลือ</th><th>หมายเหตุ</th></tr></thead>
        <tbody>{data.movements.map((item) => <tr key={item.id}>
          <td>{dateTime(item.created_at)}<small>{item.actor}</small></td><td>{item.name}</td>
          <td><span className={`badge ${item.delta > 0 ? 'success' : 'warning'}`}>{item.delta > 0 ? '+' : '−'}{Math.abs(item.delta)} {item.unit}</span></td>
          <td>{item.balance} {item.unit}</td><td>{item.note || '—'}</td>
        </tr>)}</tbody></table></div> : <p className="operation-empty">{loading ? 'กำลังโหลด…' : 'ยังไม่มีประวัติ'}</p>}
    </section>
  </div>;
}
