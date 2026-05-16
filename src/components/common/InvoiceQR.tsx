import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { QrCode, Upload, RotateCcw, Download } from 'lucide-react';
import { toast } from 'sonner';
import {
  useInvoiceQr,
  qrStorageKey,
  notifyQrChange,
  isQrPublicVisible,
  setQrPublicVisible,
} from '@/hooks/useInvoiceQr';

interface Props {
  invoiceId: string;
  value: string;
  invoiceNumber: string;
}

export const InvoiceQR = ({ invoiceId, value, invoiceNumber }: Props) => {
  const { src, custom } = useInvoiceQr(invoiceId, value);
  const fileRef = useRef<HTMLInputElement>(null);
  const [publicVisible, setPublicVisibleState] = useState(true);

  useEffect(() => { setPublicVisibleState(isQrPublicVisible(invoiceId)); }, [invoiceId]);

  const togglePublic = (v: boolean) => {
    setPublicVisibleState(v);
    setQrPublicVisible(invoiceId, v);
    toast.success(v ? 'سيظهر QR في الصفحة العامة' : 'تم إخفاء QR من الصفحة العامة');
  };

  const onUpload = (file: File) => {
    if (!file.type.startsWith('image/')) return toast.error('يجب اختيار ملف صورة');
    if (file.size > 2 * 1024 * 1024) return toast.error('الحد الأقصى 2 ميجابايت');
    const reader = new FileReader();
    reader.onload = () => {
      localStorage.setItem(qrStorageKey(invoiceId), String(reader.result));
      notifyQrChange(invoiceId);
      toast.success('تم رفع QR مخصص');
    };
    reader.readAsDataURL(file);
  };

  const resetToGenerated = () => {
    localStorage.removeItem(qrStorageKey(invoiceId));
    notifyQrChange(invoiceId);
    toast.success('تم استعادة QR المُولَّد');
  };

  const downloadQr = () => {
    if (!src) return;
    const a = document.createElement('a');
    a.href = src;
    a.download = `qr-${invoiceNumber}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  return (
    <div className="rounded-xl border border-border/70 bg-card p-4">
      <div className="flex items-center gap-2 mb-3">
        <QrCode className="h-4 w-4 text-muted-foreground" />
        <h3 className="font-semibold text-sm">رمز QR للفاتورة</h3>
        {custom && <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">مخصص</span>}
      </div>

      <div className="flex items-center justify-center bg-white rounded-lg p-3 border border-border/60">
        {src ? (
          <img src={src} alt={`QR ${invoiceNumber}`} className="h-40 w-40 object-contain" />
        ) : (
          <div className="h-40 w-40 grid place-items-center text-xs text-muted-foreground">جارٍ التوليد...</div>
        )}
      </div>

      <p className="text-[11px] text-muted-foreground mt-2 break-all text-center">
        {custom ? 'صورة مرفوعة' : value}
      </p>

      <div className="flex flex-wrap gap-2 mt-3 no-print">
        <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()}>
          <Upload className="h-3.5 w-3.5 ml-1" /> رفع QR
        </Button>
        {custom && (
          <Button size="sm" variant="outline" onClick={resetToGenerated}>
            <RotateCcw className="h-3.5 w-3.5 ml-1" /> توليد تلقائي
          </Button>
        )}
        <Button size="sm" variant="outline" onClick={downloadQr} disabled={!src}>
          <Download className="h-3.5 w-3.5 ml-1" /> تنزيل
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          hidden
          onChange={e => {
            const f = e.target.files?.[0];
            if (f) onUpload(f);
            e.target.value = '';
          }}
        />
      </div>
    </div>
  );
};
