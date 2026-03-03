import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { all, get } from '../db.js';
import { ChatMessage, veniceChat } from './venice.js';

const nextSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('scene'), sceneId: z.string().min(1) }),
  z.object({ type: z.literal('random_group'), groupId: z.string().min(1) }),
  z.object({ type: z.literal('end'), endingText: z.string().min(1).max(3000).optional() })
]);

const exitVectorSchema = z.object({
  id: z.string().min(1),
  intent: z.string().min(1).max(500),
  hint: z.string().min(1).max(500),
  matchExamples: z.array(z.string().min(1).max(200)).min(1),
  next: nextSchema
});

const sceneSchema = z.object({
  title: z.string().min(1).max(120),
  basePrompt: z.string().min(1).max(5000),
  onFreeformPrompt: z.string().min(1).max(1500),
  backgroundImage: z.string().min(1).optional(),
  exitVectors: z.array(exitVectorSchema).min(1).max(4)
});

const gameDefinitionSchema = z.object({
  id: z.string().min(1).max(80),
  title: z.string().min(1).max(120),
  description: z.string().min(1).max(1200),
  startSceneId: z.string().min(1),
  randomGroups: z.record(z.string(), z.array(z.string().min(1)).min(1)),
  scenes: z.record(z.string(), sceneSchema)
});

export type GameDefinition = z.infer<typeof gameDefinitionSchema>;
export type SceneDefinition = z.infer<typeof sceneSchema>;

type PlayerRow = {
  role: 'player' | 'support';
  name: string;
  gender: string;
  background: string;
};

type GameRecord = {
  id: string;
  user_id: string;
  files_path: string;
  current_scene_id: string | null;
};

const exitDecisionSchema = z.object({
  exitVectorId: z.string().min(1).nullable()
});

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

function normalizeInput(input: string) {
  return input.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

const STOP_WORDS = new Set(['a', 'an', 'the', 'to', 'for', 'of', 'and', 'or', 'in', 'on', 'at', 'with']);

function normalizeTerm(term: string) {
  if (term.endsWith('ies') && term.length > 4) {
    return `${term.slice(0, -3)}y`;
  }

  if (term.endsWith('s') && !term.endsWith('ss') && term.length > 3) {
    return term.slice(0, -1);
  }

  return term;
}

function toMatchTerms(input: string) {
  return normalizeInput(input)
    .split(' ')
    .filter(Boolean)
    .map((term) => normalizeTerm(term))
    .filter((term) => term.length > 1 && !STOP_WORDS.has(term));
}

function toTerms(input: string) {
  return normalizeInput(input).split(' ').filter(Boolean);
}

function matchesExitVector(action: string, matchExamples: string[]) {
  const normalizedAction = normalizeInput(action);
  const actionTerms = toTerms(action);
  const actionTermSet = new Set(actionTerms);

  for (const example of matchExamples) {
    const normalizedExample = normalizeInput(example);
    if (!normalizedExample) {
      continue;
    }

    if (normalizedAction === normalizedExample) {
      return true;
    }

    if (normalizedAction.includes(normalizedExample) && normalizedExample.split(' ').length >= 3) {
      return true;
    }

    const exampleTerms = toMatchTerms(normalizedExample);

    if (exampleTerms.length === 0) {
      continue;
    }

    if (exampleTerms.length === 1) {
      if (actionTermSet.has(normalizeTerm(exampleTerms[0]))) {
        return true;
      }
      continue;
    }

    const normalizedActionTermSet = new Set(toMatchTerms(action));
    const matchedTermCount = exampleTerms.filter((term) => normalizedActionTermSet.has(term)).length;
    if (matchedTermCount / exampleTerms.length >= 0.8) {
      return true;
    }
  }

  return false;
}

function extractJsonObject(text: string) {
  const trimmed = text.trim();

  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    return trimmed;
  }

  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fencedMatch?.[1]) {
    const candidate = fencedMatch[1].trim();
    if (candidate.startsWith('{') && candidate.endsWith('}')) {
      return candidate;
    }
  }

  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1);
  }

  return null;
}

