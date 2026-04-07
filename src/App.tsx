import { useMemo, useState } from 'react';
import type { CartItem } from './types';
import './App.css';
import Sidebar from './components/Sidebar';
import TopNavBar from './components/TopNavBar';
import ScanSection from './components/ScanSection';
import CartTable from './components/CartTable';
import PaymentSummary from './components/PaymentSummary';
import FooterActions from './components/FooterActions';

function App() {
  const [cart, setCart] = useState<CartItem[]>([
    { id: '1', name: 'ข้าวหอมมะลิ 5 กก.', barcode: 'BC-9921002', price: 185, quantity: 2 },
    { id: '2', name: 'น้ำมันพืช ตราองุ่น 1 ลิตร', barcode: 'BC-1120034', price: 45, quantity: 1 },
  ]);

  const [discount, setDiscount] = useState<number>(0);

  const updateQuantity = (id: string, delta: number) => {
    setCart(prev => prev.map(item =>
      item.id === id ? { ...item, quantity: Math.max(1, item.quantity + delta) } : item
    ));
  };

  const removeItem = (id: string) => {
    setCart(prev => prev.filter(item => item.id !== id));
  };

  const handleClearBill = () => {
    setCart([]);
    setDiscount(0);
  };

  const handlePrint = () => {
    console.log('Print receipt');
  };

  const subtotal = useMemo(() => cart.reduce((sum, item) => sum + (item.price * item.quantity), 0), [cart]);
  const total = Math.max(0, subtotal - discount);

  return (
    <div className="antialiased overflow-hidden min-h-screen flex flex-col md:flex-row">
      {/* Sidebar Navigation */}
      <Sidebar></Sidebar>

      <div className="flex-1 flex flex-col">
        {/* Top Navigation Header */}
        <TopNavBar 
          title="Tingkum Shop Management" 
          placeholder="ค้นหาใบเสร็จ..."
          className=""
        />

        {/* Main Content */}
        <main className="flex-1 flex flex-col overflow-hidden">
          {/* Scan Section */}
          <ScanSection 
            barcodeLabel="ยิงบาร์โค้ดสินค้า (Scan Barcode)"
            phoneLabel="เบอร์โทรศัพท์ลูกค้า (Member Search)"
            containerClassName="bg-surface"
          />

          {/* Cart & Payment Section */}
          <div className="flex-1 flex gap-6 p-6 overflow-hidden min-h-0">
            {/* Cart Table */}
            <CartTable 
              cart={cart}
              updateQuantity={updateQuantity}
              removeItem={removeItem}
              containerClassName="flex-[6] min-w-0"
            />

            {/* Payment Summary */}
            <PaymentSummary
              subtotal={subtotal}
              total={total}
              discount={discount}
              onDiscountChange={setDiscount}
              containerClassName="flex-[4] min-w-0"
            />
          </div>

          {/* Footer Actions */}
          <FooterActions 
            onClear={handleClearBill}
            onPrint={handlePrint}
            className="h-24 bg-surface-soft border-t border-soft px-6 py-4 flex items-center justify-between gap-4"
          />
        </main>
      </div>
    </div>
  );
}

export default App;