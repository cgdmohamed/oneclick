import { z } from 'zod';

export const PUBLIC_KINDS = ['info', 'warning', 'success', 'error'] as const;
export const ALL_KINDS = [...PUBLIC_KINDS, 'invoice_email'] as const;

export type PublicKind = (typeof PUBLIC_KINDS)[number];
export type NotificationKind = (typeof ALL_KINDS)[number];

export const publicKindSchema = z.enum(PUBLIC_KINDS, {
  errorMap: () => ({
    message: `kind must be one of: ${PUBLIC_KINDS.join(', ')}`,
  }),
});

export const internalKindSchema = z.enum(ALL_KINDS, {
  errorMap: () => ({
    message: `kind must be one of: ${ALL_KINDS.join(', ')}`,
  }),
});
