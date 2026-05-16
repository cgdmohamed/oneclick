import type { Company, Client, Product, Invoice, Payment, FinancialAccount, Plan, Subscription, Notification, User, StockMovement } from '@/types';

const today = new Date();
const daysAgo = (n: number) => new Date(today.getTime() - n * 86400000).toISOString();
const daysFromNow = (n: number) => new Date(today.getTime() + n * 86400000).toISOString();

export const plans: Plan[] = [
  {
    id: 'plan-basic',
    name: 'الأساسية',
    monthlyPrice: 99,
    yearlyPrice: 990,
    limits: { users: 2, invoices: 100, products: 50, reports: 5, notifications: 100 },
    features: ['إدارة الفواتير', 'إدارة العملاء', 'تسجيل المدفوعات', 'تقارير أساسية'],
  },
  {
    id: 'plan-pro',
    name: 'الاحترافية',
    monthlyPrice: 249,
    yearlyPrice: 2490,
    limits: { users: 5, invoices: 1000, products: 500, reports: 15, notifications: 1000 },
    features: ['كل مزايا الباقة الأساسية', 'إدارة المخزون', 'الحسابات البنكية والمحافظ', 'تقارير متقدمة', 'صلاحيات المستخدمين'],
    popular: true,
  },
  {
    id: 'plan-business',
    name: 'الأعمال',
    monthlyPrice: 599,
    yearlyPrice: 5990,
    limits: { users: 25, invoices: 10000, products: 5000, reports: 50, notifications: 10000 },
    features: ['كل مزايا الباقة الاحترافية', 'تنبيهات متقدمة', 'دعم فني مخصص', 'نسخ احتياطي يومي', 'تكاملات مستقبلية'],
  },
];

export const companies: Company[] = [
  { id: 'co-1', name: 'شركة الأفق للتجارة', ownerName: 'خالد العبدالله', email: 'info@alofok.sa', phone: '+966551112233', address: 'الرياض، حي الملقا', taxNumber: '300123456700003', status: 'active', planId: 'plan-pro', createdAt: daysAgo(120) },
  { id: 'co-2', name: 'مؤسسة النخبة للمقاولات', ownerName: 'أحمد المنصوري', email: 'contact@nokba.sa', phone: '+966552223344', address: 'جدة، حي الروضة', taxNumber: '300456789100003', status: 'active', planId: 'plan-business', createdAt: daysAgo(80) },
  { id: 'co-3', name: 'مجموعة الواحة الغذائية', ownerName: 'سارة الحربي', email: 'hello@alwaha.sa', phone: '+966553334455', address: 'الدمام، حي الشاطئ', status: 'expired', planId: 'plan-basic', createdAt: daysAgo(220) },
  { id: 'co-4', name: 'متجر اللمسة الذهبية', ownerName: 'نورة القحطاني', email: 'shop@goldentouch.sa', phone: '+966554445566', address: 'مكة المكرمة', status: 'suspended', planId: 'plan-basic', createdAt: daysAgo(30) },
  { id: 'co-5', name: 'شركة المسار الرقمي', ownerName: 'ماجد السهلي', email: 'info@digitalpath.sa', phone: '+966555556677', address: 'الرياض، حي العليا', status: 'active', planId: 'plan-pro', createdAt: daysAgo(15) },
];

export const subscriptions: Subscription[] = [
  { id: 'sub-1', companyId: 'co-1', planId: 'plan-pro', startDate: daysAgo(120), endDate: daysFromNow(245), status: 'active', paid: true, amount: 2490 },
  { id: 'sub-2', companyId: 'co-2', planId: 'plan-business', startDate: daysAgo(80), endDate: daysFromNow(285), status: 'active', paid: true, amount: 5990 },
  { id: 'sub-3', companyId: 'co-3', planId: 'plan-basic', startDate: daysAgo(220), endDate: daysAgo(10), status: 'expired', paid: false, amount: 990 },
  { id: 'sub-4', companyId: 'co-4', planId: 'plan-basic', startDate: daysAgo(30), endDate: daysFromNow(335), status: 'suspended', paid: false, amount: 99 },
  { id: 'sub-5', companyId: 'co-5', planId: 'plan-pro', startDate: daysAgo(15), endDate: daysFromNow(350), status: 'active', paid: true, amount: 249 },
];

