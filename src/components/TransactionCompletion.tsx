import { useEffect } from 'react';
import type { CSSProperties } from 'react';

export type CompletionDetails = { title: string; detail?: string; change?: number };
export type CompletionNotice = CompletionDetails & { id: string };

export default function TransactionCompletion({ notice, onDismiss }: { notice: CompletionNotice; onDismiss: () => void }) {
  const hasChange = (notice.change ?? 0) > 0;
  const duration = hasChange ? 6000 : 3200;
  useEffect(() => {
    const timer = window.setTimeout(onDismiss, duration);
    return () => window.clearTimeout(timer);
  }, [duration, onDismiss]);
  return <div className="transaction-completion-layer">
    <div className="transaction-completion" role="status" aria-live="polite" aria-atomic="true" style={{ '--completion-duration': `${duration}ms` } as CSSProperties}>
      <button type="button" className="transaction-completion-close" aria-label="ปิดข้อความสำเร็จ" onClick={onDismiss}>×</button>
      <span className="transaction-completion-check" aria-hidden="true"><svg viewBox="0 0 48 48"><path d="M12 24l8 8 17-18" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"/></svg></span>
      <strong>{notice.title}</strong>
      {notice.detail && <p>{notice.detail}</p>}
      {hasChange && <div className="transaction-completion-change"><span>เงินทอน</span><b>{new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB' }).format(notice.change!)}</b></div>}
    </div>
  </div>;
}