async function classifyExitWithVenice(
  action: string,
  scene: SceneDefinition,
  players: Awaited<ReturnType<typeof loadPlayers>>
): Promise<z.infer<typeof exitVectorSchema> | null> {
  const optionsText = scene.exitVectors
    .map((vector) => `- id: ${vector.id}\n  intent: ${vector.intent}\n  examples: ${vector.matchExamples.join(' | ')}`)
    .join('\n');

  const buildMessages = (strictJsonOnly: boolean): ChatMessage[] => [
    {
      role: 'system',
      content:
        'You are an intent classifier for a scene-based text RPG. Choose at most one exit vector id from the provided list for the player action. Match by semantic intent, not exact wording. If the action means something similar to an exit vector intent, select that id. If no exit is semantically triggered, return null. Never invent an id.'
    },
    { role: 'user', content: buildPlayerContext(players) },
    { role: 'user', content: `Scene title: ${scene.title}` },
    { role: 'user', content: `Player action: ${action}` },
    { role: 'user', content: `Available exit vectors:\n${optionsText}` },
    {
      role: 'user',
      content: strictJsonOnly
        ? 'Return exactly one single-line JSON object with this exact shape and no extra text: {"exitVectorId": "<id-or-null>"}.'
        : 'Respond with ONLY valid JSON in this exact shape: {"exitVectorId": "<id-or-null>"}.'
    }
  ];

  const tryClassify = async (strictJsonOnly: boolean) => {
    const raw = await veniceChat(buildMessages(strictJsonOnly));
    const jsonCandidate = extractJsonObject(raw);
    if (!jsonCandidate) {
      return null;
    }

    const parsed = JSON.parse(jsonCandidate);
    const decision = exitDecisionSchema.safeParse(parsed);
    if (!decision.success) {
      return null;
    }

    const exitVectorId = decision.data.exitVectorId;
    if (!exitVectorId) {
      return null;
    }

    return scene.exitVectors.find((vector) => vector.id === exitVectorId) ?? null;
  };

  try {
    const firstAttempt = await tryClassify(false);
    if (firstAttempt) {
      return firstAttempt;
    }

    return await tryClassify(true);
  } catch {
    return null;
  }
}

function resolveBackgroundUrl(gameId: string, backgroundImage?: string) {
  if (!backgroundImage) {
    return null;
  }

  const normalized = path.posix.normalize(backgroundImage.replace(/\\/g, '/'));
  if (normalized.startsWith('/') || normalized.startsWith('..') || normalized.includes('../')) {
    return null;
  }

  return `/api/games/${gameId}/assets/${normalized}`;
}

function resolveNextSceneId(next: z.infer<typeof nextSchema>, game: GameDefinition) {
  if (next.type === 'scene') {
    return next.sceneId;
  }

  if (next.type === 'random_group') {
    const pool = game.randomGroups[next.groupId] ?? [];
    if (pool.length === 0) {
      throw new Error(`Random group '${next.groupId}' is empty or missing.`);
    }

    const randomIndex = Math.floor(Math.random() * pool.length);
    return pool[randomIndex];
  }

  return null;
}

async function loadPlayers(gameId: string) {
  const rows = await all<PlayerRow>('SELECT role, name, gender, background FROM game_players WHERE game_id = ?', [gameId]);
  const player = rows.find((row) => row.role === 'player');
  const support = rows.find((row) => row.role === 'support');

  if (!player || !support) {
    throw new Error('Player profiles are missing for this game.');
  }

  return { player, support };
}

export async function loadGameForUser(gameId: string, userId: string) {
  const gameRecord = await get<GameRecord>('SELECT id, user_id, files_path, current_scene_id FROM games WHERE id = ? AND user_id = ?', [
    gameId,
    userId
  ]);

  if (!gameRecord) {
    return null;
  }

  const jsonPath = findFirstJsonFile(gameRecord.files_path);
  if (!jsonPath) {
    throw new Error('No game .json file was found in uploaded files.');
  }

  const parsedJson = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
  const game = gameDefinitionSchema.parse(parsedJson);

  return {
    gameRecord,
    game,
    players: await loadPlayers(gameId)
  };
}

function buildPlayerContext(players: Awaited<ReturnType<typeof loadPlayers>>) {
  return [
    'Player context:',
    `Main player name: ${players.player.name}`,
    `Main player gender: ${players.player.gender}`,
    `Main player background: ${players.player.background}`,
    `Support character name: ${players.support.name}`,
    `Support character gender: ${players.support.gender}`,
    `Support character background: ${players.support.background}`
  ].join('\n');
}

