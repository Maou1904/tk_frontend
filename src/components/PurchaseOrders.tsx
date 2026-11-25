import { useRef, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import axios from 'axios';
import { dateTime, downloadCsv, errorText, operationId, useOperationData } from '../storeOperations';

import type { StockProduct } from '../storeOperations';
type OrderItem = { productId: number; name: string; barcode: string; unit: string; quantity: number; received: number };
type Order = { id: string; supplier: string; location: string; note: string; version: number; createdAt: string; items: OrderItem[] };
type Receipt = { id: string; version: number; restock: boolean; note: string; createdAt: string; items: Pick<OrderItem, 'productId' | 'name' | 'received'>[] };
type Props = { api: string; products: StockProduct[]; onRestock: () => Promise<void> };
const emptyProduct = { name: '', barcode: '', unit: 'ชิ้น', price: '' };
const csvHeader = ['order_id', 'version', 'product_id', 'received', 'product_name', 'ordered', 'remaining'];
const orderExportHeader = [...csvHeader, 'store', 'location'];
const orderCode = (id: string) => `PO-${id.slice(0, 8).toUpperCase()}`;
const complete = (order: Order) => order.items.every((item) => item.received >= item.quantity);
const remaining = (item: OrderItem) => Math.max(0, item.quantity - item.received);

export default function PurchaseOrders({ api, products, onRestock }: Props) {
  const path = `${api}/api/purchase-orders`;
  const [revision, setRevision] = useState(0);
  const { data: orders, error, loading } = useOperationData<Order[]>(path, revision);
  const [selected, setSelected] = useState<Order>();
  const [creating, setCreating] = useState(false);
  const [supplier, setSupplier] = useState('');
  const [location, setLocation] = useState('');
  const [newProduct, setNewProduct] = useState<typeof emptyProduct>();
  const [createdProducts, setCreatedProducts] = useState<StockProduct[]>([]);
  const [orderNote, setOrderNote] = useState('');
  const [search, setSearch] = useState('');
  const [draft, setDraft] = useState<Record<number, string>>({});
  const [received, setReceived] = useState<Record<number, string>>({});
  const [receiveNote, setReceiveNote] = useState('');
  const [restock, setRestock] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [failure, setFailure] = useState('');
  const pendingOrder = useRef<{ key: string; id: string } | null>(null);
  const pendingReceipt = useRef<{ key: string; id: string } | null>(null);
  const importRevision = useRef(0);
  const receipts = useOperationData<Receipt[]>(selected ? `${path}/${selected.id}/receipts` : null, revision);
  const searchTerm = search.trim().toLowerCase();
  const catalog = [...products, ...createdProducts.filter((item) => !products.some((product) => product.id === item.id))];
  const matches = searchTerm ? catalog.filter((item) =>
    item.name.toLowerCase().includes(searchTerm) || item.barcode.toLowerCase().includes(searchTerm)).slice(0, 8) : [];
  const draftProducts = catalog.filter((product) => Object.hasOwn(draft, product.id));
  const orderItems = selected?.items ?? [];
  const invalidReceipt = !orderItems.some((item) => Number(received[item.productId]) > 0) || orderItems.some((item) => {
    const amount = Number(received[item.productId] || 0);
    return !Number.isInteger(amount) || amount < 0 || amount > 1000000;
  });
  const hasOverage = orderItems.some((item) => Number(received[item.productId] || 0) > remaining(item));

  function openOrder(order: Order) {
    importRevision.current += 1;
    setSelected(order);
    setCreating(false);
    setNewProduct(undefined);
    setReceived({});
    setReceiveNote('');
    setRestock(true);
    setNotice('');
    setFailure('');
    setRevision((value) => value + 1);
  }

  async function create(event: FormEvent) {
    event.preventDefault();
    if (busy || !supplier.trim() || !draftProducts.length) return;
    setBusy(true);
    setFailure('');
    const body = {
      supplier, location, note: orderNote,
      items: draftProducts.map((product) => ({ productId: product.id, quantity: Number(draft[product.id]) })),
    };
    const key = JSON.stringify(body);
    if (pendingOrder.current?.key !== key) pendingOrder.current = { key, id: operationId() };
    try {
      const { data } = await axios.post<Order>(path, { ...body, id: pendingOrder.current.id });
      pendingOrder.current = null;
      openOrder(data);
      setDraft({});
      setSupplier('');
      setLocation('');
      setOrderNote('');
      setSearch('');
      setNotice(`สร้างใบสั่งซื้อ ${orderCode(data.id)} แล้ว`);
    } catch (err) {
      setFailure(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  async function createProduct(event: FormEvent) {
    event.preventDefault();
    if (!newProduct || busy || !newProduct.name.trim() || Object.keys(draft).length >= 200) return;
    setBusy(true);
    setFailure('');
    try {
      const { data } = await axios.post<StockProduct>(`${api}/api/products`, {
        ...newProduct, price: Number(newProduct.price || 0), stock: 0, reason: 'สร้างจากใบสั่งซื้อ',
      });
      setCreatedProducts((previous) => [...previous, data]);
      setDraft((previous) => ({ ...previous, [data.id]: '1' }));
      setNewProduct(undefined);
      setNotice(`เพิ่ม ${data.name} ในใบสั่งซื้อแล้ว`);
      await onRestock().catch(() => setFailure('สร้างสินค้าแล้ว กรุณารีเฟรชหากรายการสินค้าในหน้าสต็อกยังไม่อัปเดต'));
    } catch (err) {
      setFailure(axios.isAxiosError(err) && err.response?.status === 409 ? 'บาร์โค้ดนี้มีสินค้าอยู่แล้ว ค้นหาเพื่อเพิ่มจากรายการสินค้าได้เลย' : errorText(err));
    } finally {
      setBusy(false);
    }
  }

  function exportOrder(order: Order) {
    downloadCsv(`${orderCode(order.id)}.csv`, [
      orderExportHeader,
      ...order.items.map((item) => [order.id, order.version, item.productId, '', item.name.replace(/[\r\n]+/g, ' '), item.quantity, remaining(item),
        order.supplier.replace(/[\r\n]+/g, ' '), order.location.replace(/[\r\n]+/g, ' ')]),
    ]);
  }

  async function importOrder(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (!file || !selected) return;
    const attempt = ++importRevision.current;
    setFailure('');
    setNotice('');
    try {
      if (file.size > 256000) throw new Error('ไฟล์มีขนาดเกิน 256 KB');
      const [header, ...lines] = (await file.text()).replace(/^\ufeff/, '').trim().split(/\r?\n/);
      const columnsHeader = header.replaceAll('"', '').trim();
      if (columnsHeader !== csvHeader.join(',') && columnsHeader !== orderExportHeader.join(',')) {
        throw new Error('กรุณาใช้ไฟล์ CSV ที่ดาวน์โหลดจากใบสั่งซื้อนี้');
      }
      const next: Record<number, string> = {};
      for (const line of lines) {
        if (!line.trim()) continue;
        // Import uses the first four fixed columns. The product label may itself contain commas.
        const columns = line.split(',', 4).map((value) => value.trim().replace(/^"(.*)"$/, '$1'));
        const [id, version, productId, quantity] = columns;
        if (columns.length !== 4 || id !== selected.id || version !== String(selected.version)) {
          throw new Error('ไฟล์ไม่ตรงกับใบสั่งซื้อหรือรอบปัจจุบัน กรุณาดาวน์โหลดใหม่');
        }
        const item = selected.items.find((entry) => String(entry.productId) === productId);
        if (!item || Object.hasOwn(next, item.productId) || !/^\d*$/.test(quantity) || Number(quantity) > 1000000) {
          throw new Error('ตรวจรหัสสินค้าและจำนวนในคอลัมน์ received');
        }
        next[item.productId] = quantity;
      }
      if (Object.keys(next).length !== selected.items.length) throw new Error('รายการสินค้าในไฟล์ไม่ครบ');
      if (attempt !== importRevision.current) return;
      setReceived(next);
      setNotice('นำเข้าจำนวนแล้ว ตรวจยอดก่อนกดบันทึก');
    } catch (err) {
      if (attempt === importRevision.current) {
        setFailure(err instanceof Error ? err.message : 'อ่านไฟล์ไม่สำเร็จ');
      }
    }
  }

  async function receive(event: FormEvent) {
    event.preventDefault();
    if (!selected || busy || invalidReceipt || (hasOverage && !receiveNote.trim())) return;
    importRevision.current += 1;
    setBusy(true);
    setNotice('');
    setFailure('');
    const body = {
      version: selected.version, restock, note: receiveNote,
      items: selected.items.map((item) => ({ productId: item.productId, received: Number(received[item.productId] || 0) })),
    };
    const key = JSON.stringify([selected.id, body]);
    if (pendingReceipt.current?.key !== key) pendingReceipt.current = { key, id: operationId() };
    try {
      const { data } = await axios.post<Order>(`${path}/${selected.id}/receipts`, { ...body, id: pendingReceipt.current.id });
      pendingReceipt.current = null;
      openOrder(data);
      setNotice(restock ? 'บันทึกรับของและเพิ่มสต็อกแล้ว' : 'บันทึกยอดรับแล้ว');
      if (restock) await onRestock().catch(() => setFailure('บันทึกแล้ว แต่โหลดจำนวนสต็อกล่าสุดไม่สำเร็จ'));
    } catch (err) {
      setFailure(errorText(err));
      setRevision((value) => value + 1);
    } finally {
      setBusy(false);
    }
  }

  return <div className="operation-page">
    {(failure || error) && <p className="operation-feedback error" role="alert">{failure || error}</p>}
    {notice && <p className="operation-feedback success" role="status">{notice}</p>}
    <section className="panel operation-panel">
      <div className="operation-title-row">
        <div className="operation-heading"><span className="material-symbols-outlined" aria-hidden="true">local_shipping</span><div><h2>ใบสั่งซื้อสินค้า</h2><p>ติดตามยอดที่สั่ง ยอดรับจริง และยอดคงค้าง</p></div></div>
        <div className="operation-actions"><button type="button" className="secondary-action" disabled={busy || loading} onClick={() => setRevision((value) => value + 1)}>รีเฟรช</button><button type="button" className="primary-action" disabled={busy} onClick={() => { importRevision.current += 1; setSelected(undefined); setCreating(true); setNotice(''); setFailure(''); }}><span className="material-symbols-outlined" aria-hidden="true">add</span> สร้างใบสั่งซื้อ</button></div>
      </div>
      {creating && <>
        <div className="operation-actions"><button className="secondary-action" type="button" disabled={busy || Boolean(newProduct) || Object.keys(draft).length >= 200} onClick={() => setNewProduct(emptyProduct)}>＋ สร้างสินค้าใหม่</button></div>
        {newProduct && <form className="order-editor" onSubmit={createProduct}>
          <fieldset className="operation-fields" disabled={busy}>
            <div className="operation-form-grid">
              <label className="field"><span>ชื่อสินค้า</span><input autoFocus required maxLength={120} value={newProduct.name} onChange={(event) => setNewProduct({ ...newProduct, name: event.target.value })} /></label>
              <label className="field"><span>บาร์โค้ด (กรอกทีหลังได้)</span><input maxLength={100} value={newProduct.barcode} onChange={(event) => setNewProduct({ ...newProduct, barcode: event.target.value })} /></label>
              <label className="field"><span>หน่วย</span><input maxLength={30} value={newProduct.unit} onChange={(event) => setNewProduct({ ...newProduct, unit: event.target.value })} /></label>
              <label className="field"><span>ราคาขาย (กรอกทีหลังได้)</span><input type="number" min="0" max="9999999999.99" step="0.01" value={newProduct.price} onChange={(event) => setNewProduct({ ...newProduct, price: event.target.value })} /></label>
            </div>
            <div className="operation-actions"><button className="primary-action" type="submit">สร้างและเพิ่มในใบสั่งซื้อ</button><button className="secondary-action" type="button" onClick={() => setNewProduct(undefined)}>ยกเลิก</button></div>
          </fieldset>
        </form>}
        <form className="order-editor" onSubmit={create}>
        <fieldset className="operation-fields" disabled={busy}>
          <div className="operation-form-grid">
            <label className="field"><span>ชื่อร้าน</span><input required maxLength={120} value={supplier} onChange={(event) => setSupplier(event.target.value)} /></label>
            <label className="field"><span>สถานที่ / สาขา</span><input maxLength={180} value={location} onChange={(event) => setLocation(event.target.value)} /></label>
          </div>
          <label className="field"><span>หมายเหตุ</span><input maxLength={250} value={orderNote} onChange={(event) => setOrderNote(event.target.value)} /></label>
          <label className="field"><span>เพิ่มสินค้าจากรายการที่มี</span><input placeholder="ค้นหาชื่อสินค้า หรือบาร์โค้ด" value={search} onChange={(event) => setSearch(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') event.preventDefault(); }} /></label>
          {searchTerm && <div className="order-search-results">{matches.length ? matches.map((item) => <button type="button" className="secondary-action" key={item.id} disabled={Object.hasOwn(draft, item.id) || Object.keys(draft).length >= 200} onClick={() => { setDraft({ ...draft, [item.id]: '1' }); setSearch(''); }}>{item.name} · {item.barcode} · เหลือ {item.stock}</button>) : <p>ไม่พบสินค้าที่ตรงกับคำค้น</p>}</div>}
          {draftProducts.length > 0 && <div className="operation-table"><table><thead><tr><th>สินค้า</th><th>จำนวนสั่ง</th><th></th></tr></thead><tbody>{draftProducts.map((item) => <tr key={item.id}>
            <td>{item.name}<small>{item.barcode} · {item.unit}</small></td><td><input className="operation-quantity" aria-label={`จำนวนสั่ง ${item.name}`} required type="number" min="1" max="1000000" value={draft[item.id]} onChange={(event) => setDraft({ ...draft, [item.id]: event.target.value })} /></td>
            <td><button type="button" className="text-action" onClick={() => { const next = { ...draft }; delete next[item.id]; setDraft(next); }}>เอาออก</button></td>
          </tr>)}</tbody></table></div>}
          <div className="operation-actions"><button className="primary-action" type="submit" disabled={!draftProducts.length || !supplier.trim() || Boolean(newProduct)}>บันทึกใบสั่งซื้อ</button><button className="secondary-action" type="button" onClick={() => { setNewProduct(undefined); setCreating(false); }}>ปิดฟอร์ม</button></div>
        </fieldset>
      </form></>}
      {orders?.length ? <div className="operation-table"><table><thead><tr><th>ใบสั่งซื้อ</th><th>ร้าน / สถานที่</th><th>สร้างเมื่อ</th><th>สถานะ</th><th></th></tr></thead>
        <tbody>{orders.map((order) => <tr key={order.id} className={selected?.id === order.id ? 'operation-selected' : ''}>
          <td><strong>{orderCode(order.id)}</strong><small>{order.items.length} รายการสินค้า</small></td><td>{order.supplier}{order.location && <small>{order.location}</small>}</td><td>{dateTime(order.createdAt)}</td>
          <td><span className={`badge ${complete(order) ? 'success' : 'warning'}`}>{complete(order) ? 'รับครบ' : order.version ? 'รับบางส่วน' : 'รอรับของ'}</span></td>
          <td><button className="secondary-action" type="button" disabled={busy} onClick={() => openOrder(order)}>{selected?.id === order.id && selected.version !== order.version ? 'เปิดฉบับล่าสุด' : 'เปิดใบสั่งซื้อ'}</button></td>
        </tr>)}</tbody>
      </table></div> : <p className="operation-empty">{loading ? 'กำลังโหลดใบสั่งซื้อ…' : 'ยังไม่มีใบสั่งซื้อ'}</p>}
    </section>
    {selected && <section className="panel operation-panel">
      <div className="operation-title-row"><div><h2>{orderCode(selected.id)} · {selected.supplier}</h2>{selected.location && <p>{selected.location}</p>}{selected.note && <p>{selected.note}</p>}</div><button className="secondary-action" type="button" onClick={() => exportOrder(selected)}>ดาวน์โหลด CSV</button></div>
      <form onSubmit={receive}>
        <fieldset className="operation-fields" disabled={busy}>
          {!complete(selected) && <div className="operation-import"><div><strong>นำใบสั่งซื้อกลับเข้าระบบ</strong><p>กรอกจำนวนรับรอบนี้ในคอลัมน์ received แล้วบันทึกเป็น CSV</p></div><input aria-label="นำเข้าใบสั่งซื้อ CSV" type="file" accept=".csv,text/csv" onChange={(event) => void importOrder(event)} /></div>}
          <div className="operation-table"><table><thead><tr><th>สินค้า</th><th>สั่ง</th><th>รับสะสม</th><th>ค้างก่อนรอบนี้</th>{!complete(selected) && <th>รับรอบนี้</th>}</tr></thead>
            <tbody>{selected.items.map((item) => <tr key={item.productId}><td>{item.name}<small>{item.barcode} · {item.unit}</small></td><td>{item.quantity}</td><td>{item.received}{item.received > item.quantity && <small>เกิน {item.received - item.quantity}</small>}</td><td>{remaining(item)}</td>
              {!complete(selected) && <td><input className="operation-quantity" aria-label={`จำนวนรับ ${item.name}`} type="number" min="0" max="1000000" placeholder="0" value={received[item.productId] ?? ''} onChange={(event) => { importRevision.current += 1; setReceived({ ...received, [item.productId]: event.target.value }); }} /></td>}
            </tr>)}</tbody>
          </table></div>
          {!complete(selected) && <>
            <button type="button" className="secondary-action" onClick={() => { importRevision.current += 1; setReceived(Object.fromEntries(selected.items.map((item) => [item.productId, String(remaining(item))]))); }}>กรอกว่ารับครบ</button>
            {hasOverage && <p className="operation-feedback">มีสินค้ารับเกินจำนวนสั่ง กรุณาระบุเหตุผล</p>}
            <label className="field"><span>หมายเหตุรับของ / เลขใบส่งของ</span><input required={hasOverage} maxLength={250} value={receiveNote} onChange={(event) => setReceiveNote(event.target.value)} /></label>
            <label className="operation-checkbox"><input type="checkbox" checked={restock} onChange={(event) => setRestock(event.target.checked)} /> เพิ่มยอดรับรอบนี้เข้าสต็อก</label>
            {!restock && <p className="operation-feedback">ยอดรับจะถูกนับในใบสั่งซื้อ คงเหลือสินค้าในร้านจะเท่าเดิม</p>}
            <button className="primary-action" type="submit" disabled={invalidReceipt || (hasOverage && !receiveNote.trim())}>{restock ? 'บันทึกรับของและเพิ่มสต็อก' : 'บันทึกยอดรับอย่างเดียว'}</button>
          </>}
        </fieldset>
      </form>
      <h3>ประวัติรับของ</h3>
      {receipts.error && <p className="operation-feedback error" role="alert">{receipts.error}</p>}
      {receipts.data?.length ? <ul className="receipt-records">{receipts.data.map((receipt) => <li key={receipt.id}><strong>รอบ {receipt.version} · {dateTime(receipt.createdAt)}</strong><span>{receipt.restock ? 'เพิ่มสต็อกแล้ว' : 'บันทึกยอดรับ'} · {receipt.items.filter((item) => item.received).map((item) => `${item.name} × ${item.received}`).join(', ')}</span>{receipt.note && <small>{receipt.note}</small>}</li>)}</ul> : <p className="operation-empty">{receipts.loading ? 'กำลังโหลด…' : 'ยังไม่มีประวัติรับของ'}</p>}
    </section>}
  </div>;
}
