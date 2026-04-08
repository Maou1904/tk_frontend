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
  barcode: string;
}

function App() {
  const [cart, setCart] = useState<CartItem[]>([
  ]);

  const [currentView, setCurrentView] = useState('POS');

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
        barcode: product.barcode.toString(), // สมมติบาร์โค้ดไปก่อน
        price: parseFloat(product.price),
        discount: 0,
        quantity: 2,
        item_type: 'PRODUCT'
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

  const updateItemDiscount = (id: string, discountValue: number) => {
  setCart(prev => prev.map(item =>
    item.id === id ? { ...item, discount: Math.max(0, discountValue) } : item
  ));
};

  const subtotal = useMemo(() => cart.reduce((sum, item) => sum + (item.price * item.quantity), 0), [cart]);
  
  // คำนวณราคารวมทั้งหมด (Net Total)
  const total = useMemo(() => {
    return cart.reduce((sum, item) => {
      // สูตร: (ราคา x จำนวน) - ส่วนลดของชิ้นนั้น
      const itemTotal = (item.price * item.quantity) - (item.discount || 0);
      return sum + Math.max(0, itemTotal); // กันติดลบ
    }, 0);
  }, [cart]);

  const totalDiscount = useMemo(() => {
    return cart.reduce((sum, item) => sum + (item.discount || 0), 0);
  }, [cart]);

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
          barcode: p.barcode.toString(),
          price: parseFloat(p.price),
          quantity: 1, // ใส่ไว้ 1 ชิ้นก่อนเพื่อเทส
          discount: 0, // ใส่ค่าเริ่มต้นสำหรับส่วนลด
          item_type: 'PRODUCT' // ใส่ค่าเริ่มต้นสำหรับประเภทสินค้า
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
      <Sidebar 
        currentView={currentView}
        onViewChange={setCurrentView}
      />

      <div className="flex-1 flex flex-col">
        {/* Top Navigation Header */}
        <TopNavBar 
          title="Tingkum Shop Management" 
          placeholder="ค้นหาใบเสร็จ..."
          className=""
        />

        {/* Main Content */}
        <main className="flex-1 flex flex-col overflow-hidden">
          {/* ส่วนที่เปลี่ยนไปตามหน้า (Dynamic Content) */}
          {currentView === 'POS' ? (
            <>
              <ScanSection 
                barcodeLabel="ยิงบาร์โค้ดสินค้า (Scan Barcode)"
                phoneLabel="เบอร์โทรศัพท์ลูกค้า (Member Search)"
              />
              <div className="flex-1 flex gap-6 p-6 overflow-hidden min-h-0">
                <CartTable 
                  cart={cart}
                  updateQuantity={updateQuantity}
                  updateDiscount={updateItemDiscount}
                  removeItem={removeItem}
                  containerClassName="flex-[6]"
                />
                <PaymentSummary
                  subtotal={subtotal}
                  total={total}
                  totalDiscount={totalDiscount}
                  containerClassName="flex-[4]"
                />
              </div>
            </>
          ) : currentView === 'GAS' ? (
            <div className="flex-1 p-6 overflow-auto">
              {/* เดี๋ยวเราจะสร้าง GasView มาวางตรงนี้ */}
              <h2 className="text-2xl font-bold">ระบบจัดการแก๊ส</h2>
              {/* ตัวอย่างปุ่มกดเพิ่มแก๊ส */}
              <button 
                onClick={() => addToCart({ id: 999, name: 'แก๊ส 15kg', price: '450', barcode: 'GAS-01', stock: 10 })}
                className="mt-4 p-4 bg-primary text-white rounded-xl"
              >
                ทดสอบเพิ่มแก๊ส 15kg
              </button>
            </div>
          ) : (
            <div className="flex-1 p-6">
              <h2 className="text-2xl font-bold">หน้า {currentView} กำลังพัฒนา...</h2>
            </div>
          )}

          {/* Footer Actions ให้โชว์ทุกหน้า หรือเฉพาะหน้าขายก็ได้ */}
          <FooterActions onClear={handleClearBill} onPrint={handlePrint} />
        </main>
      </div>
    </div>
  );
}

export default App;