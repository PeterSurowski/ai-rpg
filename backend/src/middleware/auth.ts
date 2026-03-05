import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config.js';

type TokenPayload = { userId: string };

export type AuthedRequest = Request & { userId: string };

function getRequestToken(req: Request) {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.replace('Bearer ', '');
  }

  const tokenQuery = req.query.token;
  if (typeof tokenQuery === 'string' && tokenQuery.trim()) {
    return tokenQuery.trim();
  }

  if (Array.isArray(tokenQuery) && typeof tokenQuery[0] === 'string' && tokenQuery[0].trim()) {
    return tokenQuery[0].trim();
  }

  return null;
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = getRequestToken(req);
  if (!token) {
    return res.status(401).json({ message: 'Missing bearer token.' });
  }

  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as TokenPayload;
    (req as AuthedRequest).userId = payload.userId;
    next();
  } catch {
    return res.status(401).json({ message: 'Invalid token.' });
  }
}