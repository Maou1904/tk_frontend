import { useRef, useState } from 'react';
import type { FormEvent } from 'react';
import axios from 'axios';
import { dateTime, errorText, operationId, useOperationData } from '../storeOperations';
import type { StockProduct } from '../storeOperations';

type Line = { productId: number; name: string; unit: string; before: number; quantity: number; after: number };
type Document = { id: string; items: Line[]; note: string; actor: string; created_at: string };
type Props = { api: string; products: StockProduct[]; onRefreshStock: () => Promise<void> };
const asQuantity = (value: string) => /^\d{1,7}$/.test(value) && Number(value) <= 1000000 ? Number(value) : -1;
const documentCode = (id: string) => `นับ-${id.slice(0, 8).toUpperCase()}`;

export default function StockDocuments({ api, products, onRefreshStock }: Props) {
  const kind = 'COUNT';
  const path = `${api}/api/stock/documents`;
  const [revision, setRevision] = useState(0);
  const { data, loading, error } = useOperationData<Document[]>(`${path}?kind=${kind}`, revision);
  const [search, setSearch] = useState('');
  const [draft, setDraft] = useState<Record<number, { quantity: string; expected: number }>>({});
  const [note, setNote] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [failure, setFailure] = useState('');
  const pending = useRef<{ key: string; id: string }>(null);
  const lines = products.filter((item) => Object.hasOwn(draft, item.id));
  const unavailable = Object.keys(draft).filter((id) => !lines.some((item) => String(item.id) === id));
  const term = search.trim().toLowerCase();
  const matches = term ? products.filter((item) => item.name.toLowerCase().includes(term) || item.barcode.toLowerCase().includes(term)).slice(0, 10) : [];
  const differs = lines.some(({ id }) => asQuantity(draft[id].quantity) >= 0 && asQuantity(draft[id].quantity) !== draft[id].expected);
  const invalid = !lines.length || unavailable.length > 0 || lines.some(({ id, stock }) => {
    const quantity = asQuantity(draft[id].quantity);
    return quantity < 0 || draft[id].expected !== stock;
  });
  const selected = data?.find(({ id }) => id === selectedId);

  async function refresh() {
    setRevision((value) => value + 1);
    await onRefreshStock().catch(() => setFailure('โหลดสต็อกล่าสุดไม่สำเร็จ กรุณาลองอีกครั้ง'));
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (busy || invalid || (differs && !note.trim())) return;
    const body = { kind, note, items: lines.map(({ id }) => ({
      productId: id, quantity: asQuantity(draft[id].quantity), expected: draft[id].expected,
    })) };
    const key = JSON.stringify(body);
    if (pending.current?.key !== key) pending.current = { key, id: operationId() };
    setBusy(true);
    setNotice('');
    setFailure('');
    try {
      const { data: record } = await axios.post<{ id: string }>(path, { ...body, id: pending.current.id });
      pending.current = null;
      setDraft({});
      setNote('');
      setSelectedId(record.id);
      setNotice('บันทึกผลตรวจนับและอัปเดตสต็อกแล้ว');
      await refresh();
    } catch (err) {
      setFailure(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return <div className="operation-page">
    {failure && <p className="operation-feedback error" role="alert">{failure}</p>}
    {notice && <p className="operation-feedback success" role="status">{notice}</p>}
    <form className="panel operation-panel" onSubmit={save}>
      <div className="operation-title-row">
        <div><h2>บันทึกตรวจนับสต็อกหน้าร้าน</h2>
          <p>เทียบยอดที่นับได้กับระบบ การบันทึกจะปรับสต็อกเฉพาะสินค้าที่เลือก</p>
        </div>
        <button className="secondary-action" type="button" disabled={busy} onClick={async () => { setBusy(true); setFailure(''); await refresh(); setBusy(false); }}>โหลดสต็อกล่าสุด</button>
      </div>
      <fieldset className="operation-fields" disabled={busy}>
        <label className="field"><span>เพิ่มสินค้า</span><input placeholder="ค้นหาชื่อหรือบาร์โค้ด" value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault(); }} /></label>
        {term && <div className="order-search-results">{matches.length ? matches.map((item) =>
          <button className="secondary-action" key={item.id} type="button" disabled={Object.hasOwn(draft, item.id) || Object.keys(draft).length >= 200}
            onClick={() => { setDraft({ ...draft, [item.id]: { quantity: '', expected: item.stock } }); setSearch(''); }}>{item.name} · {item.stock} {item.unit}</button>,
        ) : <p>ไม่พบสินค้า</p>}</div>}
        {unavailable.length > 0 && <div className="operation-feedback">
          มีสินค้าในแบบร่างที่ปิดใช้งานหรือไม่อยู่ในรายการล่าสุด{' '}
          <button type="button" className="text-action" onClick={() => setDraft(Object.fromEntries(lines.map(({ id }) => [id, draft[id]])))}>นำรายการเหล่านั้นออก</button>
        </div>}
        {lines.length > 0 && <div className="operation-table"><table><thead><tr><th>สินค้า</th><th>ยอดในระบบ</th><th>นับได้จริง</th><th>ส่วนต่าง</th><th></th></tr></thead>
          <tbody>{lines.map((item) => {
            const line = draft[item.id];
            const quantity = asQuantity(line.quantity);
            const base = line.expected;
            return <tr key={item.id}>
              <td>{item.name}<small>{item.unit}</small></td><td>{base}{base !== item.stock && <button type="button" className="text-action" onClick={() => setDraft({ ...draft, [item.id]: { expected: item.stock, quantity: '' } })}> ใช้ยอดล่าสุด {item.stock} และนับใหม่</button>}</td>
              <td><input className="operation-quantity" aria-label={`นับจริง ${item.name}`} required type="number" min="0" max="1000000" value={line.quantity} onChange={(e) => setDraft({ ...draft, [item.id]: { ...line, quantity: e.target.value } })} /></td>
              <td>{quantity < 0 ? '—' : quantity - base}</td>
              <td><button type="button" className="text-action" onClick={() => { const next = { ...draft }; delete next[item.id]; setDraft(next); }}>เอาออก</button></td>
            </tr>;
          })}</tbody>
        </table></div>}
        <label className="field"><span>{differs ? 'หมายเหตุสำหรับส่วนต่าง' : 'หมายเหตุ'}</span><input maxLength={250} required={differs} value={note} onChange={(e) => setNote(e.target.value)} /></label>
        <div className="operation-actions"><button className="primary-action" type="submit" disabled={invalid}>ยืนยันผลตรวจนับ</button></div>
      </fieldset>
    </form>
    <section className="panel operation-panel">
      <h2>ประวัติตรวจนับ</h2>
      {error && <p className="operation-feedback error" role="alert">{error}</p>}
      {data?.length ? <div className="operation-table"><table><thead><tr><th>เอกสาร / ผู้บันทึก</th><th>วันที่</th><th></th></tr></thead>
        <tbody>{data.map((doc) => <tr key={doc.id} className={selectedId === doc.id ? 'operation-selected' : ''}>
          <td>{documentCode(doc.id)}<small>{doc.actor} · {doc.items.length} สินค้า</small></td>
          <td>{dateTime(doc.created_at)}</td>
          <td><button type="button" className="secondary-action" disabled={busy} onClick={() => setSelectedId(doc.id)}>ดูรายละเอียด</button></td>
        </tr>)}</tbody>
      </table></div> : <p className="operation-empty">{loading ? 'กำลังโหลด…' : 'ยังไม่มีเอกสาร'}</p>}
    </section>
    {selected && <section className="panel operation-panel">
      <div><h2>{documentCode(selected.id)}</h2>{selected.note && <p>{selected.note}</p>}</div>
      <div className="operation-table"><table><thead><tr><th>สินค้า</th><th>ก่อนนับ</th><th>นับจริง</th><th>ส่วนต่าง</th></tr></thead>
        <tbody>{selected.items.map((item) => <tr key={item.productId}><td>{item.name}<small>{item.unit}</small></td><td>{item.before}</td><td>{item.quantity}</td><td>{item.after - item.before}</td></tr>)}</tbody>
      </table></div>
    </section>}
  </div>;
}