export async function generateSceneIntro(gameId: string, sceneId: string, game: GameDefinition, players: Awaited<ReturnType<typeof loadPlayers>>) {
  const scene = game.scenes[sceneId];
  if (!scene) {
    throw new Error(`Unknown scene '${sceneId}'.`);
  }

  const messages: ChatMessage[] = [
    {
      role: 'system',
      content:
        'You are a text-RPG narrator. Keep output to 1-5 sentences unless explicitly asked otherwise. Keep prose immersive and actionable.'
    },
    { role: 'user', content: buildPlayerContext(players) },
    { role: 'user', content: `Scene title: ${scene.title}` },
    { role: 'user', content: `Scene setup: ${scene.basePrompt}` },
    {
      role: 'user',
      content: 'Introduce this scene and set immediate stakes. End with one concise question prompting player action.'
    }
  ];

  const text = await veniceChat(messages);

  return {
    sceneId,
    sceneTitle: scene.title,
    text,
    backgroundImageUrl: resolveBackgroundUrl(gameId, scene.backgroundImage),
    ended: false
  };
}

export async function runSceneAction(input: string, sceneId: string, gameId: string, game: GameDefinition, players: Awaited<ReturnType<typeof loadPlayers>>) {
  const scene = game.scenes[sceneId];
  if (!scene) {
    throw new Error(`Unknown scene '${sceneId}'.`);
  }

  const trimmedInput = input.trim();
  const isHint = trimmedInput.toUpperCase() === 'HINT';

  if (isHint) {
    const hintText =
      scene.exitVectors.length === 1
        ? `Hint: ${scene.exitVectors[0].hint}`
        : `Hints:\n${scene.exitVectors.map((vector, index) => `${index + 1}. ${vector.hint}`).join('\n')}`;

    return {
      sceneId,
      sceneTitle: scene.title,
      text: hintText,
      backgroundImageUrl: resolveBackgroundUrl(gameId, scene.backgroundImage),
      ended: false
    };
  }

  const matchedExit =
    (await classifyExitWithVenice(trimmedInput, scene, players)) ??
    scene.exitVectors.find((vector) => matchesExitVector(trimmedInput, vector.matchExamples));

  if (!matchedExit) {
    const freeformMessages: ChatMessage[] = [
      {
        role: 'system',
        content:
          'You are a text-RPG narrator. Keep output strictly 1-5 sentences. Do not move to another scene. Do not mention hidden mechanics.'
      },
      { role: 'user', content: buildPlayerContext(players) },
      { role: 'user', content: `Scene title: ${scene.title}` },
      { role: 'user', content: `Scene setup: ${scene.basePrompt}` },
      { role: 'user', content: `Player action: ${trimmedInput}` },
      { role: 'user', content: scene.onFreeformPrompt }
    ];

    const text = await veniceChat(freeformMessages);
    return {
      sceneId,
      sceneTitle: scene.title,
      text,
      backgroundImageUrl: resolveBackgroundUrl(gameId, scene.backgroundImage),
      ended: false
    };
  }

  const nextSceneId = resolveNextSceneId(matchedExit.next, game);

  if (!nextSceneId) {
    const endingText = matchedExit.next.type === 'end' ? matchedExit.next.endingText : undefined;
    const endingMessages: ChatMessage[] = [
      {
        role: 'system',
        content: 'You are a text-RPG narrator. This is an ending beat. You may use up to 8 sentences.'
      },
      { role: 'user', content: buildPlayerContext(players) },
      { role: 'user', content: `Current scene: ${scene.title}` },
      { role: 'user', content: `Triggered exit intent: ${matchedExit.intent}` },
      {
        role: 'user',
        content: `Narrate a satisfying ending for this branch.${endingText ? ` Required ending note: ${endingText}` : ''}`
      }
    ];

    const text = await veniceChat(endingMessages);
    return {
      sceneId,
      sceneTitle: scene.title,
      text,
      backgroundImageUrl: resolveBackgroundUrl(gameId, scene.backgroundImage),
      ended: true
    };
  }

  const nextScene = game.scenes[nextSceneId];
  if (!nextScene) {
    throw new Error(`Next scene '${nextSceneId}' does not exist.`);
  }

  const transitionMessages: ChatMessage[] = [
    {
      role: 'system',
      content: 'You are a text-RPG narrator. Keep output to 2-6 sentences for transition scenes.'
    },
    { role: 'user', content: buildPlayerContext(players) },
    { role: 'user', content: `Previous scene: ${scene.title}` },
    { role: 'user', content: `Triggered exit intent: ${matchedExit.intent}` },
    { role: 'user', content: `Next scene title: ${nextScene.title}` },
    { role: 'user', content: `Next scene setup: ${nextScene.basePrompt}` },
    { role: 'user', content: 'Narrate the successful action and transition into the next scene.' }
  ];

  const text = await veniceChat(transitionMessages);

  return {
    sceneId: nextSceneId,
    sceneTitle: nextScene.title,
    text,
    backgroundImageUrl: resolveBackgroundUrl(gameId, nextScene.backgroundImage),
    ended: false
  };
}
