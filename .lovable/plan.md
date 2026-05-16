## المشكلة

`src/components/common/PageHeader.tsx` يحتوي على عناصر زخرفية كثيرة تجعله يبدو غير احترافي:

- إطار ملوّن (`border-page-accent`) + خلفية متدرجة (`gradient-page`)
- شريط علوي ملوّن بارتفاع 1px (`gradient-page-strong`)
- بقعة ضوء متدرجة في الزاوية (blob)
- مربع أيقونة كبير بخلفية متدرجة (12–14 بكسل) مع ظل
- زوايا مدورة كبيرة (`rounded-2xl`) وحشو سخي

## الحل

تبسيط `PageHeader` ليصبح هادئاً واحترافياً بنمط لوحات تحكم SaaS الحديثة:

- إزالة: الخلفية المتدرجة، الإطار، الـ blob الزخرفي، الشريط العلوي، مربع الأيقونة الملوّن، الظل، الزوايا المدورة الكبيرة.
- استبداله بـ:
  - عنوان `h1` نظيف بحجم `text-2xl font-semibold tracking-tight`
  - وصف `text-sm text-muted-foreground` تحته
  - أيقونة صغيرة اختيارية بجانب العنوان بلون `text-muted-foreground` (بدون مربع/خلفية)، أو حذفها بالكامل لو الأيقونة لا تضيف قيمة
  - فاصل سفلي خفيف `border-b border-border` بدل الإطار الكامل
  - مساحة `actions` على الجانب الآخر بنفس المحاذاة

### الشكل النهائي المقترح

```tsx
<div className="mb-6 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 pb-4 border-b border-border">
  <div className="min-w-0">
    <h1 className="text-2xl font-semibold tracking-tight truncate">{title}</h1>
    {description && (
      <p className="text-sm text-muted-foreground mt-1">{description}</p>
    )}
  </div>
  {actions && <div className="flex items-center gap-2 flex-wrap shrink-0">{actions}</div>}
</div>
```

- لن نعرض الأيقونة افتراضياً (الأيقونات تظهر بالفعل في الشريط الجانبي)، لكن سنُبقي الـ prop `icon` متاحاً للحالات التي تمرّر أيقونة صريحة، وفي هذه الحالة تُعرض كأيقونة صغيرة `h-5 w-5 text-muted-foreground` بجانب العنوان.
- إزالة منطق `routeIcon` تماماً (لم يعد ضرورياً) لتقليص الملف.

## التحقق

أخذ لقطات بعد التعديل لمسارات: `/app/subscription`, `/app/reports`, `/app/users`, `/admin` للتأكد من أن العناوين أصبحت موحّدة وهادئة في كل الصفحات.

## ملاحظة

`PageHeader` مستخدم في كل الصفحات تقريباً، فالتعديل في ملف واحد سيُحدِّث كل العناوين تلقائياً دون لمس باقي الصفحات.
