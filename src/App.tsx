import { useEffect, useMemo, useState } from 'react';
import type { CartItem } from './types';
import './App.css';
import Sidebar from './components/Sidebar';
import TopNavBar from './components/TopNavBar';
import ScanSection from './components/ScanSection';
import CartTable from './components/CartTable';
import PaymentSummary from './components/PaymentSummary';
import FooterActions from './components/FooterActions';
import axios from 'axios';

// สร้าง Interface สำหรับ TypeScript (ช่วยให้เขียน Code ง่ายขึ้น)
interface Product {
  id: number;
  name: string;
  price: string;
  stock: number;
}

function App() {
  const [cart, setCart] = useState<CartItem[]>([
    { id: '1', name: 'ข้าวหอมมะลิ 5 กก.', barcode: 'BC-9921002', price: 185, quantity: 2 },
    { id: '2', name: 'น้ำมันพืช ตราองุ่น 1 ลิตร', barcode: 'BC-1120034', price: 45, quantity: 1 },
  ]);

  const addToCart = (product: Product) => {
    setCart(prev => {
      // เช็คว่าในตระกร้ามีสินค้านี้หรือยัง
      const existingItem = prev.find(item => item.id === product.id.toString());
      if (existingItem) {
        return prev.map(item =>
          item.id === product.id.toString() ? { ...item, quantity: item.quantity + 1 } : item
        );
      }
      // ถ้ายังไม่มี ให้เพิ่มเข้าไปใหม่
      return [...prev, {
        id: product.id.toString(),
        name: product.name,
        barcode: `BC-${product.id}`, // สมมติบาร์โค้ดไปก่อน
        price: parseFloat(product.price),
        quantity: 1
      }];
    });
  };

  const [products, setProducts] = useState<Product[]>([]);

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

  useEffect(() => {
    // 1. ดึงข้อมูลจาก Backend
    axios.get('http://localhost:5000/api/products')
      .then(res => {
        const dbProducts: Product[] = res.data;
        setProducts(dbProducts); // เก็บไว้ใน list สินค้าปกติก่อน

        // 2. [Test Mode] แปลงข้อมูลจาก DB ให้กลายเป็นรูปแบบ CartItem แล้วยัดใส่ Cart ทันที
        const testItems: CartItem[] = dbProducts.map(p => ({
          id: p.id.toString(),
          name: p.name,
          barcode: `NO-BARCODE-${p.id}`, // ในเมื่อไม่มี barcode ก็ใช้ ID แก้ขัดไปก่อน
          price: parseFloat(p.price),
          quantity: 1 // ใส่ไว้ 1 ชิ้นก่อนเพื่อเทส
        }));

        setCart(testItems); // อัปเดตตระกร้าด้วยข้อมูลจาก Database
      })
      .catch(err => {
        console.error("Error fetching data:", err);
      });
  }, []);

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