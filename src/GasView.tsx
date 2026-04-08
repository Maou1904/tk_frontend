// GasView.tsx
export default function GasView({ addToCart }: { addToCart: (item: any, type: string) => void }) {
  const gasOptions = [
    { id: 101, name: 'ปตท. 4 กก. (เติม)', price_refill: 200, size: '4kg' },
    { id: 102, name: 'ปตท. 15 กก. (เติม)', price_refill: 450, size: '15kg' },
    { id: 103, name: 'ถังใหม่ 15 กก. (พร้อมเนื้อ)', price_refill: 2500, size: '15kg' },
  ];

  return (
    <div className="grid grid-cols-2 gap-4 p-4 animate-fade-in">
      {gasOptions.map(gas => (
        <button 
          key={gas.id}
          onClick={() => addToCart(gas, 'GAS')}
          className="bg-surface p-6 rounded-3xl border-2 border-soft hover:border-primary hover:shadow-xl transition-all flex flex-col items-center gap-3 active:scale-95"
        >
          <span className="material-symbols-outlined text-5xl text-primary">water_bottle</span>
          <div className="text-center">
            <p className="font-bold text-lg">{gas.name}</p>
            <p className="text-primary font-black text-2xl">฿{gas.price_refill}</p>
          </div>
        </button>
      ))}
    </div>
  );
}