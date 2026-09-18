/**
 * InvoiceDocument — the single canonical rendering of "what an invoice looks like",
 * driven entirely by the company's saved invoice-appearance settings (template,
 * accent color, logo, terms, footer). Used by three places that must always match:
 * the live preview in Settings, the invoice screen inside the app (and its print),
 * and the public shared-link invoice — previously each had its own hand-rolled
 * layout that had drifted out of sync with the others and with the saved settings.
 */
import { Building2 } from 'lucide-react';
import { formatCurrency } from '@/lib/format';
import { resolveAssetUrl } from '@/lib/api';
import type { ReactNode } from 'react';

export interface InvoiceDocumentConfig {
  template: 'classic' | 'modern' | 'minimal';
  accentColor: string;
  showLogo: boolean;
  showTaxNumber: boolean;
  terms?: string | null;
  footer?: string | null;
  logoUrl?: string | null;
  stampUrl?: string | null;
}

export interface InvoiceDocumentItem {
  id: string | number;
  name: string;
  quantity: number;
  unitPrice: number;
  discount?: number;
  total: number;
}

export interface InvoiceDocumentProps {
  company: { name: string; email?: string | null; phone?: string | null; taxNumber?: string | null; address?: string | null };
  cfg: InvoiceDocumentConfig;
  client: { name: string; email?: string | null; address?: string | null; taxNumber?: string | null };
  invoiceNumber: string;
  issueDate: string;
  dueDate: string;
  statusBadge?: ReactNode;
  items: InvoiceDocumentItem[];
  totals: { subtotal: number; tax: number; discount?: number; total: number; paid?: number; remaining?: number };
}

export const InvoiceDocument = ({ company, cfg, client, invoiceNumber, issueDate, dueDate, statusBadge, items, totals }: InvoiceDocumentProps) => {
  const isMinimal = cfg.template === 'minimal';
  const isClassic = cfg.template === 'classic';
  const showDiscountCol = items.some((it) => (it.discount ?? 0) > 0);

  return (
    <div className="rounded-xl border border-border/60 bg-white text-slate-900 shadow-soft overflow-hidden" dir="rtl">
      <div
        className="p-6 flex items-start justify-between gap-4"
        style={
          isMinimal
            ? { background: '#fff', borderBottom: `1px solid ${cfg.accentColor}22` }
            : isClassic
            ? { background: '#f8fafc', borderBottom: `4px solid ${cfg.accentColor}` }
            : { background: cfg.accentColor, color: '#fff' }
        }
      >
        <div className="flex items-center gap-3">
          {cfg.showLogo && (
            cfg.logoUrl ? (
              <img src={resolveAssetUrl(cfg.logoUrl)} alt="شعار" className="h-12 w-12 rounded-xl object-contain bg-white/90 p-1" />
            ) : (
              <div
                className="h-12 w-12 rounded-xl flex items-center justify-center"
                style={{
                  background: cfg.template === 'modern' ? 'rgba(255,255,255,0.2)' : cfg.accentColor + '22',
                  color: cfg.template === 'modern' ? '#fff' : cfg.accentColor,
                }}
              >
                <Building2 className="h-6 w-6" />
              </div>
            )
          )}
          <div>
            <div className="font-bold text-lg">{company.name}</div>
            <div className="text-xs opacity-80">{[company.email, company.phone].filter(Boolean).join(' · ')}</div>
          </div>
        </div>
        <div className="text-end">
          <div className="font-bold text-xl">فاتورة ضريبية</div>
          <div className="text-sm opacity-80">رقم: {invoiceNumber}</div>
          {statusBadge && <div className="mt-2 flex justify-end">{statusBadge}</div>}
        </div>
      </div>

      <div className="p-6 grid grid-cols-2 gap-4 text-sm border-b border-slate-200">
        <div>
          <div className="text-slate-500 text-xs mb-1">فاتورة إلى</div>
          <div className="font-semibold">{client.name || '—'}</div>
          {client.address && <div className="text-slate-600 text-xs">{client.address}</div>}
          {client.email && <div className="text-slate-600 text-xs">{client.email}</div>}
          {client.taxNumber && <div className="text-slate-600 text-xs">الرقم الضريبي: {client.taxNumber}</div>}
        </div>
        <div className="text-end">
          <div className="text-slate-500 text-xs">تاريخ الإصدار: <span className="text-slate-900">{issueDate}</span></div>
          <div className="text-slate-500 text-xs">تاريخ الاستحقاق: <span className="text-slate-900">{dueDate}</span></div>
          {cfg.showTaxNumber && company.taxNumber && (
            <div className="text-slate-500 text-xs">الرقم الضريبي: <span className="text-slate-900">{company.taxNumber}</span></div>
          )}
        </div>
      </div>

      <div className="p-6">
        <table className="w-full text-sm">
          <thead>
            <tr style={{ color: cfg.accentColor }} className="text-start border-b-2">
              <th className="py-2 font-semibold">الوصف</th>
              <th className="py-2 font-semibold w-16 text-center">الكمية</th>
              <th className="py-2 font-semibold w-28 text-end">السعر</th>
              {showDiscountCol && <th className="py-2 font-semibold w-24 text-end">الخصم</th>}
              <th className="py-2 font-semibold w-28 text-end">الإجمالي</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it) => (
              <tr key={it.id} className="border-b border-slate-100">
                <td className="py-2.5">{it.name}</td>
                <td className="py-2.5 text-center">{it.quantity}</td>
                <td className="py-2.5 text-end">{formatCurrency(it.unitPrice)}</td>
                {showDiscountCol && <td className="py-2.5 text-end">{it.discount ? formatCurrency(it.discount) : '—'}</td>}
                <td className="py-2.5 text-end font-medium">{formatCurrency(it.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="flex justify-end mt-4">
          <div className="w-64 space-y-1.5 text-sm">
            <div className="flex justify-between text-slate-600"><span>المجموع الفرعي</span><span>{formatCurrency(totals.subtotal)}</span></div>
            {!!totals.discount && <div className="flex justify-between text-slate-600"><span>الخصم</span><span>-{formatCurrency(totals.discount)}</span></div>}
            <div className="flex justify-between text-slate-600"><span>الضريبة</span><span>{formatCurrency(totals.tax)}</span></div>
            <div
              className="flex justify-between font-bold text-base pt-2 border-t"
              style={{ color: cfg.accentColor, borderColor: cfg.accentColor + '40' }}
            >
              <span>الإجمالي</span><span>{formatCurrency(totals.total)}</span>
            </div>
            {totals.paid != null && (
              <div className="flex justify-between text-success"><span>المدفوع</span><span>{formatCurrency(totals.paid)}</span></div>
            )}
            {totals.remaining != null && (
              <div className="flex justify-between font-bold text-destructive"><span>المتبقي</span><span>{formatCurrency(totals.remaining)}</span></div>
            )}
          </div>
        </div>

        <div className="mt-6 text-xs text-slate-500 border-t border-slate-100 pt-4 space-y-1">
          {cfg.terms && <div>{cfg.terms}</div>}
          {company.address && <div>{company.address}</div>}
          {cfg.footer && <div className="text-center font-medium pt-2" style={{ color: cfg.accentColor }}>{cfg.footer}</div>}
        </div>
        {cfg.stampUrl && (
          <div className="mt-6 flex justify-end">
            <div className="text-center">
              <img src={resolveAssetUrl(cfg.stampUrl)} alt="ختم/توقيع" className="h-24 w-auto object-contain opacity-90" />
              <div className="text-[10px] text-slate-500 mt-1">الختم والتوقيع</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
