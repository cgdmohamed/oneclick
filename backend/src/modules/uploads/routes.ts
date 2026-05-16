import { Router } from 'express';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { pool } from '../../db/client.js';
import { badRequest } from '../../utils/errors.js';
import { audit } from '../../utils/audit.js';

const UPLOAD_DIR = path.resolve(process.cwd(), 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const id = crypto.randomBytes(16).toString('hex');
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${id}${ext}`);
  },
});

// SVG intentionally excluded — embedded scripts cause stored XSS when served inline.
const ALLOWED_MIME = new Set(['image/png', 'image/jpeg', 'image/webp', 'application/pdf']);
const ALLOWED_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.pdf']);
const MIME_EXT: Record<string, string[]> = {
  'image/png': ['.png'],
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/webp': ['.webp'],
  'application/pdf': ['.pdf'],
};

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const mime = file.mimetype;
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_MIME.has(mime)) return cb(new Error('Unsupported file type'));
    if (!ALLOWED_EXT.has(ext)) return cb(new Error('Unsupported file extension'));
    if (!MIME_EXT[mime]?.includes(ext)) return cb(new Error('File extension does not match content type'));
    cb(null, true);
  },
});

const router = Router();

/** POST /api/uploads  multipart  field=file, kind=logo|stamp|attachment */
router.post('/', upload.single('file'), async (req, res, next) => {
  try {
    const t = req.tenant!;
    if (!req.file) throw badRequest('Missing file');
    const kind = (req.body.kind as string | undefined) ?? 'attachment';
    const url = `/uploads/${req.file.filename}`;
    const ins = await pool.query(
      `INSERT INTO uploads (company_id, user_id, filename, mime_type, size, url, kind)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [t.companyId, req.auth!.userId, req.file.originalname, req.file.mimetype, req.file.size, url, kind],
    );
    await audit(pool, {
      companyId: t.companyId, userId: req.auth!.userId,
      action: 'upload.create', entity: 'upload', entityId: ins.rows[0].id,
      data: { kind, size: req.file.size, mime: req.file.mimetype },
    });
    res.status(201).json({ data: ins.rows[0] });
  } catch (e) { next(e); }
});

router.get('/', async (req, res, next) => {
  try {
    const t = req.tenant!;
    const rs = await pool.query(`SELECT * FROM uploads WHERE company_id = $1 ORDER BY created_at DESC LIMIT 100`, [t.companyId]);
    res.json({ data: rs.rows });
  } catch (e) { next(e); }
});

export default router;
export { UPLOAD_DIR };
