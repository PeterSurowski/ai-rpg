import fs from 'node:fs';
import path from 'node:path';
import { Router } from 'express';
import multer from 'multer';
import AdmZip from 'adm-zip';
import { z } from 'zod';
import { v4 as uuid } from 'uuid';
import { all, get, run } from '../db.js';
import { AuthedRequest, requireAuth } from '../middleware/auth.js';
import { generateSceneIntro, loadGameForUser, runSceneAction } from '../services/gameEngine.js';

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

function findFirstJsonFile(dirPath: string): string | null {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      const nested = findFirstJsonFile(fullPath);
      if (nested) {
        return nested;
      }
      continue;
    }

    if (entry.isFile() && entry.name.toLowerCase().endsWith('.json')) {
      return fullPath;
    }
  }

  return null;
}

const uploadedGameMetadataSchema = z.object({
  title: z.string().min(1).max(120),
  description: z.string().min(1).max(1200)
});

const playerSchema = z.object({
  name: z.string().min(1).max(80),
  gender: z.string().min(1).max(40),
  background: z.string().min(120).max(6000)
});

const playersPayloadSchema = z.object({
  player: playerSchema,
  support: playerSchema
});

router.get('/', requireAuth, async (req, res) => {
  const userId = (req as AuthedRequest).userId;

  const rows = await all<{
    id: string;
    title: string;
    description: string;
    created_at: string;
    player_count: number;
  }>(
    `SELECT g.id, g.title, g.description, g.created_at,
            (SELECT COUNT(*) FROM game_players gp WHERE gp.game_id = g.id) AS player_count
       FROM games g
      WHERE g.user_id = ?
      ORDER BY g.created_at DESC`,
    [userId]
  );

  const items = rows.map((row) => ({
    id: row.id,
    title: row.title,
    description: row.description,
    createdAt: row.created_at,
    hasPlayers: Number(row.player_count) >= 2
  }));

  return res.json({ items });
});

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
      fs.rmSync(baseDir, { recursive: true, force: true });
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

  if (jsonCount < 1) {
    fs.rmSync(baseDir, { recursive: true, force: true });
    return res.status(400).json({
      message: 'ZIP must include at least one .json file.'
    });
  }

  const firstJsonPath = findFirstJsonFile(extractedDir);
  if (!firstJsonPath) {
    fs.rmSync(baseDir, { recursive: true, force: true });
    return res.status(400).json({ message: 'Could not locate a game JSON file.' });
  }

  let gameMetadata: z.infer<typeof uploadedGameMetadataSchema>;
  try {
    const parsedGameJson = JSON.parse(fs.readFileSync(firstJsonPath, 'utf-8'));
    gameMetadata = uploadedGameMetadataSchema.parse(parsedGameJson);
  } catch {
    fs.rmSync(baseDir, { recursive: true, force: true });
    return res.status(400).json({ message: 'Game JSON must include valid title and description.' });
  }

  await run(
    `INSERT INTO games (id, user_id, title, description, zip_path, files_path, json_file_count, webp_file_count)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [gameId, userId, gameMetadata.title, gameMetadata.description, zipPath, extractedDir, jsonCount, webpCount]
  );

  return res.status(201).json({
    gameId,
    title: gameMetadata.title,
    description: gameMetadata.description,
    message: 'Game uploaded and extracted successfully.',
    jsonFiles: jsonCount,
    webpFiles: webpCount
  });
});

router.post('/:gameId/players', requireAuth, async (req, res) => {
  const gameId = String(req.params.gameId);
  const userId = (req as AuthedRequest).userId;

  const game = await get<{ id: string }>('SELECT id FROM games WHERE id = ? AND user_id = ?', [gameId, userId]);
  if (!game) {
    return res.status(404).json({ message: 'Game not found.' });
  }

  const parsed = playersPayloadSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: 'Invalid payload.' });
  }

  const { player, support } = parsed.data;

  await run(
    `INSERT INTO game_players (id, game_id, role, name, gender, background, updated_at)
     VALUES (?, ?, 'player', ?, ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(game_id, role)
     DO UPDATE SET name = excluded.name, gender = excluded.gender, background = excluded.background, updated_at = CURRENT_TIMESTAMP`,
    [uuid(), gameId, player.name, player.gender, player.background]
  );

  await run(
    `INSERT INTO game_players (id, game_id, role, name, gender, background, updated_at)
     VALUES (?, ?, 'support', ?, ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(game_id, role)
     DO UPDATE SET name = excluded.name, gender = excluded.gender, background = excluded.background, updated_at = CURRENT_TIMESTAMP`,
    [uuid(), gameId, support.name, support.gender, support.background]
  );

  return res.status(201).json({ message: 'Players saved.' });
});

const playStartSchema = z.object({
  sceneId: z.string().min(1).optional()
});

const historyEntrySchema = z.object({
  role: z.enum(['assistant', 'user']),
  content: z.string().min(1).max(4000)
});

const playActionSchema = z.object({
  sceneId: z.string().min(1),
  input: z.string().min(1).max(600),
  history: z.array(historyEntrySchema).max(20).optional()
});

type SceneHistoryRow = {
  id: number;
  scene_id: string;
  scene_title: string;
};

type NavigationState = {
  canGoBack: boolean;
  canGoForward: boolean;
};

async function getHistoryRowById(gameId: string, userId: string, historyId: number) {
  return get<SceneHistoryRow>(
    'SELECT id, scene_id, scene_title FROM game_scene_history WHERE game_id = ? AND user_id = ? AND id = ?',
    [gameId, userId, historyId]
  );
}

async function getPreviousHistoryRow(gameId: string, userId: string, historyId: number) {
  return get<SceneHistoryRow>(
    'SELECT id, scene_id, scene_title FROM game_scene_history WHERE game_id = ? AND user_id = ? AND id < ? ORDER BY id DESC LIMIT 1',
    [gameId, userId, historyId]
  );
}

async function getNextHistoryRow(gameId: string, userId: string, historyId: number) {
  return get<SceneHistoryRow>(
    'SELECT id, scene_id, scene_title FROM game_scene_history WHERE game_id = ? AND user_id = ? AND id > ? ORDER BY id ASC LIMIT 1',
    [gameId, userId, historyId]
  );
}

async function appendSceneHistory(gameId: string, userId: string, sceneId: string, sceneTitle: string) {
  await run('INSERT INTO game_scene_history (game_id, user_id, scene_id, scene_title) VALUES (?, ?, ?, ?)', [
    gameId,
    userId,
    sceneId,
    sceneTitle
  ]);

  const inserted = await get<SceneHistoryRow>(
    'SELECT id, scene_id, scene_title FROM game_scene_history WHERE game_id = ? AND user_id = ? ORDER BY id DESC LIMIT 1',
    [gameId, userId]
  );

  if (!inserted) {
    throw new Error('Failed to append scene history entry.');
  }

  return inserted;
}

async function ensureTimelineEntry(gameId: string, userId: string, sceneId: string, sceneTitle: string, currentHistoryId: number | null) {
  if (currentHistoryId) {
    const currentEntry = await getHistoryRowById(gameId, userId, currentHistoryId);
    if (currentEntry?.scene_id === sceneId) {
      return currentEntry;
    }
  }

  if (currentHistoryId) {
    await run('DELETE FROM game_scene_history WHERE game_id = ? AND user_id = ? AND id > ?', [gameId, userId, currentHistoryId]);
  }

  return appendSceneHistory(gameId, userId, sceneId, sceneTitle);
}

async function setCurrentSceneAndCursor(gameId: string, userId: string, sceneId: string, historyId: number) {
  await run('UPDATE games SET current_scene_id = ?, current_scene_history_id = ? WHERE id = ? AND user_id = ?', [
    sceneId,
    historyId,
    gameId,
    userId
  ]);
}

async function resetSceneHistory(gameId: string, userId: string, sceneId: string, sceneTitle: string) {
  await run('DELETE FROM game_scene_history WHERE game_id = ? AND user_id = ?', [gameId, userId]);

  const inserted = await appendSceneHistory(gameId, userId, sceneId, sceneTitle);
  await setCurrentSceneAndCursor(gameId, userId, sceneId, inserted.id);
  return inserted;
}

async function getNavigationState(gameId: string, userId: string, currentHistoryId: number | null): Promise<NavigationState> {
  if (!currentHistoryId) {
    return { canGoBack: false, canGoForward: false };
  }

  const [previousEntry, nextEntry] = await Promise.all([
    getPreviousHistoryRow(gameId, userId, currentHistoryId),
    getNextHistoryRow(gameId, userId, currentHistoryId)
  ]);

  return {
    canGoBack: Boolean(previousEntry),
    canGoForward: Boolean(nextEntry)
  };
}

async function ensureCurrentHistoryEntry(gameId: string, userId: string, sceneId: string, sceneTitle: string, currentHistoryId: number | null) {
  if (currentHistoryId) {
    const existing = await getHistoryRowById(gameId, userId, currentHistoryId);
    if (existing?.scene_id === sceneId) {
      return existing;
    }
  }

  return appendSceneHistory(gameId, userId, sceneId, sceneTitle);
}

router.post('/:gameId/play/start', requireAuth, async (req, res) => {
  const gameId = String(req.params.gameId);
  const userId = (req as AuthedRequest).userId;

  const parsed = playStartSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({ message: 'Invalid payload.' });
  }

  const loaded = await loadGameForUser(gameId, userId);
  if (!loaded) {
    return res.status(404).json({ message: 'Game not found.' });
  }

  const bearerToken = req.headers.authorization?.startsWith('Bearer ')
    ? req.headers.authorization.replace('Bearer ', '')
    : undefined;

  const requestedSceneId = parsed.data.sceneId;
  const savedSceneId = loaded.gameRecord.current_scene_id;

  const candidateSceneId = requestedSceneId ?? savedSceneId ?? loaded.game.startSceneId;
  const initialSceneId = loaded.game.scenes[candidateSceneId] ? candidateSceneId : loaded.game.startSceneId;

  const initialScene = loaded.game.scenes[initialSceneId];
  if (!initialScene) {
    return res.status(400).json({ message: 'Game start scene is invalid.' });
  }

  const currentHistoryId = loaded.gameRecord.current_scene_history_id;
  const currentEntry = await ensureCurrentHistoryEntry(gameId, userId, initialSceneId, initialScene.title, currentHistoryId);
  await setCurrentSceneAndCursor(gameId, userId, initialSceneId, currentEntry.id);

  const response = await generateSceneIntro(gameId, initialSceneId, loaded.game, loaded.players, bearerToken);
  const navigationState = await getNavigationState(gameId, userId, currentEntry.id);
  return res.json({ ...response, ...navigationState });
});

router.post('/:gameId/play/action', requireAuth, async (req, res) => {
  const gameId = String(req.params.gameId);
  const userId = (req as AuthedRequest).userId;

  const parsed = playActionSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: 'Invalid payload.' });
  }

  const loaded = await loadGameForUser(gameId, userId);
  if (!loaded) {
    return res.status(404).json({ message: 'Game not found.' });
  }

  const bearerToken = req.headers.authorization?.startsWith('Bearer ')
    ? req.headers.authorization.replace('Bearer ', '')
    : undefined;

  const savedSceneId = loaded.gameRecord.current_scene_id;
  if (savedSceneId && parsed.data.sceneId !== savedSceneId) {
    return res.status(409).json({
      message: 'Action is out of date for current scene. Please try again.',
      currentSceneId: savedSceneId
    });
  }

  const candidateSceneId = savedSceneId ?? parsed.data.sceneId;
  const activeSceneId = loaded.game.scenes[candidateSceneId] ? candidateSceneId : loaded.game.startSceneId;

  const response = await runSceneAction(
    parsed.data.input,
    activeSceneId,
    gameId,
    loaded.game,
    loaded.players,
    parsed.data.history,
    bearerToken
  );

  const currentHistoryId = loaded.gameRecord.current_scene_history_id;
  let historyEntry = currentHistoryId ? await getHistoryRowById(gameId, userId, currentHistoryId) : undefined;

  if (!historyEntry) {
    const activeScene = loaded.game.scenes[activeSceneId];
    historyEntry = await appendSceneHistory(gameId, userId, activeSceneId, activeScene.title);
  }

  if (response.sceneId !== activeSceneId) {
    const nextEntry = await ensureTimelineEntry(gameId, userId, response.sceneId, response.sceneTitle, historyEntry.id);
    await setCurrentSceneAndCursor(gameId, userId, response.sceneId, nextEntry.id);
    const navigationState = await getNavigationState(gameId, userId, nextEntry.id);
    return res.json({ ...response, ...navigationState });
  }

  await setCurrentSceneAndCursor(gameId, userId, response.sceneId, historyEntry.id);
  const navigationState = await getNavigationState(gameId, userId, historyEntry.id);
  return res.json({ ...response, ...navigationState });
});

router.post('/:gameId/play/restart', requireAuth, async (req, res) => {
  const gameId = String(req.params.gameId);
  const userId = (req as AuthedRequest).userId;

  const loaded = await loadGameForUser(gameId, userId);
  if (!loaded) {
    return res.status(404).json({ message: 'Game not found.' });
  }

  const bearerToken = req.headers.authorization?.startsWith('Bearer ')
    ? req.headers.authorization.replace('Bearer ', '')
    : undefined;

  const restartSceneId = loaded.game.startSceneId;
  if (!loaded.game.scenes[restartSceneId]) {
    return res.status(400).json({ message: 'Game start scene is invalid.' });
  }

  const restartScene = loaded.game.scenes[restartSceneId];

  const resetEntry = await resetSceneHistory(gameId, userId, restartSceneId, restartScene.title);

  const response = await generateSceneIntro(gameId, restartSceneId, loaded.game, loaded.players, bearerToken);
  const navigationState = await getNavigationState(gameId, userId, resetEntry.id);
  return res.json({ ...response, ...navigationState });
});

router.post('/:gameId/play/back', requireAuth, async (req, res) => {
  const gameId = String(req.params.gameId);
  const userId = (req as AuthedRequest).userId;

  const loaded = await loadGameForUser(gameId, userId);
  if (!loaded) {
    return res.status(404).json({ message: 'Game not found.' });
  }

  const bearerToken = req.headers.authorization?.startsWith('Bearer ')
    ? req.headers.authorization.replace('Bearer ', '')
    : undefined;

  const currentHistoryId = loaded.gameRecord.current_scene_history_id;
  if (!currentHistoryId) {
    return res.status(400).json({ message: 'No previous scene available.' });
  }

  const previousEntry = await getPreviousHistoryRow(gameId, userId, currentHistoryId);
  if (!previousEntry) {
    return res.status(400).json({ message: 'No previous scene available.' });
  }

  await setCurrentSceneAndCursor(gameId, userId, previousEntry.scene_id, previousEntry.id);

  const response = await generateSceneIntro(gameId, previousEntry.scene_id, loaded.game, loaded.players, bearerToken);
  const navigationState = await getNavigationState(gameId, userId, previousEntry.id);
  return res.json({ ...response, ...navigationState });
});

router.post('/:gameId/play/forward', requireAuth, async (req, res) => {
  const gameId = String(req.params.gameId);
  const userId = (req as AuthedRequest).userId;

  const loaded = await loadGameForUser(gameId, userId);
  if (!loaded) {
    return res.status(404).json({ message: 'Game not found.' });
  }

  const bearerToken = req.headers.authorization?.startsWith('Bearer ')
    ? req.headers.authorization.replace('Bearer ', '')
    : undefined;

  const currentHistoryId = loaded.gameRecord.current_scene_history_id;
  if (!currentHistoryId) {
    return res.status(400).json({ message: 'No forward scene available.' });
  }

  const nextEntry = await getNextHistoryRow(gameId, userId, currentHistoryId);
  if (!nextEntry) {
    return res.status(400).json({ message: 'No forward scene available.' });
  }

  await setCurrentSceneAndCursor(gameId, userId, nextEntry.scene_id, nextEntry.id);

  const response = await generateSceneIntro(gameId, nextEntry.scene_id, loaded.game, loaded.players, bearerToken);
  const navigationState = await getNavigationState(gameId, userId, nextEntry.id);
  return res.json({ ...response, ...navigationState });
});

router.get('/:gameId/assets/*assetPath', requireAuth, async (req, res) => {
  const gameId = String(req.params.gameId);
  const userId = (req as AuthedRequest).userId;

  const game = await get<{ files_path: string }>('SELECT files_path FROM games WHERE id = ? AND user_id = ?', [gameId, userId]);
  if (!game) {
    return res.status(404).json({ message: 'Game not found.' });
  }

  const wildcardValue = req.params.assetPath;
  const rawAssetPath = Array.isArray(wildcardValue) ? wildcardValue.join('/') : String(wildcardValue ?? '');
  const normalizedAssetPath = path.posix
    .normalize(rawAssetPath.replace(/\\/g, '/'))
    .replace(/^(?:assets|files)\//, '');
  if (!normalizedAssetPath || normalizedAssetPath.startsWith('/') || normalizedAssetPath.startsWith('..') || normalizedAssetPath.includes('../')) {
    return res.status(400).json({ message: 'Invalid asset path.' });
  }

  const fullPath = path.resolve(game.files_path, normalizedAssetPath);
  const resolvedBase = path.resolve(game.files_path);
  if (!fullPath.startsWith(resolvedBase)) {
    return res.status(400).json({ message: 'Invalid asset path.' });
  }

  let resolvedFilePath = fullPath;
  if (!fs.existsSync(resolvedFilePath) || !fs.statSync(resolvedFilePath).isFile()) {
    const ext = path.extname(fullPath).toLowerCase();
    const extFallbackOrder = ['.webp', '.png', '.jpg', '.jpeg'];
    const basenameWithoutExt = ext ? fullPath.slice(0, -ext.length) : fullPath;

    for (const candidateExt of extFallbackOrder) {
      if (candidateExt === ext) {
        continue;
      }

      const candidatePath = `${basenameWithoutExt}${candidateExt}`;
      if (candidatePath.startsWith(resolvedBase) && fs.existsSync(candidatePath) && fs.statSync(candidatePath).isFile()) {
        resolvedFilePath = candidatePath;
        break;
      }
    }
  }

  if (!fs.existsSync(resolvedFilePath) || !fs.statSync(resolvedFilePath).isFile()) {
    return res.status(404).json({ message: 'Asset not found.' });
  }

  return res.sendFile(resolvedFilePath);
});

export default router;