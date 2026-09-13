import { useInvoiceQr } from '@/hooks/useInvoiceQr';

interface Props {
  invoiceId: string;
  value: string;
  invoiceNumber: string;
  visible?: boolean;
}

/** Compact QR rendered inside the invoice card so it's part of the print/PDF area. */
export const PrintableQr = ({ invoiceId, value, invoiceNumber, visible = true }: Props) => {
  const { src } = useInvoiceQr(invoiceId, value);
  if (!visible || !src) return null;
  return (
    <div className="mt-5 pt-4 border-t border-border flex items-center gap-4">
      <div className="bg-white p-2 rounded-md border border-border/60">
        <img src={src} alt={`QR ${invoiceNumber}`} className="h-24 w-24 object-contain" crossOrigin="anonymous" />
      </div>
      <div className="text-xs text-muted-foreground">
        <div className="font-medium text-foreground mb-1">امسح للوصول إلى الفاتورة</div>
        <div className="break-all">{value}</div>
      </div>
    </div>
  );
};
