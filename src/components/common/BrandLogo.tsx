/**
 * BrandLogo — single source of truth for the SaaS wordmark.
 *
 * Renders the uploaded logo image when configured; otherwise renders the
 * brand name as a typographic wordmark (no icon). Replaces every hardcoded
 * `Calculator + "ون كليك"` instance across the app so super-admins can
 * rebrand the platform from one place.
 */
import { useBrand } from '@/lib/brand';
import { cn } from '@/lib/utils';

type Size = 'sm' | 'md' | 'lg' | 'xl';

const sizeMap: Record<Size, { img: string; text: string }> = {
  sm: { img: 'h-7',  text: 'text-base' },
  md: { img: 'h-9',  text: 'text-lg' },
  lg: { img: 'h-10', text: 'text-xl' },
  xl: { img: 'h-12', text: 'text-2xl' },
};

interface BrandLogoProps {
  /** Visual scale. */
  size?: Size;
  /** Force text-only wordmark even when a logo image is configured. */
  textOnly?: boolean;
  /** Override foreground color (defaults to currentColor — inherits from parent). */
  className?: string;
  /** Show tagline under the wordmark (used in footer / sidebar header). */
  withTagline?: boolean;
  /** Override alt text on the image. */
  alt?: string;
}

export const BrandLogo = ({
  size = 'md',
  textOnly = false,
  className,
  withTagline = false,
  alt,
}: BrandLogoProps) => {
  const { brand } = useBrand();
  const s = sizeMap[size];

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
      {!textOnly && brand.logoUrl ? (
        <img
          src={brand.logoUrl}
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
      {!textOnly && brand.logoUrl && withTagline && brand.tagline && (
        <span className="text-[10px] text-muted-foreground leading-none">
          {brand.tagline}
        </span>
      )}
    </span>
  );
};

export default BrandLogo;
