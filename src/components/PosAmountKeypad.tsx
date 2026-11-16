import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';

const denominations = [1, 5, 10, 20, 50, 100, 500, 1000];
const digits = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];
const bahtFormatter = new Intl.NumberFormat('th-TH');

interface PosAmountKeypadProps {
  label: string;
  value: number;
  onConfirm: (amount: number) => void;
  onCancel: () => void;
}

export default function PosAmountKeypad({ label, value, onConfirm, onCancel }: PosAmountKeypadProps) {
  const initialAmount = Math.round(value * 100);
  const [baht, setBaht] = useState(String(Math.floor(initialAmount / 100)));
  const [satang, setSatang] = useState(String(initialAmount % 100).padStart(2, '0'));
  const [unit, setUnit] = useState<'baht' | 'satang'>('baht');
  const [replace, setReplace] = useState(true);
  const amountButton = useRef<HTMLButtonElement>(null);
  const amount = (Number(baht) * 100 + Number(satang.padEnd(2, '0'))) / 100;

  useEffect(() => amountButton.current?.focus(), []);

  function selectUnit(nextUnit: typeof unit) {
    setUnit(nextUnit);
    setReplace(true);
  }

  function enterDigit(digit: string) {
    if (unit === 'baht') {
      if (replace) setSatang('');
      setBaht(String(Number(replace ? digit : `${baht}${digit}`)).slice(0, 10));
    } else {
      setSatang((replace ? digit : `${satang}${digit}`).slice(0, 2));
    }
    setReplace(false);
  }

  function backspace() {
    if (unit === 'baht') setBaht(baht.slice(0, -1));
    else setSatang(satang.slice(0, -1));
    setReplace(false);
  }

  function clear() {
    setBaht('');
    setSatang('');
    selectUnit('baht');
  }

  function addDenomination(denomination: number) {
    setBaht(String(Math.min(9_999_999_999, Number(baht) + denomination)));
    setUnit('baht');
    setReplace(false);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (/^[0-9]$/.test(event.key)) {
      event.preventDefault();
      enterDigit(event.key);
    } else if (event.key === 'Backspace') {
      event.preventDefault();
      backspace();
    }
  }

  return (
    <form className="pos-keypad" onKeyDown={handleKeyDown} onSubmit={(event) => {
      event.preventDefault();
      onConfirm(amount);
    }}>
      <div className="pos-keypad-body">
        <div className="pos-keypad-amounts">
          <h3>{label}</h3>
          <div className="pos-keypad-display" aria-label={label} role="group">
            <button type="button" ref={amountButton} aria-pressed={unit === 'baht'} onClick={() => selectUnit('baht')}>
              <strong>{bahtFormatter.format(Number(baht))}</strong><span>บาท</span>
            </button>
            <button type="button" aria-pressed={unit === 'satang'} onClick={() => selectUnit('satang')}>
              <strong>{satang.padEnd(2, '0')}</strong><span>สตางค์</span>
            </button>
          </div>
          <div className="pos-denominations" aria-label="บวกจำนวนเงิน" role="group">
            {denominations.map((denomination) => (
              <button type="button" key={denomination} onClick={() => addDenomination(denomination)}>
                +{bahtFormatter.format(denomination)}
              </button>
            ))}
          </div>
        </div>

        <div className="pos-number-keys" aria-label="แป้นตัวเลข" role="group">
          {digits.map((digit) => <button type="button" key={digit} onClick={() => enterDigit(digit)}>{digit}</button>)}
          <button type="button" className="pos-key-edit" onClick={clear}>ล้าง</button>
          <button type="button" onClick={() => enterDigit('0')}>0</button>
          <button type="button" className="pos-key-edit" aria-label="ลบตัวเลขล่าสุด" onClick={backspace}>
            <span className="material-symbols-outlined" aria-hidden="true">backspace</span>
          </button>
        </div>
      </div>

      <div className="pos-checkout-actions">
        <button type="button" className="secondary-action" onClick={onCancel}>ยกเลิก</button>
        <button type="submit" className="primary-action">ใช้จำนวนนี้</button>
      </div>
    </form>
  );
}
