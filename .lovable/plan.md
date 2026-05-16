# Two Logo Variants: Icon + Full

Extend the brand system so super-admins can upload **two** logo images instead of one, and let the platform pick the right one per context.

## 1. Brand model (`src/lib/brand.ts`)

Replace the single `logoUrl` field with two:

- `logoFullUrl` — wide/horizontal lockup (wordmark + optional mark). Used in headers, footers, auth pages, invoice PDFs, sidebar when expanded.
- `logoIconUrl` — square/compact mark. Used in collapsed sidebar, favicon-like spots, small chips, mobile compact header.

Keep typographic fallback unchanged: if a needed variant is missing, fall back to the other variant, then to the typographic wordmark.

Add a one-time migration in `read()`: if old `logoUrl` exists in localStorage, copy it into `logoFullUrl`.

## 2. BrandLogo component (`src/components/common/BrandLogo.tsx`)

Add a `variant` prop:

- `variant="full"` (default) — prefers `logoFullUrl`, falls back to icon, then text.
- `variant="icon"` — prefers `logoIconUrl`, falls back to full, then to a 1–2 char text monogram derived from `brand.name`.
- `variant="auto"` — picks based on a `compact` boolean (used by sidebar collapse).

Icon variant renders square (`h-X w-X`), full variant keeps current `h-X w-auto` behavior.

## 3. Admin editor (`src/pages/admin/SystemSettings.tsx`)

Split the upload section into two side-by-side uploaders:

- "الشعار الكامل (أفقي)" — full lockup, recommended ratio ~3:1 or 4:1.
- "أيقونة الشعار (مربعة)" — square mark, recommended 1:1.

Each has its own upload / remove buttons, its own 512KB limit, and its own live preview. Add a combined preview row showing both variants side by side at their real rendered sizes.

## 4. Usage sweep

Update the places that should prefer the icon over the full lockup:

- `src/layouts/AppLayout.tsx` — collapsed sidebar uses icon; expanded uses full.
- Any small/compact spot in the header on narrow mobile widths.

All other usages (`PublicLayout`, `Login`, `Register`, `ForgotPassword`, `ResetPassword`, `AcceptInvite`, `PublicInvoice`, invoice PDF header) stay on `variant="full"`.

## 5. Backwards compatibility

- Old saved brand JSON with `logoUrl` is migrated to `logoFullUrl` on first read.
- `DEFAULT_BRAND` has both URLs empty → typographic fallback continues to work everywhere.

## Out of scope

- No backend changes (brand still lives in localStorage as today).
- No new pages or routes.
- No business logic changes.

---

Confirm and I'll implement, or tell me if you'd rather have a third "favicon" slot too.