export const clients: Client[] = [
  { id: 'cl-1', companyId: 'co-1', name: 'مؤسسة الزهور التجارية', phone: '+966500111222', email: 'zohor@example.sa', address: 'الرياض، حي العليا', taxNumber: '301122334400003', createdAt: daysAgo(90) },
  { id: 'cl-2', companyId: 'co-1', name: 'محلات السلام للتموينات', phone: '+966500333444', email: 'salam@example.sa', address: 'الرياض، حي النسيم', createdAt: daysAgo(70) },
  { id: 'cl-3', companyId: 'co-1', name: 'شركة البيان للخدمات', phone: '+966500555666', email: 'bayan@example.sa', address: 'جدة، حي الصفا', taxNumber: '302233445500003', createdAt: daysAgo(60) },
  { id: 'cl-4', companyId: 'co-1', name: 'مكتب الأمانة للاستشارات', phone: '+966500777888', email: 'amana@example.sa', address: 'الدمام', createdAt: daysAgo(45) },
  { id: 'cl-5', companyId: 'co-1', name: 'مؤسسة الصفوة للمقاولات', phone: '+966500999000', address: 'الرياض، حي الياسمين', createdAt: daysAgo(30) },
  { id: 'cl-6', companyId: 'co-1', name: 'متجر النجمة الذهبية', phone: '+966501111222', email: 'najma@example.sa', address: 'الخبر', createdAt: daysAgo(20) },
  { id: 'cl-7', companyId: 'co-1', name: 'شركة المروج للأغذية', phone: '+966501333444', email: 'morooj@example.sa', address: 'الرياض', createdAt: daysAgo(10) },
];

export const products: Product[] = [
  { id: 'pr-1', companyId: 'co-1', name: 'جهاز كمبيوتر محمول', code: 'LAP-001', category: 'إلكترونيات', price: 4500, quantity: 12, alertLevel: 5, status: 'active' },
  { id: 'pr-2', companyId: 'co-1', name: 'طابعة ليزر ملونة', code: 'PRN-002', category: 'إلكترونيات', price: 1850, quantity: 3, alertLevel: 5, status: 'active' },
  { id: 'pr-3', companyId: 'co-1', name: 'شاشة عرض 27 بوصة', code: 'MON-003', category: 'إلكترونيات', price: 1200, quantity: 18, alertLevel: 6, status: 'active' },
  { id: 'pr-4', companyId: 'co-1', name: 'لوحة مفاتيح لاسلكية', code: 'KBD-004', category: 'ملحقات', price: 220, quantity: 2, alertLevel: 10, status: 'active' },
  { id: 'pr-5', companyId: 'co-1', name: 'فأرة احترافية', code: 'MOU-005', category: 'ملحقات', price: 180, quantity: 35, alertLevel: 10, status: 'active' },
  { id: 'pr-6', companyId: 'co-1', name: 'سماعات رأس بلوتوث', code: 'HDP-006', category: 'ملحقات', price: 350, quantity: 1, alertLevel: 5, status: 'active' },
  { id: 'pr-7', companyId: 'co-1', name: 'كرسي مكتبي مريح', code: 'CHR-007', category: 'أثاث', price: 950, quantity: 7, alertLevel: 3, status: 'active' },
  { id: 'pr-8', companyId: 'co-1', name: 'مكتب خشبي حديث', code: 'DSK-008', category: 'أثاث', price: 1450, quantity: 4, alertLevel: 2, status: 'active' },
];

