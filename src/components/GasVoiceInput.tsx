import { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import type { GasVoiceDraft } from '../gasVoice';

interface SpeechResult {
  isFinal: boolean;
  0: { transcript: string };
}

interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: { results: ArrayLike<SpeechResult> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

type RecognitionConstructor = new () => Recognition;
type VoiceResult = { ok: boolean; message: string };

interface GasVoiceInputProps {
  api: string;
  active?: boolean;
  onApply: (text: string, draft?: GasVoiceDraft) => VoiceResult;
  onBusyChange: (busy: boolean) => void;
}

function recognitionConstructor() {
  const speechWindow = window as Window & {
    SpeechRecognition?: RecognitionConstructor;
    webkitSpeechRecognition?: RecognitionConstructor;
  };
  return speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
}

const errorMessages: Record<string, string> = {
  'not-allowed': 'ยังไม่ได้อนุญาตไมโครโฟน เปิดสิทธิ์ไมค์ในการตั้งค่าเว็บไซต์ หรือพิมพ์ข้อความด้านล่าง',
  'service-not-allowed': 'เบราว์เซอร์ไม่อนุญาตบริการเสียง ลองใช้ไมค์บนคีย์บอร์ดแทน',
  'audio-capture': 'ไม่พบไมโครโฟน ตรวจการเชื่อมต่อไมค์แล้วลองใหม่',
  'no-speech': 'ยังไม่ได้ยินเสียง แตะพูดอีกครั้ง หรือพิมพ์ข้อความด้านล่าง',
  network: 'บริการเสียงเชื่อมต่อไม่ได้ ตรวจอินเทอร์เน็ตแล้วลองใหม่ หรือพิมพ์ข้อความด้านล่าง',
  'language-not-supported': 'บริการเสียงนี้ไม่รองรับภาษาไทย ลองใช้ไมค์บนคีย์บอร์ดแทน',
  aborted: 'หยุดฟังแล้ว ฟอร์มยังไม่เปลี่ยน',
};

export default function GasVoiceInput({ api, active = true, onApply, onBusyChange }: GasVoiceInputProps) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [feedback, setFeedback] = useState<VoiceResult | null>(null);
  const [useAI, setUseAI] = useState(false);
  const [interpreting, setInterpreting] = useState(false);
  const requestRef = useRef<AbortController | null>(null);
  const recognitionRef = useRef<Recognition | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const finalTextRef = useRef('');
  const failedRef = useRef(false);
  const applyRef = useRef(onApply);
  const busyChangeRef = useRef(onBusyChange);
  const supported = Boolean(recognitionConstructor());
  const secure = window.isSecureContext;
  const locked = busy || interpreting;

  useEffect(() => { applyRef.current = onApply; }, [onApply]);
  useEffect(() => { busyChangeRef.current = onBusyChange; }, [onBusyChange]);
  useEffect(() => {
    if (!active) return;
    let disposed = false;
    let pending: AbortController | null = null;
    async function check() {
      if (disposed || pending || document.visibilityState === 'hidden') return;
      const controller = new AbortController(); pending = controller;
      try {
        const { data } = await axios.get<{ enabled: boolean; provider: string }>(`${api}/api/gas/voice/status`, { signal: controller.signal, timeout: 2500 });
        if (!disposed && !controller.signal.aborted) setUseAI(data.enabled === true && data.provider === 'local');
      } catch { if (!disposed && !controller.signal.aborted) setUseAI(false); }
      finally { if (pending === controller) pending = null; }
    }
    void check();
    const timer = window.setInterval(() => void check(), 3000);
    document.addEventListener('visibilitychange', check);
    return () => { disposed = true; pending?.abort(); window.clearInterval(timer); document.removeEventListener('visibilitychange', check); };
  }, [api, active]);

  useEffect(() => {
    if (!active) return;
    function release() {
      requestRef.current?.abort();
      requestRef.current = null;
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = null;
      const recognition = recognitionRef.current;
      recognitionRef.current = null;
      if (recognition) {
        recognition.onresult = null;
        recognition.onerror = null;
        recognition.onend = null;
        try { recognition.abort(); } catch { /* Already ended. */ }
      }
      busyChangeRef.current(false);
    }
    function hide() {
      if (document.visibilityState === 'hidden' && (recognitionRef.current || requestRef.current)) {
        release();
        setBusy(false);
        setStopping(false);
        setInterpreting(false);
        setFeedback({ ok: false, message: 'หยุดฟังเมื่อออกจากหน้านี้ ฟอร์มยังไม่เปลี่ยน' });
      }
    }
    document.addEventListener('visibilitychange', hide);
    window.addEventListener('pagehide', release);
    return () => {
      document.removeEventListener('visibilitychange', hide);
      window.removeEventListener('pagehide', release);
      const wasBusy = Boolean(recognitionRef.current || requestRef.current);
      release();
      if (wasBusy) {
        setBusy(false);
        setStopping(false);
        setInterpreting(false);
        setFeedback({ ok: false, message: 'หยุดฟังเมื่อออกจากหน้านี้ ฟอร์มยังไม่เปลี่ยน' });
      }
    };
  }, [active]);

  async function interpretAndApply(raw: string) {
    if (requestRef.current) return;
    if (!useAI) {
      setFeedback(applyRef.current(raw));
      return;
    }
    const controller = new AbortController();
    requestRef.current = controller;
    setInterpreting(true);
    setFeedback(null);
    busyChangeRef.current(true);
    try {
      const { data } = await axios.post<{ source: string; draft: GasVoiceDraft }>(`${api}/api/gas/voice/parse`, { text: raw }, { signal: controller.signal, timeout: 6500 });
      if (controller.signal.aborted || requestRef.current !== controller) return;
      if (data.source !== 'local' || !data.draft || !Array.isArray(data.draft.items) || !Array.isArray(data.draft.errors) || !Array.isArray(data.draft.notes)) throw new Error('Invalid interpretation');
      const result = applyRef.current(raw, data.draft);
      setFeedback({ ...result, message: `AI ในคอมช่วยแยกข้อความ · ${result.message}` });
    } catch {
      if (controller.signal.aborted || requestRef.current !== controller) return;
      setUseAI(false);
      const result = applyRef.current(raw);
      setFeedback({ ...result, message: `AI ในคอมยังไม่พร้อม ใช้การแยกคำพื้นฐาน · ${result.message}` });
    } finally {
      if (requestRef.current === controller) {
        requestRef.current = null;
        setInterpreting(false);
        busyChangeRef.current(false);
      }
    }
  }

  function cancelInterpretation() {
    requestRef.current?.abort();
    requestRef.current = null;
    setInterpreting(false);
    busyChangeRef.current(false);
    setFeedback({ ok: false, message: 'ยกเลิกการแยกข้อความแล้ว ฟอร์มยังไม่เปลี่ยน' });
  }

  function finishBusy() {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    recognitionRef.current = null;
    setBusy(false);
    setStopping(false);
    busyChangeRef.current(false);
  }

  function cancel() {
    const recognition = recognitionRef.current;
    if (recognition) {
      recognition.onresult = null;
      recognition.onerror = null;
      recognition.onend = null;
      try { recognition.abort(); } catch { /* Already ended. */ }
    }
    finishBusy();
    setFeedback({ ok: false, message: 'ยกเลิกการฟังแล้ว ฟอร์มยังไม่เปลี่ยน' });
  }

  function stop() {
    const recognition = recognitionRef.current;
    if (!recognition) return;
    setStopping(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    // Some devices do not emit onend after a service failure.
    timerRef.current = setTimeout(() => {
      cancel();
      setFeedback({ ok: false, message: 'บริการเสียงไม่ตอบกลับ ลองใหม่ หรือแก้ข้อความแล้วกดกรอกฟอร์ม' });
    }, 5000);
    try { recognition.stop(); } catch { cancel(); }
  }

  function start() {
    const Constructor = recognitionConstructor();
    if (!Constructor || !secure || recognitionRef.current) return;
    let recognition: Recognition;
    try { recognition = new Constructor(); } catch {
      setFeedback({ ok: false, message: 'เปิดบริการเสียงไม่ได้ ลองใช้ไมค์บนคีย์บอร์ดหรือพิมพ์ข้อความด้านล่าง' });
      return;
    }
    recognitionRef.current = recognition;
    finalTextRef.current = '';
    failedRef.current = false;
    setText('');
    setFeedback(null);
    setBusy(true);
    setStopping(false);
    busyChangeRef.current(true);
    recognition.lang = 'th-TH';
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.onresult = (event) => {
      if (recognitionRef.current !== recognition) return;
      const final: string[] = [];
      const interim: string[] = [];
      for (let i = 0; i < event.results.length; i++) {
        const result = event.results[i];
        (result.isFinal ? final : interim).push(result[0].transcript);
      }
      finalTextRef.current = final.join(' ').trim();
      setText([...final, ...interim].join(' ').trim());
    };
    recognition.onerror = (event) => {
      if (recognitionRef.current !== recognition) return;
      failedRef.current = true;
      setFeedback({ ok: false, message: errorMessages[event.error] ?? 'ฟังเสียงไม่สำเร็จ ลองใหม่ หรือพิมพ์ข้อความด้านล่าง' });
      recognition.onresult = null;
      recognition.onend = null;
      recognition.onerror = null;
      try { recognition.abort(); } catch { /* Already ended. */ }
      finishBusy();
    };
    recognition.onend = () => {
      if (recognitionRef.current !== recognition) return;
      finishBusy();
      if (!failedRef.current && finalTextRef.current) {
        setText(finalTextRef.current);
        void interpretAndApply(finalTextRef.current);
      } else if (!failedRef.current) {
        setFeedback({ ok: false, message: 'ยังฟังไม่ครบ ลองพูดอีกครั้ง หรือแก้ข้อความแล้วกดกรอกฟอร์ม' });
      }
    };
    try {
      recognition.start();
      timerRef.current = setTimeout(stop, 25000);
    } catch {
      cancel();
      setFeedback({ ok: false, message: 'เริ่มฟังไม่ได้ ตรวจสิทธิ์ไมค์แล้วลองใหม่ หรือพิมพ์ข้อความด้านล่าง' });
    }
  }

  return (
    <section className="panel gas-voice-panel" aria-label="พูดรับออร์เดอร์แก๊ส" hidden={!active}>
      <div className="gas-voice-controls">
        <div className="gas-voice-actions">
          <button type="button" className={busy ? 'gas-voice-record recording' : 'gas-voice-record'}
            disabled={!supported || !secure || stopping || interpreting} aria-pressed={busy} onClick={busy ? stop : start}>
            <span className="material-symbols-outlined" aria-hidden="true">{busy ? 'stop_circle' : 'mic'}</span>
            {stopping ? 'กำลังแปลงเสียง…' : busy ? 'พูดเสร็จแล้ว' : 'แตะเพื่อพูด'}
          </button>
          {busy && <button type="button" className="secondary-action" onClick={cancel}>ยกเลิกการฟัง</button>}
        </div>
        <p className="gas-voice-example"><span>ตัวอย่าง</span> ปตท. ถังใหญ่ 2 ถัง ถังเล็ก 1 ถัง ส่งที่หลังวัด</p>
      </div>
      <div className="gas-voice-result">
        <span className="gas-voice-label">ผลลัพธ์</span>
        <div className="gas-voice-result-row">
          <textarea aria-label="ข้อความที่พูด · แก้ไขหรือพิมพ์เองได้" value={text} disabled={locked} rows={1}
            onChange={(event) => { setText(event.target.value); setFeedback(null); }} placeholder="ข้อความที่พูดจะแสดงที่นี่ · แก้ไขได้" />
          {interpreting ? <button type="button" className="secondary-action" onClick={cancelInterpretation}>ยกเลิกการแยกข้อความ</button> :
            text.trim() && <button type="button" className="secondary-action" aria-label="กรอกฟอร์มจากข้อความ" disabled={locked} onClick={() => void interpretAndApply(text)}>กรอกฟอร์ม</button>}
        </div>
        {(busy || interpreting || feedback) && <p role="status" aria-live="polite" className={feedback?.ok ? 'gas-voice-feedback success' : 'gas-voice-feedback'}>
          {interpreting ? 'กำลังแยกออร์เดอร์…' : busy ? stopping ? 'รอข้อความจากบริการเสียง…' : 'กำลังฟัง…' : feedback?.message}
        </p>}
      </div>
      {(!supported || !secure) && <p className="gas-voice-hint">{!secure ? 'เปิดผ่าน HTTPS เพื่อใช้ไมค์บนหน้าเว็บ' : 'เบราว์เซอร์นี้ยังใช้ปุ่มพูดไม่ได้'} · แตะช่องข้อความแล้วใช้ไมค์บนคีย์บอร์ดแทนได้ จากนั้นกดกรอกฟอร์ม</p>}
      <small className={`gas-voice-parser-status ${useAI ? 'online' : ''}`}
        title="เสียงประมวลผลผ่านบริการของเบราว์เซอร์ · ร้านไม่บันทึกไฟล์เสียง · เมื่อ AI พร้อม ข้อความออร์เดอร์จะส่งให้คอมที่เชื่อมกับร้านช่วยแยก">
        <span aria-hidden="true" />ตัวแยกข้อความ: {useAI ? 'AI ในคอมพร้อม' : 'rules · ใช้งานได้'}
      </small>
    </section>
  );
}
