import React, { useState } from 'react';

interface Employee {
  id: string;
  name: string;
  role: string;
}

export default function EmployeeDropdown() {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedEmp, setSelectedEmp] = useState<Employee | null>(null);

  const employees: Employee[] = [
    { id: '1', name: 'สมชาย รักดี', role: 'ผู้จัดการ' },
    { id: '2', name: 'สมศรี มีสุข', role: 'พนักงานขาย' },
    { id: '3', name: 'มานี มานะ', role: 'พนักงานขาย' },
  ];

  return (
    <div className="relative w-full font-prompt">
      {/* ส่วนที่แสดงผล (Trigger) */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-4 py-3 bg-surface border-3 border-gray-100 rounded-2xl hover:border-primary transition-all active:scale-[0.98]"
      >
        <div className="flex items-center gap-5">
          <span className="material-symbols-outlined text-primary scale-125">badge</span>
          <div className="text-left">
            <p className="text-xs text-muted leading-none mb-1">พนักงานที่ดูแล</p>
            <p className="font-bold text-l text-danger">
              {selectedEmp ? selectedEmp.name : 'เลือกพนักงาน'}
            </p>
          </div>
        </div>
        <span className={`material-symbols-outlined transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`}>
          expand_more
        </span>
      </button>

      {/* ส่วนรายการ (Dropdown List) */}
      {isOpen && (
        <div className="absolute top-full left-0 w-full mt-2 bg-surface border border-soft rounded-2xl shadow-xl overflow-hidden z-50 animate-pop-in">
          {employees.map((emp) => (
            <div
              key={emp.id}
              onClick={() => {
                setSelectedEmp(emp);
                setIsOpen(false);
              }}
              className="flex items-center justify-between px-4 py-3 hover:bg-surface-soft cursor-pointer transition-colors group"
            >
              <div>
                <p className="font-bold text-sm group-hover:text-primary">{emp.name}</p>
                <p className="text-xs text-muted">{emp.role}</p>
              </div>
              {selectedEmp?.id === emp.id && (
                <span className="material-symbols-outlined text-primary text-sm">check_circle</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}