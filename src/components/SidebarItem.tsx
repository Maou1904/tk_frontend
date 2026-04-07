import React from 'react';

interface SidebarItemProps {
  icon: string;
  title: string;
  isSelected?: boolean;
  onClick?: () => void;
  className?: string;
  iconClassName?: string;
}

export default function SidebarItem({
  icon,
  title,
  isSelected = false,
  onClick,
  className = '',
  iconClassName = '',
}: SidebarItemProps) {
  
  // สไตล์พื้นฐานที่ทุกปุ่มต้องมี
  const baseStyles = "flex items-center gap-3 px-4 py-3 rounded-xl font-semibold text-sm transition-all duration-200 hover:scale-105 active:scale-95 cursor-pointer";
  
  // สไตล์แยกตามสถานะ Selected
  const selectedStyles = "bg-primary text-white shadow-lg hover:shadow-xl";
  const unselectedStyles = "text-muted hover:text-primary";

  return (
    <button
        className={`${baseStyles} ${isSelected ? selectedStyles : unselectedStyles} ${className}`}
      onClick={onClick}
      
    >
      <span className={`material-symbols-outlined transition-transform ${iconClassName}`}>
        {icon}
      </span>
      <span>{title}</span>
    </button>
  );
}