/**
 * SEC-04 — Split uploads into public (logos/stamps embedded in public
 * invoices) and private (attachments). Public files are served as static
 * assets; private files require auth + tenant membership and are streamed
 * by id through this router.
 */
import { Router } from 'express';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { pool } from '../../db/client.js';
import { badRequest, forbidden, notFound } from '../../utils/errors.js';
import { audit } from '../../utils/audit.js';
import { parsePagination } from '../../utils/pagination.js';

const UPLOAD_ROOT    = path.resolve(process.cwd(), 'uploads');
const UPLOAD_PUBLIC  = path.join(UPLOAD_ROOT, 'public');
const UPLOAD_PRIVATE = path.join(UPLOAD_ROOT, 'private');
fs.mkdirSync(UPLOAD_PUBLIC,  { recursive: true });
fs.mkdirSync(UPLOAD_PRIVATE, { recursive: true });

const ALLOWED_MIME = new Set(['image/png', 'image/jpeg', 'image/webp', 'application/pdf']);
const ALLOWED_EXT  = new Set(['.png', '.jpg', '.jpeg', '.webp', '.pdf']);
const MIME_EXT: Record<string, string[]> = {
  'image/png':       ['.png'],
  'image/jpeg':      ['.jpg', '.jpeg'],
  'image/webp':      ['.webp'],
  'application/pdf': ['.pdf'],
};
const PUBLIC_KINDS = new Set(['logo', 'stamp', 'image']);

const storage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const kind = (req.body?.kind as string | undefined)
      ?? (req.query?.kind as string | undefined)
      ?? 'attachment';
    cb(null, PUBLIC_KINDS.has(kind) ? UPLOAD_PUBLIC : UPLOAD_PRIVATE);
  },
  filename: (_req, file, cb) => {
    const id = crypto.randomBytes(16).toString('hex');
    cb(null, `${id}${path.extname(file.originalname).toLowerCase()}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const mime = file.mimetype;
    const ext  = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_MIME.has(mime)) return cb(new Error('Unsupported file type'));
    if (!ALLOWED_EXT.has(ext))   return cb(new Error('Unsupported file extension'));
    if (!MIME_EXT[mime]?.includes(ext)) return cb(new Error('File extension does not match content type'));
    cb(null, true);
  },
});

const router = Router();

/** Middleware: reject requests without a company context, unless the caller is a super admin. */
function requireCompanyContext(req: import('express').Request, _res: import('express').Response, next: import('express').NextFunction) {
  if (!req.tenant?.companyId && !req.tenant?.isSuperAdmin) return next(badRequest('Company context required for uploads'));
  next();
}

/** POST /api/uploads  multipart  field=file, kind=logo|stamp|attachment */
router.post('/', requireCompanyContext, upload.single('file'), async (req, res, next) => {
  try {
    const t = req.tenant!;
    if (!req.file) throw badRequest('Missing file');
    const kind     = (req.body.kind as string | undefined)
      ?? (req.query.kind as string | undefined)
      ?? 'attachment';
    const isPublic = PUBLIC_KINDS.has(kind);
    const disk     = req.file.filename;            // random opaque on-disk name

    // Super admins operating at platform level have no company context; use null.
    const companyId = t.companyId ?? null;

    // Insert with placeholder url then patch it once we have the row id.
    const ins = await t.db.query(
      `INSERT INTO uploads
         (company_id, user_id, filename, mime_type, size, url, kind, is_public, disk_name)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
      [
        companyId, req.auth!.userId, req.file.originalname,
        req.file.mimetype, req.file.size, '', kind, isPublic, disk,
      ],
    );
    const id  = ins.rows[0].id as string;
    const url = isPublic ? `/uploads/public/${disk}` : `/api/uploads/file/${id}`;
    await t.db.query(`UPDATE uploads SET url = $1 WHERE id = $2`, [url, id]);

    await audit(pool, {
      companyId, userId: req.auth!.userId,
      action: 'upload.create', entity: 'upload', entityId: id,
      data: { kind, size: req.file.size, mime: req.file.mimetype, is_public: isPublic },
    });
    res.status(201).json({ data: { id, url, kind, is_public: isPublic } });
  } catch (e) { next(e); }
});

router.get('/', async (req, res, next) => {
  try {
    const t = req.tenant!;
    if (!t.companyId) throw badRequest('Company context required for uploads');
    const p = parsePagination(req);
    const totalQ = await t.db.query(
      `SELECT count(*)::int AS count FROM uploads WHERE company_id = $1`,
      [t.companyId],
    );
    const a = p.applyTo(
      `SELECT id, filename, mime_type, size, url, kind, is_public, created_at
         FROM uploads WHERE company_id = $1
         ORDER BY created_at DESC`,
      [t.companyId],
    );
    const rs = await t.db.query(a.sql, a.params);
    res.json(p.respond(rs.rows, Number(totalQ.rows[0].count)));
  } catch (e) { next(e); }
});

/** GET /api/uploads/file/:id — authenticated download (tenant-scoped). */
router.get('/file/:id', async (req, res, next) => {
  try {
    const t = req.tenant!;
    const rs = await t.db.query(
      `SELECT company_id, mime_type, disk_name, is_public
         FROM uploads WHERE id = $1`,
      [req.params.id],
    );
    if (!rs.rowCount) throw notFound('File not found');
    const f = rs.rows[0] as {
      company_id: string; mime_type: string; disk_name: string | null; is_public: boolean;
    };
    if (!t.isSuperAdmin && f.company_id !== t.companyId) throw forbidden();
    if (!f.disk_name) throw notFound('File missing');
    const abs = path.join(f.is_public ? UPLOAD_PUBLIC : UPLOAD_PRIVATE, f.disk_name);
    if (!fs.existsSync(abs)) throw notFound('File missing on disk');
    res.setHeader('Content-Type', f.mime_type);
    res.setHeader('Cache-Control', 'private, max-age=600');
    fs.createReadStream(abs).pipe(res);
  } catch (e) { next(e); }
});

export default router;
export { UPLOAD_PUBLIC, UPLOAD_ROOT };
