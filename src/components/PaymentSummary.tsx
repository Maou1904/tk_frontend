interface PaymentSummaryProps {
  subtotal: number;
  total: number;
  discount: number;
  onDiscountChange: (value: number) => void;
  containerClassName?: string;
  inputClassName?: string;
  titleClassName?: string;
}

export default function PaymentSummary({
  subtotal,
  total,
  discount,
  onDiscountChange,
  containerClassName = '',
  inputClassName = '',
  titleClassName = '',
}: PaymentSummaryProps) {
  return (
    <aside className={`w-full flex-1 bg-surface xl:border-l-5 border-soft p-6 flex flex-col transition-all duration-300 animate-slide-in-right ${containerClassName}`}>
      <div className="flex-1">
        <h3 className={`text-xl font-bold mb-6 flex items-center gap-2 animate-fade-in ${titleClassName}`}>สรุปรายการสั่งซื้อ</h3>

        <div className="space-y-4 mb-8">
          <div className="flex justify-between text-muted animate-fade-in-up">
            <span>ราคารวม (Subtotal)</span>
            <span className="font-bold">฿{subtotal.toFixed(2)}</span>
          </div>

          <div className="p-4 bg-danger-soft rounded-2xl border-2 border-dashed border-danger-soft transition-all duration-200 hover:border-danger hover:shadow-md animate-scale-in">
            <label className="block text-xs font-bold text-danger mb-2 uppercase tracking-widest">ส่วนลด (THB)</label>
            <input
              type="number"
              className={`w-full bg-surface rounded-xl p-3 text-2xl font-black text-danger border-2 border-transparent focus-danger outline-none transition-all duration-200 ${inputClassName}`}
              value={discount}
              onChange={(e) => onDiscountChange(Number(e.target.value))}
            />
          </div>
        </div>

        <div className="mt-8 pt-8 border-t-4 border-dashed border-soft animate-fade-in-up">
          <p className="text-sm font-bold text-primary uppercase mb-1">ยอดชำระทั้งหมด</p>
          <div className="text-6xl font-black text-primary-strong leading-tight">{total.toFixed(2) === subtotal.toFixed(2) ? '฿' : '฿'}{total.toFixed(2)}</div>
        </div>
      </div>

      <div className="mt-8 grid grid-cols-2 gap-4">
        <button className="py-6 bg-surface-soft rounded-2xl font-bold flex flex-col items-center gap-2 transition-all duration-200 hover:bg-primary hover:text-white hover:shadow-lg hover:scale-105 active:scale-95 animate-fade-in-up">
          <span className="material-symbols-outlined text-4xl">payments</span>
          เงินสด
        </button>
        <button className="py-6 bg-primary-soft text-primary-strong rounded-2xl font-bold flex flex-col items-center gap-2 transition-all duration-200 hover:bg-primary hover:text-white hover:shadow-lg hover:scale-105 active:scale-95 animate-fade-in-up">
          <span className="material-symbols-outlined text-4xl">qr_code_2</span>
          PromptPay
        </button>
      </div>
    </aside>
  );
}
