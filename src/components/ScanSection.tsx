interface ScanSectionProps {
  barcodeLabel?: string;
  phoneLabel?: string;
  containerClassName?: string;
  fieldClassName?: string;
  iconClassName?: string;
}

export default function ScanSection({
  barcodeLabel = 'ยิงบาร์โค้ดสินค้า',
  phoneLabel = 'เบอร์โทรศัพท์ลูกค้า',
  containerClassName = '',
  fieldClassName = '',
  iconClassName = '',
}: ScanSectionProps) {
  return (
    <section className={`p-6 grid grid-cols-1 md:grid-cols-2 gap-6 bg-surface-soft-alpha animate-fade-in-up ${containerClassName}`}>
      <div className="flex flex-col gap-2 animate-slide-in-left">
        <label className="text-sm font-semibold text-primary">{barcodeLabel}</label>
        <div className="relative">
          <span className={`material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-3xl text-primary transition-transform ${iconClassName}`}>barcode_scanner</span>
          <input
            className={`w-full pl-16 pr-6 py-4 bg-surface rounded-2xl text-2xl font-bold shadow-sm border-2 border-transparent focus-primary outline-none transition-all duration-200 hover:shadow-md ${fieldClassName}`}
            placeholder="สแกนที่นี่..."
            type="text"
            autoFocus
          />
        </div>
      </div>

      <div className="flex flex-col gap-2 animate-slide-in-right">
        <label className="text-sm font-semibold text-muted">{phoneLabel}</label>
        <div className="relative">
          <span className={`material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-3xl text-muted-light transition-transform ${iconClassName}`}>phone_iphone</span>
          <input
            className={`w-full pl-16 pr-6 py-4 bg-surface rounded-2xl text-2xl font-bold shadow-sm border-2 border-transparent focus-primary outline-none transition-all duration-200 hover:shadow-md ${fieldClassName}`}
            placeholder="08X-XXX-XXXX"
            type="text"
          />
        </div>
      </div>
    </section>
  );
}