export const accounts: FinancialAccount[] = [
  { id: 'ac-1', companyId: 'co-1', name: 'الخزنة الرئيسية', type: 'cash', balance: 28500, status: 'active' },
  { id: 'ac-2', companyId: 'co-1', name: 'حساب البنك الأهلي', type: 'bank', balance: 142300, status: 'active' },
  { id: 'ac-3', companyId: 'co-1', name: 'حساب مصرف الراجحي', type: 'bank', balance: 87600, status: 'active' },
  { id: 'ac-4', companyId: 'co-1', name: 'محفظة STC Pay', type: 'wallet', balance: 12450, status: 'active' },
];

const mkInvoice = (n: number, clientId: string, daysAgoIssued: number, items: { name: string; qty: number; price: number }[], paidAmount: number, due: number): Invoice => {
  const its = items.map((it, i) => ({ id: `it-${n}-${i}`, name: it.name, quantity: it.qty, unitPrice: it.price }));
  const subtotal = its.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
  const tax = +(subtotal * 0.15).toFixed(2);
  const total = +(subtotal + tax).toFixed(2);
  const remaining = +(total - paidAmount).toFixed(2);
  const dueDate = daysFromNow(due);
  let status: Invoice['status'] = 'unpaid';
  if (paidAmount >= total) status = 'paid';
  else if (paidAmount > 0) status = 'partial';
  if (status !== 'paid' && new Date(dueDate) < today) status = 'overdue';
  return {
    id: `inv-${n}`,
    publicId: `pub-${1000 + n}`,
    companyId: 'co-1',
    clientId,
    number: `INV-2026-${String(n).padStart(4, '0')}`,
    issueDate: daysAgo(daysAgoIssued),
    dueDate,
    items: its,
    subtotal, tax, discount: 0, total, paid: paidAmount, remaining, status,
  };
};

export const invoices: Invoice[] = [
  mkInvoice(1, 'cl-1', 5, [{ name: 'جهاز كمبيوتر محمول', qty: 2, price: 4500 }], 10350, 25),
  mkInvoice(2, 'cl-2', 10, [{ name: 'طابعة ليزر ملونة', qty: 1, price: 1850 }, { name: 'شاشة عرض 27 بوصة', qty: 2, price: 1200 }], 2500, 20),
  mkInvoice(3, 'cl-3', 22, [{ name: 'كرسي مكتبي مريح', qty: 5, price: 950 }], 0, -5),
  mkInvoice(4, 'cl-4', 3, [{ name: 'مكتب خشبي حديث', qty: 1, price: 1450 }, { name: 'كرسي مكتبي مريح', qty: 1, price: 950 }], 2760, 27),
  mkInvoice(5, 'cl-5', 14, [{ name: 'سماعات رأس بلوتوث', qty: 10, price: 350 }], 0, 16),
  mkInvoice(6, 'cl-6', 1, [{ name: 'لوحة مفاتيح لاسلكية', qty: 4, price: 220 }, { name: 'فأرة احترافية', qty: 4, price: 180 }], 1840, 29),
  mkInvoice(7, 'cl-7', 35, [{ name: 'جهاز كمبيوتر محمول', qty: 1, price: 4500 }], 5175, -5),
  mkInvoice(8, 'cl-1', 7, [{ name: 'شاشة عرض 27 بوصة', qty: 3, price: 1200 }], 1500, 23),
];

export const payments: Payment[] = [
  { id: 'pay-1', companyId: 'co-1', invoiceId: 'inv-1', date: daysAgo(4), amount: 10350, splits: [{ method: 'bank', accountId: 'ac-2', amount: 10350 }] },
  { id: 'pay-2', companyId: 'co-1', invoiceId: 'inv-2', date: daysAgo(8), amount: 2500, splits: [{ method: 'cash', accountId: 'ac-1', amount: 1500 }, { method: 'wallet', accountId: 'ac-4', amount: 1000 }] },
  { id: 'pay-3', companyId: 'co-1', invoiceId: 'inv-4', date: daysAgo(2), amount: 2760, splits: [{ method: 'bank', accountId: 'ac-3', amount: 2760 }] },
  { id: 'pay-4', companyId: 'co-1', invoiceId: 'inv-6', date: daysAgo(0), amount: 1840, splits: [{ method: 'cash', accountId: 'ac-1', amount: 840 }, { method: 'bank', accountId: 'ac-2', amount: 1000 }] },
  { id: 'pay-5', companyId: 'co-1', invoiceId: 'inv-7', date: daysAgo(20), amount: 5175, splits: [{ method: 'bank', accountId: 'ac-2', amount: 5175 }] },
  { id: 'pay-6', companyId: 'co-1', invoiceId: 'inv-8', date: daysAgo(5), amount: 1500, splits: [{ method: 'wallet', accountId: 'ac-4', amount: 1500 }] },
];

