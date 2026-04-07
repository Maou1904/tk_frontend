interface FooterActionsProps {
  onClear: () => void;
  onPrint: () => void;
  className?: string;
  buttonClassName?: string;
}

export default function FooterActions({
  onClear,
  onPrint,
  className = '',
  buttonClassName = '',
}: FooterActionsProps) {
  return (
    <footer className={`bg-surface border-t border-soft flex flex-col gap-4 px-6 py-6 md:px-10 md:h-24 md:flex-row md:items-center md:justify-between transition-all duration-300 animate-fade-in ${className}`}>
      <div className="flex gap-4 animate-slide-in-left">
        <button
          onClick={onClear}
          className={`px-6 py-3 rounded-xl font-bold bg-danger-soft text-danger transition-all duration-200 hover:bg-danger hover:text-white hover:shadow-lg hover:scale-105 active:scale-95 ${buttonClassName}`}
          aria-label="Clear bill"
        >
          ยกเลิกบิล
        </button>
      </div>
      <button
        onClick={onPrint}
        className={`px-12 py-4 text-2xl font-black shadow-lg shadow-soft bg-primary text-white rounded-2xl transition-all duration-200 hover:bg-primary-dark hover:scale-105 active:scale-95 animate-slide-in-right ${buttonClassName}`}
        aria-label="Print receipt"
      >
        พิมพ์ใบเสร็จ (F10)
      </button>
    </footer>
  );
}
