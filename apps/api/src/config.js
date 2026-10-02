import 'dotenv/config';

const need = (key) => {
  if (!process.env[key]) throw new Error(`Missing environment variable: ${key}`);
  return process.env[key];
};

export const config = {
  port: Number(process.env.PORT) || 4000,
  mongoUri: need('MONGODB_URI'),
  jwtSecret: need('JWT_SECRET'),
  clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:3000',
};
