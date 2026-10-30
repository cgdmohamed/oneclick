-- Migration 057: Translate the auto-seeded chart-of-accounts default names
-- to Arabic. `ensureAccountingSetup()` in posting.ts already carries the
-- Arabic names for any NEW company (or the next time an existing company's
-- accounting setup is lazily re-touched), but this migration renames the
-- rows for companies that already have these exact default English names
-- sitting unused since before this change.
--
-- Matched by (code, exact old English name) so a company that has already
-- renamed one of these accounts themselves is left untouched — we only
-- translate rows that still carry the untouched seed value.

UPDATE chart_accounts SET name = CASE code
  WHEN '1100' THEN 'العملاء'
  WHEN '1200' THEN 'المخزون'
  WHEN '1150' THEN 'مخصص الديون المشكوك في تحصيلها'
  WHEN '1500' THEN 'الأصول الثابتة'
  WHEN '1590' THEN 'مجمع الإهلاك'
  WHEN '1010' THEN 'الخزينة'
  WHEN '1020' THEN 'البنك'
  WHEN '1030' THEN 'المحفظة الإلكترونية'
  WHEN '2100' THEN 'الموردون'
  WHEN '2200' THEN 'ضريبة القيمة المضافة المستحقة'
  WHEN '2300' THEN 'مستحقات الموظفين'
  WHEN '2310' THEN 'التأمينات الاجتماعية المستحقة'
  WHEN '2320' THEN 'الضرائب المستحقة على الرواتب'
  WHEN '2330' THEN 'الاستقطاعات المستحقة على الرواتب'
  WHEN '1300' THEN 'ضريبة القيمة المضافة على المشتريات'
  WHEN '3100' THEN 'الأرباح المرحّلة / رصيد افتتاحي'
  WHEN '3200' THEN 'صافي ربح/خسارة السنة الحالية'
  WHEN '4100' THEN 'إيرادات المبيعات'
  WHEN '4200' THEN 'مرتجعات المبيعات'
  WHEN '4300' THEN 'إيرادات الفوائد'
  WHEN '5100' THEN 'تكلفة البضاعة المباعة'
  WHEN '5200' THEN 'مصروفات عامة'
  WHEN '5250' THEN 'مصروفات رسوم بنكية'
  WHEN '5260' THEN 'مصروف تالف/هالك المخزون'
  WHEN '5400' THEN 'مصروف الديون المعدومة'
  WHEN '5500' THEN 'مصروف الإهلاك'
  WHEN '5600' THEN 'ربح/خسارة التخلص من الأصول'
  WHEN '5700' THEN 'مصروف الرواتب'
  WHEN '5300' THEN 'تسوية المخزون'
END
WHERE (code, name) IN (
  ('1100', 'Accounts Receivable'),
  ('1200', 'Inventory'),
  ('1150', 'Allowance for Doubtful Debts'),
  ('1500', 'Fixed Assets'),
  ('1590', 'Accumulated Depreciation'),
  ('1010', 'Cash'),
  ('1020', 'Bank'),
  ('1030', 'Wallet'),
  ('2100', 'Accounts Payable'),
  ('2200', 'VAT Payable'),
  ('2300', 'Employee Payables'),
  ('2310', 'Social Insurance Payable'),
  ('2320', 'Payroll Tax Payable'),
  ('2330', 'Payroll Deductions Payable'),
  ('1300', 'VAT Input'),
  ('3100', 'Retained Earnings / Opening Balance Equity'),
  ('3200', 'Current Year Profit/Loss'),
  ('4100', 'Sales Revenue'),
  ('4200', 'Sales Returns'),
  ('4300', 'Interest Income'),
  ('5100', 'Cost of Goods Sold'),
  ('5200', 'General Expenses'),
  ('5250', 'Bank Charges Expense'),
  ('5260', 'Inventory Loss / Damaged Goods Expense'),
  ('5400', 'Bad Debt Expense'),
  ('5500', 'Depreciation Expense'),
  ('5600', 'Gain/Loss on Asset Disposal'),
  ('5700', 'Salaries Expense'),
  ('5300', 'Inventory Adjustment')
);
