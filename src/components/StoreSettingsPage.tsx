import { useState } from 'react';
import type { FormEvent } from 'react';
import axios from 'axios';
import { bahtInput, errorText, parseMoney, useOperationData } from '../storeOperations';
import type { StoreSettings } from '../storeOperations';

const fields = [
  ['defaultFee', 'ค่าบริการรับโอนต่อรายการ'],
  ['electricityFee', 'ค่าบริการจ่ายค่าไฟต่อรายการ'],
  ['gasDeliveryFee', 'ค่าจัดส่งแก๊สเริ่มต้น'],
  ['topupAmount', 'ยอดเติมเงินมือถือเริ่มต้น'],
] as const;

export default function StoreSettingsPage({ api, onSave, onChangePassword, onManageUsers }: {
  api: string; onSave: (settings: StoreSettings) => void;
  onChangePassword: () => void; onManageUsers: () => void;
}) {
  const path = `${api}/api/store-settings`;
  const [revision, setRevision] = useState(0);
  const { data, error, loading } = useOperationData<StoreSettings>(path, revision);
  const [draft, setDraft] = useState<Partial<Record<keyof StoreSettings, string>>>({});
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<StoreSettings>();
  const [feedback, setFeedback] = useState('');
  const current = saved ?? data;
  const value = (key: keyof StoreSettings) => draft[key] ?? (current ? bahtInput(current[key] ?? 0) : '');

  async function save(event: FormEvent) {
    event.preventDefault();
    const electricityFee = parseMoney(value('electricityFee'));
    const defaultFee = parseMoney(value('defaultFee'));
    const gasDeliveryFee = parseMoney(value('gasDeliveryFee'));
    const topupAmount = parseMoney(value('topupAmount'));
    if (busy || !current) return;
    if (electricityFee === null || defaultFee === null || gasDeliveryFee === null || !topupAmount) {
      setFeedback('ตรวจจำนวนเงินอีกครั้ง ยอดเติมเงินเริ่มต้นต้องมากกว่าศูนย์');
      return;
    }
    setBusy(true);
    setFeedback('');
    try {
      const response = await axios.put<StoreSettings>(path, { defaultFee, electricityFee, gasDeliveryFee, topupAmount });
      setSaved(response.data);
      setDraft({});
      onSave(response.data);
    } catch (err) {
      setFeedback(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return <div className="operation-page">
    <section className="panel operation-panel">
      <div className="operation-heading">
        <span className="material-symbols-outlined" aria-hidden="true">manage_accounts</span>
        <div><h2>บัญชีและรหัสผ่าน</h2><p>เปลี่ยนรหัสของตัวเอง หรือตั้งรหัสใหม่ให้บัญชีที่ลืมรหัสด้วยสิทธิ์เจ้าของร้าน</p></div>
      </div>
      <div className="operation-actions">
        <button type="button" className="secondary-action" onClick={onChangePassword}>เปลี่ยนรหัสผ่านของฉัน</button>
        <button type="button" className="primary-action" onClick={onManageUsers}>จัดการบัญชีและรหัสผ่าน</button>
      </div>
    </section>
    <form className="panel operation-panel" onSubmit={save}>
      <div className="operation-heading">
        <span className="material-symbols-outlined" aria-hidden="true">tune</span>
        <div><h2>ค่าเริ่มต้นหน้าร้าน</h2><p>ระบบกรอกค่าเหล่านี้ให้เมื่อเริ่มรายการใหม่ แก้ได้ในแต่ละรายการ</p></div>
      </div>
      {error && <p className="operation-feedback error" role="alert">{error} <button type="button" className="text-action" onClick={() => setRevision(revision + 1)}>ลองอีกครั้ง</button></p>}
      {loading && <p role="status">กำลังโหลดการตั้งค่า…</p>}
      <fieldset className="operation-fields" disabled={!current || busy}>
        <div className="operation-settings-grid">
          {fields.map(([key, label]) => <label key={key} className="field">
            <span>{label} (บาท)</span>
            <input required inputMode="decimal" value={value(key)} onChange={(event) => setDraft({ ...draft, [key]: event.target.value })} />
          </label>)}
        </div>
        <div className="operation-actions"><button type="submit" className="primary-action" disabled={!Object.keys(draft).length}>บันทึกการตั้งค่า</button></div>
      </fieldset>
      {feedback && <div className="operation-feedback error" role="alert">{feedback}</div>}
      {saved && !feedback && !Object.keys(draft).length && <div className="operation-feedback success" role="status">บันทึกการตั้งค่าแล้ว</div>}
    </form>
  </div>;
}
