import type { CartItem } from '../types';

interface CartTableProps {
  cart: CartItem[];
  updateQuantity: (id: string, delta: number) => void;
  updateDiscount: (id: string, amount: number) => void; 
  removeItem: (id: string) => void;
  containerClassName?: string;
  rowClassName?: string;
  buttonClassName?: string;
}

export default function CartTable({
  cart,
  updateQuantity,
  updateDiscount,
  removeItem,
  containerClassName = '',
  rowClassName = '',
  buttonClassName = '',
}: CartTableProps) {
  
  return (
    <section className={`flex-1 min-h-0 overflow-x-auto animate-fade-in-up bg-surface-soft rounded-2xl ${containerClassName}`}>
      <div className="bg-surface rounded-2xl border border-soft overflow-hidden transition-all duration-300 flex flex-col h-full">
        <div className="min-h-0 overflow-auto flex-1">
          <table className="w-full text-left border-collapse">
          <thead className="bg-surface-soft border-b border-soft sticky top-0 z-10">
            <tr>
              <th className="px-6 py-4 text-sm font-bold text-muted">รายการสินค้า</th>
              <th className="px-6 py-4 text-sm font-bold text-muted text-center">จำนวน</th>
              <th className="px-6 py-4 text-sm font-bold text-muted text-right">ราคา/หน่วย</th>
              <th className="px-6 py-4 text-sm font-bold text-muted text-center">ส่วนลด (฿)</th>
              <th className="px-6 py-4 text-sm font-bold text-muted text-right">รวม</th>
              <th className="px-6 py-4 text-sm font-bold text-muted text-center w-24">ลบ</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {cart.map((item, index) => {
              // คำนวณราคาสุทธิของแถวนี้
              const itemTotal = (item.price * item.quantity) - (item.discount || 0);

              return (
                <tr 
                  key={item.id} 
                  className={`hover:bg-primary-soft/30 transition-all duration-300 hover:shadow-md ${rowClassName}`}
                  style={{ animationDelay: `${index * 50}ms` }}
                >
                  <td className="px-6 py-5 font-bold text-lg">
                    {item.name}
                    <div className="text-xs text-muted-light font-normal">{item.barcode}</div>
                  </td>
                  
                  <td className="px-6 py-5">
                    <div className="flex items-center justify-center gap-3">
                      <button
                        onClick={() => updateQuantity(item.id, -1)}
                        className={`w-10 h-10 rounded-full bg-surface-soft flex items-center justify-center text-xl font-bold transition-all duration-200 hover:bg-primary hover:text-white hover:scale-110 active:scale-95 ${buttonClassName}`}
                      >
                        -
                      </button>
                      <span className="text-xl font-bold w-6 text-center">{item.quantity}</span>
                      <button
                        onClick={() => updateQuantity(item.id, 1)}
                        className={`w-10 h-10 rounded-full bg-surface-soft flex items-center justify-center text-xl font-bold transition-all duration-200 hover:bg-primary hover:text-white hover:scale-110 active:scale-95 ${buttonClassName}`}
                      >
                        +
                      </button>
                    </div>
                  </td>

                  <td className="px-6 py-5 text-right font-semibold">
                    ฿{item.price.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </td>

                  <td className="w-40 px-6 py-5"> {/* เพิ่ม py-5 ให้เท่ากับช่องอื่น */}
                    <div className="flex items-center justify-center h-full"> {/* ใช้ flex จัดกึ่งกลาง */}
                      <input
                        type="number"
                        className="w-full py-2 bg-surface-soft rounded-xl text-center font-bold text-danger border-2 border-transparent focus:border-danger/30 outline-none transition-all duration-200"
                        value={item.discount || ''} 
                        placeholder="0"
                        onChange={(e) => updateDiscount(item.id, Number(e.target.value))}
                      />
                    </div>
                  </td>

                  <td className="px-6 py-5 text-right font-black text-primary text-xl">
                    {/* แก้สูตรคำนวณให้หักส่วนลดด้วย */}
                    ฿{Math.max(0, itemTotal).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </td>

                  <td className="px-6 py-5 text-center">
                    <button
                      onClick={() => removeItem(item.id)}
                      className="w-12 h-12 rounded-xl bg-danger-soft transition-all duration-200 btn-delete-animate hover:text-white hover:scale-110 active:scale-95 flex items-center justify-center mx-auto"
                    >
                      <span className="material-symbols-outlined text-2xl">delete</span>
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}