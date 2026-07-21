import GasHeader from "./components/GasHeader";

type GasProduct = {
  id: number;
  name: string;
  price: string;
  barcode: string;
  stock: number;
  item_type?: 'GAS';
};

interface GasViewProps {
  addToCart: (product: GasProduct) => void;
}

export default function GasView({ addToCart }: GasViewProps) {
  // สมมติมีข้อมูลแก๊สที่ดึงมาจาก DB หรือเขียน Hardcode ไว้เทสก่อน
  const gasItems: GasProduct[] = [
    { id: 101, name: 'ปตท. 4 กก. (เติม)', price: '200', barcode: 'GAS-4KG', stock: 10 },
    { id: 102, name: 'ปตท. 15 กก. (เติม)', price: '450', barcode: 'GAS-15KG', stock: 10 }
  ];

  return (
    <div className="h-full flex flex-col">
        <GasHeader />

        <div className="antialiased overflow-hidden h-full flex flex-col md:flex-row gap-3">
        <div className="w-full flex-1 p-6 bg-surface rounded-2xl animate-fade-in-left">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {gasItems.map((item) => (
              <button
                key={item.id}
                type="button"
                className="p-6 bg-surface-soft rounded-2xl border-2 border-soft hover:border-primary transition-all flex flex-col items-start gap-2 shadow-sm active:scale-95"
                onClick={() => addToCart({ ...item, item_type: 'GAS' })}
              >
                <span className="material-symbols-outlined text-4xl text-primary">water_bottle</span>
                <span className="font-bold">{item.name}</span>
                <span className="text-primary font-black">THB {item.price}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="w-full flex-1 p-6 bg-surface rounded-2xl animate-fade-in-left">
          <div className="h-full rounded-xl border border-dashed border-soft flex items-center justify-center text-muted">
            Delivery detail
          </div>
        </div>
        </div>
    </div>
  );
}
