interface TopNavBarProps {
  title?: string;
  placeholder?: string;
  className?: string;
  inputClassName?: string;
}

export default function TopNavBar({
  title = 'Shop Management',
  placeholder = 'ค้นหาใบเสร็จ...',
  className = '',
  inputClassName = '',
}: TopNavBarProps) {
  return (
    <header className={`h-16 flex flex-col md:flex-row justify-between items-center gap-4 px-4 md:px-8 transition-all duration-300 animate-fade-in ${className}`}>
      <h2 className="font-black text-base animate-slide-in-left">{title}</h2>
      <div className="flex items-center gap-4 w-full md:w-auto animate-slide-in-right">
        <div className="relative flex-1 md:flex-none w-full md:w-64">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-primary pointer-events-none">search</span>
          <input
            className={`w-full pl-11 pr-4 py-2 bg-surface-soft rounded-full border-2 border-transparent focus-primary outline-none transition-all duration-200 text-sm hover:bg-surface-strong/50 ${inputClassName}`}
            placeholder={placeholder}
            type="text"
          />
        </div>
        <button className="p-2 text-muted hover:text-primary-strong transition-all">
          <span className="material-symbols-outlined">notifications</span>
        </button>
        <button className="p-2 text-muted hover:text-primary-strong transition-all">
          <span className="material-symbols-outlined">account_circle</span>
        </button>
      </div>
    </header>
  );
}
