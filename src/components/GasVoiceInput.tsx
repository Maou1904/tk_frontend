import { useEffect, useRef, useState } from 'react';

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
  onApply: (text: string) => VoiceResult;
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

export default function GasVoiceInput({ onApply, onBusyChange }: GasVoiceInputProps) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [feedback, setFeedback] = useState<VoiceResult | null>(null);
  const recognitionRef = useRef<Recognition | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const finalTextRef = useRef('');
  const failedRef = useRef(false);
  const applyRef = useRef(onApply);
  const busyChangeRef = useRef(onBusyChange);
  const supported = Boolean(recognitionConstructor());
  const secure = window.isSecureContext;

  useEffect(() => { applyRef.current = onApply; }, [onApply]);
  useEffect(() => { busyChangeRef.current = onBusyChange; }, [onBusyChange]);

  useEffect(() => {
    function release() {
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
      if (document.visibilityState === 'hidden' && recognitionRef.current) {
        release();
        setBusy(false);
        setStopping(false);
        setFeedback({ ok: false, message: 'หยุดฟังเมื่อออกจากหน้านี้ ฟอร์มยังไม่เปลี่ยน' });
      }
    }
    document.addEventListener('visibilitychange', hide);
    window.addEventListener('pagehide', release);
    return () => {
      document.removeEventListener('visibilitychange', hide);
      window.removeEventListener('pagehide', release);
      release();
    };
  }, []);

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
        setFeedback(applyRef.current(finalTextRef.current));
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
    <section className="panel gas-voice-panel" aria-labelledby="gas-voice-title">
      <div className="gas-voice-heading">
        <div>
          <h3 id="gas-voice-title">พูดรับออร์เดอร์แก๊ส <span>ทดลอง</span></h3>
          <p>“ปตท. ถังใหญ่ 2 ถัง ถังเล็ก 1 ถัง ส่งที่หลังวัด”</p>
          <small>พูดครั้งเดียวเพื่อกรอกฟอร์ม แล้วตรวจข้อมูลก่อนทำรายการ</small>
        </div>
        <div className="gas-voice-actions">
          <button type="button" className={busy ? 'gas-voice-record recording' : 'gas-voice-record'}
            disabled={!supported || !secure || stopping} aria-pressed={busy} onClick={busy ? stop : start}>
            <span className="material-symbols-outlined" aria-hidden="true">{busy ? 'stop_circle' : 'mic'}</span>
            {stopping ? 'กำลังแปลงเสียง…' : busy ? 'พูดเสร็จแล้ว' : 'แตะเพื่อพูด'}
          </button>
          {busy && <button type="button" className="secondary-action" onClick={cancel}>ยกเลิกการฟัง</button>}
        </div>
      </div>
      <label className="field">
        <span>ข้อความที่พูด · แก้ไขหรือพิมพ์เองได้</span>
        <textarea value={text} disabled={busy} rows={2} onChange={(event) => { setText(event.target.value); setFeedback(null); }}
          placeholder="ปตท. ถังใหญ่ 2 ถัง ถังเล็ก 1 ถัง ส่งที่หลังวัด" />
      </label>
      <div className="gas-voice-footer">
        <p role="status" aria-live="polite" className={feedback?.ok ? 'gas-voice-feedback success' : 'gas-voice-feedback'}>
          {busy ? stopping ? 'รอข้อความจากบริการเสียง…' : 'กำลังฟัง… พูดยี่ห้อ ขนาด จำนวน และจุดส่ง' : feedback?.message ?? 'บอกได้หลายขนาด · ถังใหญ่ = 15 กก. · ถังเล็ก = 4 กก. · ไม่บอกจำนวน = ขนาดละ 1 ถัง'}
        </p>
        <button type="button" className="secondary-action" disabled={busy || !text.trim()} onClick={() => setFeedback(onApply(text))}>กรอกฟอร์มจากข้อความ</button>
      </div>
      {(!supported || !secure) && <p className="gas-voice-hint">{!secure ? 'เปิดผ่าน HTTPS เพื่อใช้ไมค์บนหน้าเว็บ' : 'เบราว์เซอร์นี้ยังใช้ปุ่มพูดไม่ได้'} · แตะช่องข้อความแล้วใช้ไมค์บนคีย์บอร์ดแทนได้ จากนั้นกดกรอกฟอร์ม</p>}
      <small className="gas-voice-privacy">เสียงประมวลผลผ่านบริการของเบราว์เซอร์ ซึ่งอาจส่งเสียงไปยังผู้ให้บริการ · ร้านไม่บันทึกไฟล์เสียง</small>
    </section>
  );
}
