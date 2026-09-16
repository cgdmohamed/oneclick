import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import { HttpError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

/** Postgres error codes we translate into clean, user-facing 400s instead of a raw 500. */
type PgError = { code?: string; constraint?: string; column?: string };

// Constraints whose violation means something specific enough to name —
// checked before the generic per-error-code fallback below.
const CONSTRAINT_MESSAGES: Record<string, string> = {
  journal_entry_lines_check: 'تعذر إتمام العملية: قيمة سطر القيد المحاسبي غير صالحة (يجب ألا تكون سالبة)',
  journal_entry_lines_check1: 'تعذر إتمام العملية: القيد المحاسبي الناتج غير متزن أو بقيمة صفرية',
  credit_note_items_quantity_check: 'الكمية في الإشعار الدائن يجب أن تكون أكبر من صفر',
  debit_note_items_quantity_check: 'الكمية في الإشعار المدين يجب أن تكون أكبر من صفر',
  credit_note_items_unit_price_check: 'سعر الوحدة في الإشعار الدائن لا يمكن أن يكون سالبًا',
  debit_note_items_unit_price_check: 'سعر الوحدة في الإشعار المدين لا يمكن أن يكون سالبًا',
};

function friendlyDbMessage(err: PgError): string | null {
  if (err.constraint && CONSTRAINT_MESSAGES[err.constraint]) {
    return CONSTRAINT_MESSAGES[err.constraint];
  }
  switch (err.code) {
    case '23505': // unique_violation
      return 'هذه القيمة مستخدمة بالفعل، يرجى اختيار قيمة أخرى';
    case '23503': // foreign_key_violation
      return 'لا يمكن إتمام العملية لوجود بيانات مرتبطة بهذا العنصر';
    case '23502': // not_null_violation
      return 'يوجد حقل مطلوب لم يتم إدخاله، يرجى مراجعة البيانات';
    case '23514': // check_violation (no specific message matched above)
      return 'البيانات المدخلة لا تحقق الشروط المطلوبة، يرجى المراجعة';
    case '22P02': // invalid_text_representation (bad uuid/number/date format)
      return 'صيغة أحد الحقول المدخلة غير صحيحة';
    case '22003': // numeric_value_out_of_range
      return 'القيمة المدخلة أكبر من الحد المسموح به';
    default:
      return null;
  }
}

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  const reqId = req.id as string | undefined;
  if (err instanceof ZodError) {
    return res.status(400).json({ error: 'validation_error', details: err.flatten(), request_id: reqId });
  }
  if (err instanceof HttpError) {
    return res.status(err.status).json({
      error: err.code ?? 'error',
      message: err.message,
      details: err.details,
      request_id: reqId,
    });
  }
  const dbMessage = friendlyDbMessage(err as PgError);
  if (dbMessage) {
    (req.log ?? logger).warn({ err, reqId }, 'mapped db error');
    return res.status(400).json({ error: 'conflict', message: dbMessage, request_id: reqId });
  }
  (req.log ?? logger).error({ err, reqId }, 'unhandled error');
  return res.status(500).json({
    error: 'internal_error',
    message: 'حدث خطأ غير متوقع في الخادم، تم تسجيل تفاصيله لمراجعتها. رقم المرجع: ' + (reqId ?? '—'),
    request_id: reqId,
  });
};
