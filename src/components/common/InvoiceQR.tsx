import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { Button } from '@/components/ui/button';
import { QrCode, Upload, RotateCcw, Download } from 'lucide-react';
import { toast } from 'sonner';

interface Props {
  invoiceId: string;
  value: string; // payload to encode when auto-generating
  invoiceNumber: string;
}

const storageKey = (id: string) => `invoice-qr:${id}`;

export const InvoiceQR = ({ invoiceId, value, invoiceNumber }: Props) => {
  const [src, setSrc] = useState<string>('');
  const [custom, setCustom] = useState<boolean>(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const saved = localStorage.getItem(storageKey(invoiceId));
    if (saved) {
      setSrc(saved);
      setCustom(true);
      return;
    }
    QRCode.toDataURL(value, { margin: 1, width: 256, errorCorrectionLevel: 'M' })
      .then(setSrc)
      .catch(() => setSrc(''));
  }, [invoiceId, value]);

  const onUpload = (file: File) => {
    if (!file.type.startsWith('image/')) {
      toast.error('يجب اختيار ملف صورة');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error('الحد الأقصى 2 ميجابايت');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result);
      localStorage.setItem(storageKey(invoiceId), dataUrl);
      setSrc(dataUrl);
      setCustom(true);
      toast.success('تم رفع QR مخصص');
    };
    reader.readAsDataURL(file);
  };

  const resetToGenerated = async () => {
    localStorage.removeItem(storageKey(invoiceId));
    const generated = await QRCode.toDataURL(value, { margin: 1, width: 256, errorCorrectionLevel: 'M' });
    setSrc(generated);
    setCustom(false);
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
