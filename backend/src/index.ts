import cors from 'cors';
import express from 'express';
import { env } from './config.js';
import { initDb } from './db.js';
import authRoutes from './routes/auth.js';
import gameRoutes from './routes/game.js';
import gamesRoutes from './routes/games.js';

const app = express();

app.use(cors({ origin: env.CORS_ORIGIN }));
app.use(express.json({ limit: '1mb' }));

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api/auth', authRoutes);
app.use('/api/game', gameRoutes);
app.use('/api/games', gamesRoutes);

app.use((error: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(error);
  res.status(500).json({ message: 'Server error.' });
});

initDb()
  .then(() => {
    app.listen(env.PORT, () => {
      console.log(`AI RPG API running on http://localhost:${env.PORT}`);
    });
  })
  .catch((error) => {
    console.error('Failed to initialize database.', error);
    process.exit(1);
  });