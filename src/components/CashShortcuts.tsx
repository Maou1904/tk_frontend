import { baht } from '../storeOperations';

type Props = { due: number | null; value?: number | null; disabled?: boolean; onSelect: (amount: number) => void; showUnit?: boolean };

export default function CashShortcuts({ due, value, disabled, onSelect, showUnit = true }: Props) {
  return <div className="cash-shortcuts" role="group" aria-label="ยอดเงินลัด">
    <button type="button" className="cash-exact" aria-label="รับพอดี" aria-pressed={due !== null && value === due} disabled={disabled || due === null} onClick={() => due !== null && onSelect(due)}><span><span className="material-symbols-outlined" aria-hidden="true">payments</span>รับพอดี</span><strong>{baht(due ?? 0)}</strong></button>
    {[100,200,500,1000].map(amount => <button type="button" className="cash-denomination" key={amount} aria-label={`${amount.toLocaleString('th-TH')}${showUnit ? ' บาท' : ''}`} aria-pressed={value === amount*100 && value !== due} disabled={disabled} onClick={() => onSelect(amount*100)}><strong>{amount.toLocaleString('th-TH')}</strong>{showUnit && <span>บาท</span>}</button>)}
  </div>;
}
