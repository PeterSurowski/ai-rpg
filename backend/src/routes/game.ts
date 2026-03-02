import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { ChatMessage, veniceChat } from '../services/venice.js';

const router = Router();

const STARTER_SYSTEM_PROMPT =
  'You are the game master of a mobile-first text RPG. Keep responses immersive, second-person, and concise. End each response with 3 numbered choices.';

const startSchema = z.object({
  storyline: z.literal('City of Doors')
});

const continueSchema = z.object({
  storyline: z.literal('City of Doors'),
  action: z.string().min(1).max(300),
  history: z
    .array(
      z.object({
        role: z.enum(['assistant', 'user']),
        content: z.string().min(1).max(2500)
      })
    )
    .max(12)
});

router.post('/start', requireAuth, async (req, res) => {
  const parsed = startSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: 'Invalid payload.' });
  }

  const messages: ChatMessage[] = [
    { role: 'system', content: STARTER_SYSTEM_PROMPT },
    {
      role: 'user',
      content:
        'Begin the storyline "City of Doors". Start with a vivid intro scene and an immediate decision point. Keep under 180 words.'
    }
  ];

  const text = await veniceChat(messages);
  return res.json({ text });
});

router.post('/continue', requireAuth, async (req, res) => {
  const parsed = continueSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: 'Invalid payload.' });
  }

  const { action, history } = parsed.data;
  const trimmedHistory = history.slice(-8).map((item) => ({ role: item.role, content: item.content as string }));

  const messages: ChatMessage[] = [
    { role: 'system', content: STARTER_SYSTEM_PROMPT },
    ...trimmedHistory,
    { role: 'user', content: action }
  ];

  const text = await veniceChat(messages);
  return res.json({ text });
});

export default router;