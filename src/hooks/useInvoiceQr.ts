import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

export const qrStorageKey = (id: string) => `invoice-qr:${id}`;
export const qrPublicVisibleKey = (id: string) => `invoice-qr-public:${id}`;

export const isQrPublicVisible = (invoiceId: string): boolean => {
  const v = localStorage.getItem(qrPublicVisibleKey(invoiceId));
  return v === null ? true : v === '1';
};

export const setQrPublicVisible = (invoiceId: string, visible: boolean) => {
  localStorage.setItem(qrPublicVisibleKey(invoiceId), visible ? '1' : '0');
  window.dispatchEvent(new CustomEvent('invoice-qr-change', { detail: { invoiceId } }));
};

export const useInvoiceQr = (invoiceId: string, value: string) => {
  const [src, setSrc] = useState<string>('');
  const [custom, setCustom] = useState<boolean>(false);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const saved = localStorage.getItem(qrStorageKey(invoiceId));
    if (saved) {
      setSrc(saved);
      setCustom(true);
      return;
    }
    setCustom(false);
    QRCode.toDataURL(value, { margin: 1, width: 256, errorCorrectionLevel: 'M' })
      .then(setSrc)
      .catch(() => setSrc(''));
  }, [invoiceId, value, version]);

  // listen for changes from other components in same tab
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { invoiceId: string } | undefined;
      if (detail?.invoiceId === invoiceId) setVersion(v => v + 1);
    };
    window.addEventListener('invoice-qr-change', handler);
    return () => window.removeEventListener('invoice-qr-change', handler);
  }, [invoiceId]);

  return { src, custom, refresh: () => setVersion(v => v + 1) };
};

export const notifyQrChange = (invoiceId: string) => {
  window.dispatchEvent(new CustomEvent('invoice-qr-change', { detail: { invoiceId } }));
};
