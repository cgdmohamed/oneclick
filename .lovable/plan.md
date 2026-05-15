## المشكلة

في `src/components/ui/switch.tsx` تم سابقاً إضافة `absolute start-0.5 top-0.5` مع `translate-x-[1.125rem]` كحل مؤقت، وهذا سبّب:

- الدائرة البيضاء ملاصقة للأسفل (بسبب `top-0.5` + `border-2`)
- مسافة انزلاق غير دقيقة (1.125rem بدل المسافة الصحيحة)

## الحسابات الصحيحة

- المسار: `h-6` (1.5rem) و `w-11` (2.75rem) مع `border-2` (0.125rem × 2)
- المساحة الداخلية: ارتفاع 1.25rem × عرض 2.5rem
- الدائرة: `h-5 w-5` (1.25rem) → تملأ الارتفاع تماماً، ومسافة الانزلاق = 2.5 − 1.25 = **1.25rem** = `translate-x-5`

## الحل

تعديل `src/components/ui/switch.tsx`:

- إزالة `absolute start-0.5 top-0.5` من الـ Thumb (الدائرة).
- إزالة `relative` من الـ Root.
- استخدام `translate-x-5` و `-translate-x-5` بدل `[1.125rem]`.
- الاعتماد على flex الافتراضي لتمركز الدائرة عمودياً، والـ border للمسافة الأفقية.

```tsx
// Root
"peer inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors data-[state=checked]:bg-primary data-[state=unchecked]:bg-input focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50"

// Thumb
"pointer-events-none block h-5 w-5 rounded-full bg-background shadow-lg ring-0 transition-transform ltr:data-[state=checked]:translate-x-5 ltr:data-[state=unchecked]:translate-x-0 rtl:data-[state=checked]:-translate-x-5 rtl:data-[state=unchecked]:translate-x-0"
```

## التحقق

أخذ لقطة لـ `/app/users` بعد التعديل والتأكد بصرياً أن الدائرة:
- متمركزة عمودياً داخل المسار.
- لا تتجاوز الحواف في أي من الحالتين أو في أي من الاتجاهين.
