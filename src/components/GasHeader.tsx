interface GasHeaderProps {
  containerClassName?: string;
}

export default function GasHeader({
  containerClassName = '',
}: GasHeaderProps) {
  return (
    <section className={`py-6 grid grid-cols-1 gap-1 bg-surface-soft-alpha animate-fade-in-up ${containerClassName}`}>
      <div className="flex flex-col gap-2 animate-slide-in-right text-3xl font-bold text-primary">
        ขายแก๊ส
      </div>
      <div className="text-muted italic animate-slide-in-left">
        เลือกประเภทถัง -{">"} กดตามจำนวนที่ต้องการ -{">"} กรอกรายละเอียดที่ส่ง -{">"} เลือกคนส่ง -{">"} กดทำรายการ
        </div>
    </section>
  );
}
