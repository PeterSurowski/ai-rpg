import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config({ quiet: true });

const isProduction = process.env.NODE_ENV === 'production';

const envSchema = z.object({
  PORT: z.coerce.number().default(4000),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  JWT_SECRET: z.string().min(16).optional(),
  VENICE_API_KEY: z.string().min(1).optional(),
  VENICE_MODEL: z.string().default('venice-uncensored')
});

const parsedEnv = envSchema.parse(process.env);

if (isProduction && !parsedEnv.JWT_SECRET) {
  throw new Error('JWT_SECRET is required in production.');
}

export const env = {
  ...parsedEnv,
  JWT_SECRET: parsedEnv.JWT_SECRET ?? 'dev-only-jwt-secret-change-me'
};