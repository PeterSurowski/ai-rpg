import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { v4 as uuid } from 'uuid';
import { env } from '../config.js';
import { get, run } from '../db.js';
import { AuthedRequest, requireAuth } from '../middleware/auth.js';

const router = Router();

type UserRow = { id: string; email: string; password_hash: string };

const authSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8)
});

router.post('/register', async (req, res) => {
  const parsed = authSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: 'Invalid payload.' });
  }

  const { email, password } = parsed.data;
  const existing = await get<UserRow>('SELECT id, email, password_hash FROM users WHERE email = ?', [email]);
  if (existing) {
    return res.status(409).json({ message: 'Email already exists.' });
  }

  const userId = uuid();
  const passwordHash = await bcrypt.hash(password, 10);
  await run('INSERT INTO users (id, email, password_hash) VALUES (?, ?, ?)', [userId, email, passwordHash]);

  const token = jwt.sign({ userId }, env.JWT_SECRET, { expiresIn: '30d' });
  return res.status(201).json({ token, user: { id: userId, email } });
});

router.post('/login', async (req, res) => {
  const parsed = authSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: 'Invalid payload.' });
  }

  const { email, password } = parsed.data;
  const user = await get<UserRow>('SELECT id, email, password_hash FROM users WHERE email = ?', [email]);

  if (!user) {
    return res.status(401).json({ message: 'Invalid credentials.' });
  }

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    return res.status(401).json({ message: 'Invalid credentials.' });
  }

  const token = jwt.sign({ userId: user.id }, env.JWT_SECRET, { expiresIn: '30d' });
  return res.json({ token, user: { id: user.id, email: user.email } });
});

router.get('/me', requireAuth, async (req, res) => {
  const userId = (req as AuthedRequest).userId;
  const user = await get<{ id: string; email: string }>('SELECT id, email FROM users WHERE id = ?', [userId]);
  if (!user) {
    return res.status(404).json({ message: 'User not found.' });
  }
  return res.json(user);
});

export default router;