import fs from 'node:fs';
import path from 'node:path';
import { Router } from 'express';
import multer from 'multer';
import AdmZip from 'adm-zip';
import { v4 as uuid } from 'uuid';
import { AuthedRequest, requireAuth } from '../middleware/auth.js';

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 30 * 1024 * 1024 }
});

function isSafeZipPath(zipEntryPath: string) {
  const normalized = path.posix.normalize(zipEntryPath);
  return !normalized.startsWith('/') && !normalized.startsWith('..') && !normalized.includes('../');
}

function ensureDir(dirPath: string) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

router.post('/upload', requireAuth, upload.single('gameZip'), async (req, res) => {
  const file = req.file;
  if (!file) {
    return res.status(400).json({ message: 'Missing ZIP file upload.' });
  }

  if (!file.originalname.toLowerCase().endsWith('.zip')) {
    return res.status(400).json({ message: 'Only .zip files are supported.' });
  }

  const userId = (req as AuthedRequest).userId;
  const gameId = uuid();

  const baseDir = path.resolve(process.cwd(), 'data', 'users', userId, 'games', gameId);
  const extractedDir = path.join(baseDir, 'files');
  const zipPath = path.join(baseDir, 'upload.zip');

  ensureDir(extractedDir);
  fs.writeFileSync(zipPath, file.buffer);

  const zip = new AdmZip(file.buffer);
  const entries = zip.getEntries();

  let jsonCount = 0;
  let webpCount = 0;

  for (const entry of entries) {
    const entryName = entry.entryName;

    if (!isSafeZipPath(entryName)) {
      return res.status(400).json({ message: 'ZIP contains unsafe paths.' });
    }

    const outputPath = path.join(extractedDir, entryName);

    if (entry.isDirectory) {
      ensureDir(outputPath);
      continue;
    }

    ensureDir(path.dirname(outputPath));
    fs.writeFileSync(outputPath, entry.getData());

    const lowerName = entryName.toLowerCase();
    if (lowerName.endsWith('.json')) {
      jsonCount += 1;
    }
    if (lowerName.endsWith('.webp')) {
      webpCount += 1;
    }
  }

  if (jsonCount < 1 || webpCount < 1) {
    return res.status(400).json({
      message: 'ZIP must include at least one .json file and one or more .webp files.'
    });
  }

  return res.status(201).json({
    gameId,
    message: 'Game uploaded and extracted successfully.',
    jsonFiles: jsonCount,
    webpFiles: webpCount
  });
});

export default router;