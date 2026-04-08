import EmployeeDropdown from "./EmployeeDropdown";

interface PaymentSummaryProps {
  subtotal: number;      // ยอดรวมหลังหักส่วนลดรายชิ้นแล้ว
  totalDiscount: number; // ผลรวมของ item.discount ทั้งหมดในตะกร้า
  total: number;         // ยอดสุทธิที่ต้องจ่าย (มักจะเท่ากับ subtotal ถ้าไม่มีส่วนลดท้ายบิลเพิ่ม)
  containerClassName?: string;
  titleClassName?: string;
}

export default function PaymentSummary({
  subtotal,
  totalDiscount,
  total,
  containerClassName = '',
  titleClassName = '',
}: PaymentSummaryProps) {
  const grossTotal = subtotal - totalDiscount;
  return (
    <aside className={`w-full flex-1 bg-surface xl:border-l border-soft p-8 flex flex-col transition-all duration-300 animate-slide-in-right ${containerClassName}`}>
      <div className="flex-1">
        <h3 className={`text-2xl font-black mb-8 flex items-center gap-3 text-text-main ${titleClassName}`}>
          <span className="material-symbols-outlined text-primary">receipt_long</span>
          สรุปรายการสั่งซื้อ
        </h3>

        <div className="space-y-6">
          {/* เลือกพนักงาน */}
          <div className="p-5 bg-surface-soft rounded-3xl border border-transparent hover:border-primary/20 transition-all duration-300 shadow-sm">
            <label className="block text-xs font-black text-primary mb-3 uppercase tracking-tighter">ผู้ขาย (STAFF)</label>
            <EmployeeDropdown />
          </div>

          {/* รายละเอียดราคาแบบใหม่ */}
          <div className="space-y-4 px-2">
            <div className="flex justify-between text-muted-light font-medium">
              <span>ราคารวม (Gross Total)</span>
              <span className="font-bold">฿{grossTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
            </div>
            
            {/* ส่วนลดรวมทั้งหมด (Item Discounts) */}
            <div className="flex justify-between items-center text-danger bg-danger-soft/20 p-4 rounded-2xl border border-danger/10 animate-scale-in">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-sm">sell</span>
                <span className="font-bold">ส่วนลดสินค้าทั้งหมด</span>
              </div>
              <span className="font-black text-lg">- ฿{totalDiscount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
            </div>
          </div>
        </div>

        {/* ยอดชำระสุทธิ - ปรับให้ใหญ่และชัดเจนที่สุด */}
        <div className="mt-10 pt-8 border-t-4 border-dashed border-soft animate-fade-in-up">
          <p className="text-sm font-black text-primary uppercase tracking-widest mb-2">ยอดชำระสุทธิ (NET TOTAL)</p>
          <div className="text-7xl font-black text-primary-strong tracking-tighter flex items-baseline leading-none">
            <span className="text-3xl mr-1">฿</span>
            {total.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </div>
        </div>
      </div>

      {/* ปุ่มชำระเงิน - ปรับ Padding ให้กดง่ายขึ้นสำหรับจอ Touch Screen */}
      <div className="mt-8 grid grid-cols-2 gap-4">
        <button className="py-8 bg-surface-soft text-text-main rounded-3xl font-black flex flex-col items-center gap-2 transition-all duration-200 hover:bg-primary hover:text-white hover:shadow-2xl hover:-translate-y-1 active:scale-95">
          <span className="material-symbols-outlined text-4xl">payments</span>
          เงินสด
        </button>
        <button className="py-8 bg-primary-soft text-primary-strong rounded-3xl font-black flex flex-col items-center gap-2 transition-all duration-200 hover:bg-primary hover:text-white hover:shadow-2xl hover:-translate-y-1 active:scale-95">
          <span className="material-symbols-outlined text-4xl">qr_code_2</span>
          PromptPay
        </button>
      </div>
    </aside>
  );
}