import type { ReactNode } from 'react';
import SidebarItem from './SidebarItem';

interface SidebarProps {
  brand?: string;
  subtitle?: string;
  containerClassName?: string;
  buttonClassName?: string;
  navClassName?: string;
  iconClassName?: string;
}

export default function Sidebar({
  brand = 'Tingkum',
  subtitle = 'ระบบจัดการร้านค้า',
  containerClassName = '',
  buttonClassName = '',
  navClassName = '',
  iconClassName = '',
}: SidebarProps) {
  return (
    <aside className={`w-min p-4 flex flex-col md:h-screen shadow-soft transition-all duration-300 animate-slide-in-left ${containerClassName}`}>
      <div className="mb-8 px-4">
        <h1 className="text-3xl font-bold text-primary animate-fade-in">{brand}</h1>
        <p className="text-sm uppercase tracking-widest mt-1 animate-fade-in">{subtitle}</p>
      </div>
      <nav className={`flex-1 flex flex-col gap-2 ${navClassName}`}>
        <SidebarItem 
          icon="barcode_scanner" 
          title="POS" 
          isSelected={true}
        />
        <SidebarItem 
          icon="analytics" 
          title="Analytics" 
        />
        <SidebarItem 
          icon="settings_remote" 
          title="Services" 
        />
        <SidebarItem 
          icon="inventory_2" 
          title="Inventory" 
        />
        <SidebarItem 
          icon="badge" 
          title="Staff" 
        />
        <button className={`flex rounded-xl items-center gap-3 px-4 py-3 font-semibold text-sm transition-all btn-delete-animate duration-200 hover:scale-105 active:scale-95 ${buttonClassName}`}>
          <span className={`material-symbols-outlined transition-transform ${iconClassName}`}>event_busy</span>
          <span>Closeout</span>
        </button>
      </nav>

    </aside>
  );
}
