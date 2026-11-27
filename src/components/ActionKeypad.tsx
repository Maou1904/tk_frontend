import { useRef } from 'react';
import type { ReactNode } from 'react';

type Props = {
  className?: string; label?: string; readout?: ReactNode; decimal?: boolean;
  disabled?: boolean; actionDisabled?: boolean; actionLabel: string; actionName?: string;
  formId?: string; onAction?: () => void; onDigit: (digit: string) => void;
  onDelete: () => void; onClear: () => void;
};

export default function ActionKeypad({ className = '', label = 'แป้นตัวเลข', readout, decimal = true, disabled, actionDisabled, actionLabel, actionName, formId, onAction, onDigit, onDelete, onClear }: Props) {
  const enter = useRef<HTMLButtonElement>(null);
  return <div className={`action-keypad ${className}`} role="group" aria-label={label} onKeyDown={event => {
    if (disabled || event.ctrlKey || event.metaKey || event.altKey) return;
    if (/^[0-9]$/.test(event.key) || (decimal && event.key === '.')) { event.preventDefault(); event.stopPropagation(); onDigit(event.key); }
    else if (event.key === 'Backspace') { event.preventDefault(); event.stopPropagation(); onDelete(); }
    else if (event.key === 'Delete') { event.preventDefault(); event.stopPropagation(); onClear(); }
    else if (event.key === 'Enter') { event.preventDefault(); event.stopPropagation(); if (!disabled && !actionDisabled) enter.current?.click(); }
  }}>
    {readout && <output className="keypad-readout">{readout}</output>}
    <div className="action-keypad-grid">
      {['1','2','3','4','5','6','7','8','9'].map((digit,index) => <button type="button" className="keypad-digit" key={digit} disabled={disabled} style={{ gridColumn:index%3+1, gridRow:Math.floor(index/3)+1 }} onClick={() => onDigit(digit)}>{digit}</button>)}
      <button type="button" className="keypad-delete" disabled={disabled} onClick={onDelete}><span className="material-symbols-outlined" aria-hidden="true">backspace</span><span>ลบ</span></button>
      <button type="button" className="keypad-clear" disabled={disabled} onClick={onClear}>ล้าง</button>
      <button type="button" className={`keypad-digit keypad-zero ${decimal ? '' : 'keypad-zero-wide'}`} disabled={disabled} onClick={() => onDigit('0')}>0</button>
      {decimal && <button type="button" className="keypad-digit keypad-decimal" disabled={disabled} onClick={() => onDigit('.')}>.</button>}
      <button ref={enter} type={onAction ? 'button' : 'submit'} form={formId} className="keypad-enter primary-action" aria-label={actionName ?? actionLabel} disabled={disabled || actionDisabled} onClick={onAction}><span className="material-symbols-outlined" aria-hidden="true">keyboard_return</span><span>{actionLabel}</span></button>
    </div>
  </div>;
}
