import SidebarItem from './SidebarItem';

interface SidebarProps {
  currentView: string; // รับค่าว่าตอนนี้อยู่ที่หน้าไหน
  onViewChange: (view: string) => void; // ฟังก์ชันสลับหน้า
  brand?: string;
  subtitle?: string;
}

export default function Sidebar({
  currentView,
  onViewChange,
  brand = 'Tingkum',
  subtitle = 'ระบบจัดการร้านค้า',
}: SidebarProps) {
  return (
    <aside className="w-64 p-4 flex flex-col h-screen shadow-soft transition-all duration-300">
      <div className="mb-8 px-4">
        <h1 className="text-3xl font-bold text-primary">{brand}</h1>
        <p className="text-sm uppercase tracking-widest mt-1">{subtitle}</p>
      </div>
      
      <nav className="flex-1 flex flex-col gap-2">
        <SidebarItem 
          icon="barcode_scanner" 
          title="POS" 
          isSelected={currentView === 'POS'}
          onClick={() => onViewChange('POS')}
        />
        <SidebarItem 
          icon="water_bottle" 
          title="Gas" 
          isSelected={currentView === 'GAS'}
          onClick={() => onViewChange('GAS')}
        />
        <SidebarItem 
          icon="card_giftcard" 
          title="Lottery" 
          isSelected={currentView === 'LOTTERY'}
          onClick={() => onViewChange('LOTTERY')}
        />
        <SidebarItem 
          icon="analytics" 
          title="Analytics" 
          isSelected={currentView === 'ANALYTICS'}
          onClick={() => onViewChange('ANALYTICS')}
        />
        <SidebarItem 
          icon="badge" 
          title="Staff" 
          isSelected={currentView === 'STAFF'}
          onClick={() => onViewChange('STAFF')}
        />
      </nav>

      {/* ปุ่ม Closeout แยกไว้ข้างล่างสุด */}
      <button className={`flex rounded-xl items-center gap-3 px-4 py-3 font-semibold text-sm transition-all btn-delete-animate duration-200 hover:scale-105 active:scale-95`}>
          <span className={`material-symbols-outlined transition-transform`}>event_busy</span>
          <span>Closeout</span>
        </button>
    </aside>
  );
}