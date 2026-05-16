/**
 * BrandLogo — single source of truth for the SaaS wordmark/mark.
 *
 * Two variants:
 *  - "full" (default): horizontal lockup. Prefers logoFullUrl → logoIconUrl → typographic wordmark.
 *  - "icon":           square mark. Prefers logoIconUrl → logoFullUrl → monogram from brand name.
 */
import { useBrand, brandMonogram } from '@/lib/brand';
import { cn } from '@/lib/utils';

type Size = 'sm' | 'md' | 'lg' | 'xl';
type Variant = 'full' | 'icon';

const sizeMap: Record<Size, { img: string; iconBox: string; text: string; mono: string }> = {
  sm: { img: 'h-7',  iconBox: 'h-7 w-7',   text: 'text-base', mono: 'text-sm' },
  md: { img: 'h-9',  iconBox: 'h-9 w-9',   text: 'text-lg',   mono: 'text-base' },
  lg: { img: 'h-10', iconBox: 'h-10 w-10', text: 'text-xl',   mono: 'text-lg' },
  xl: { img: 'h-12', iconBox: 'h-12 w-12', text: 'text-2xl',  mono: 'text-xl' },
};

interface BrandLogoProps {
  size?: Size;
  /** Which variant to render. Defaults to 'full'. */
  variant?: Variant;
  /** Force the typographic/monogram fallback even when an image is configured. */
  textOnly?: boolean;
  className?: string;
  /** Show tagline alongside the wordmark (full variant only). */
  withTagline?: boolean;
  alt?: string;
}

export const BrandLogo = ({
  size = 'md',
  variant = 'full',
  textOnly = false,
  className,
  withTagline = false,
  alt,
}: BrandLogoProps) => {
  const { brand } = useBrand();
  const s = sizeMap[size];

  // Pick the image source per variant, with cross-variant fallback.
  const src = variant === 'icon'
    ? (brand.logoIconUrl || brand.logoFullUrl)
    : (brand.logoFullUrl || brand.logoIconUrl);

  // ICON variant: square image or monogram.
  if (variant === 'icon') {
    if (!textOnly && src) {
      return (
        <img
          src={src}
          alt={alt ?? brand.name}
          className={cn(s.iconBox, 'object-contain select-none', className)}
          draggable={false}
        />
      );
    }
    return (
      <span
        className={cn(
          s.iconBox,
          s.mono,
          brand.fontWeight,
          'inline-flex items-center justify-center rounded-md bg-primary/10 text-primary leading-none',
          className,
        )}
        style={{ fontFamily: brand.fontFamily }}
        aria-label={brand.name}
      >
        {brandMonogram(brand.name)}
      </span>
    );
  }

  // FULL variant: horizontal lockup with optional tagline.
  const Wordmark = (
    <span
      className={cn(s.text, brand.fontWeight, brand.tracking, 'leading-none')}
      style={{ fontFamily: brand.fontFamily }}
    >
      {brand.name}
    </span>
  );

  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      {!textOnly && src ? (
        <img
          src={src}
          alt={alt ?? brand.name}
          className={cn(s.img, 'w-auto object-contain select-none')}
          draggable={false}
        />
      ) : (
        <span className="inline-flex flex-col items-start min-w-0">
          {Wordmark}
          {withTagline && brand.tagline && (
            <span className="text-[10px] text-muted-foreground mt-0.5 leading-none">
              {brand.tagline}
            </span>
          )}
        </span>
      )}
      {!textOnly && src && withTagline && brand.tagline && (
        <span className="text-[10px] text-muted-foreground leading-none">
          {brand.tagline}
        </span>
      )}
    </span>
  );
};

export default BrandLogo;