export const stockMovements: StockMovement[] = [
  { id: 'sm-1', productId: 'pr-1', type: 'out', quantity: 2, reason: 'فاتورة INV-2026-0001', date: daysAgo(5) },
  { id: 'sm-2', productId: 'pr-2', type: 'out', quantity: 1, reason: 'فاتورة INV-2026-0002', date: daysAgo(10) },
  { id: 'sm-3', productId: 'pr-3', type: 'in', quantity: 20, reason: 'استلام مخزون', date: daysAgo(15) },
  { id: 'sm-4', productId: 'pr-4', type: 'out', quantity: 4, reason: 'فاتورة INV-2026-0006', date: daysAgo(1) },
  { id: 'sm-5', productId: 'pr-6', type: 'out', quantity: 10, reason: 'فاتورة INV-2026-0005', date: daysAgo(14) },
];

export const notifications: Notification[] = [
  { id: 'n-1', companyId: 'co-1', category: 'invoice', title: 'فاتورة جديدة', body: 'تم إنشاء الفاتورة INV-2026-0008 للعميل مؤسسة الزهور التجارية.', date: daysAgo(0), read: false },
  { id: 'n-2', companyId: 'co-1', category: 'payment', title: 'تم استلام دفعة', body: 'تم استلام دفعة بقيمة 1,840 ر.س على الفاتورة INV-2026-0006.', date: daysAgo(0), read: false },
  { id: 'n-3', companyId: 'co-1', category: 'stock', title: 'تنبيه مخزون منخفض', body: 'المنتج "سماعات رأس بلوتوث" أوشك على النفاد (الكمية: 1).', date: daysAgo(1), read: false },
  { id: 'n-4', companyId: 'co-1', category: 'debt', title: 'فاتورة متأخرة', body: 'الفاتورة INV-2026-0003 متأخرة عن السداد منذ 5 أيام.', date: daysAgo(2), read: true },
  { id: 'n-5', companyId: 'co-1', category: 'product', title: 'تمت إضافة منتج', body: 'تمت إضافة منتج جديد إلى الكتالوج.', date: daysAgo(3), read: true },
];

export const users: User[] = [
  { id: 'u-1', name: 'خالد العبدالله', email: 'admin@alofok.sa', phone: '+966551112233', role: 'company_admin', companyId: 'co-1' },
  { id: 'u-2', name: 'منى الشمري', email: 'mona@alofok.sa', phone: '+966551112234', role: 'accountant', companyId: 'co-1' },
  { id: 'u-3', name: 'فهد الدوسري', email: 'fahd@alofok.sa', phone: '+966551112235', role: 'sales', companyId: 'co-1' },
  { id: 'u-4', name: 'ريم العتيبي', email: 'reem@alofok.sa', phone: '+966551112236', role: 'viewer', companyId: 'co-1' },
  { id: 'u-admin', name: 'مالك المنصة', email: 'owner@oneclick.sa', role: 'super_admin' },
];

export const rolePermissions: Record<string, string[]> = {
  company_admin: ['إدارة كاملة للشركة', 'إضافة وحذف المستخدمين', 'الوصول لجميع التقارير', 'الإعدادات والاشتراك'],
  accountant: ['إدارة الفواتير والمدفوعات', 'إدارة الحسابات المالية', 'الوصول للتقارير المالية'],
  sales: ['إنشاء الفواتير', 'إدارة العملاء', 'عرض المدفوعات'],
  viewer: ['عرض الفواتير والتقارير فقط', 'لا يمكنه التعديل أو الحذف'],
};
