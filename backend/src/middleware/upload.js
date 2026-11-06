// File uploads: payment receipts and event map images.
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const UPLOAD_ROOT = path.join(__dirname, '..', '..', 'uploads');
const MAX_MB = Number(process.env.MAX_UPLOAD_MB) || 5;

function makeUploader(subfolder, allowedTypes, typeMessage) {
  const dir = path.join(UPLOAD_ROOT, subfolder);
  fs.mkdirSync(dir, { recursive: true });

  const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, dir),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase() || '';
      cb(null, `${subfolder}-${Date.now()}-${Math.round(Math.random() * 1e6)}${ext}`);
    },
  });

  return multer({
    storage,
    limits: { fileSize: MAX_MB * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
      if (allowedTypes.includes(file.mimetype)) return cb(null, true);
      const err = new Error(typeMessage);
      err.status = 400;
      cb(err);
    },
  });
}

const uploadReceipt = makeUploader('receipts', ['image/jpeg', 'image/png', 'application/pdf'],
  'Receipt must be a JPG, PNG or PDF file.');
const uploadMapImage = makeUploader('maps', ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
  'Map image must be a JPG, PNG, GIF or WEBP file.');

module.exports = { uploadReceipt, uploadMapImage, MAX_MB };
