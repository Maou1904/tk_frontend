import { paginationPages } from '../analytics';

type Props = { page: number; pageCount: number; total: number; pageSize: number; onPageChange: (page: number) => void; onPageSizeChange: (size: number) => void };

export default function AnalyticsPagination({ page, pageCount, total, pageSize, onPageChange, onPageSizeChange }: Props) {
  return <div className="analytics-pagination">
    <div className="analytics-pagination-info"><span role="status">{total ? `แสดง ${(page-1)*pageSize+1}–${Math.min(page*pageSize,total)} จาก ${total.toLocaleString('th-TH')} รายการ` : '0 รายการ'}</span><label>ต่อหน้า<select aria-label="จำนวนรายการขายต่อหน้า" value={pageSize} onChange={event => onPageSizeChange(Number(event.target.value))}>{[20,50,100].map(size => <option key={size} value={size}>{size}</option>)}</select></label></div>
    {pageCount > 1 && <nav aria-label="หน้าทุกรายการขาย" className="analytics-page-buttons">
      <button type="button" disabled={page === 1} onClick={() => onPageChange(page-1)}>ก่อนหน้า</button>
      {paginationPages(page,pageCount).map((value,index) => value === 'ellipsis' ? <span key={`gap-${index}`} aria-hidden="true">…</span> : <button type="button" key={value} aria-label={`หน้าที่ ${value}`} aria-current={value === page ? 'page' : undefined} onClick={() => onPageChange(value)}>{value}</button>)}
      <button type="button" disabled={page === pageCount} onClick={() => onPageChange(page+1)}>ถัดไป</button>
    </nav>}
  </div>;
}
