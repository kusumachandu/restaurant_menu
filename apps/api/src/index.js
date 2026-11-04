import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import mongoose from 'mongoose';
import { config } from './config.js';
import routes from './routes.js';
import { errorHandler } from './middleware.js';
import { startWebhookWorker } from './webhooks.js';

const app = express();
// Behind Vercel's proxy: use the real client IP (X-Forwarded-For) so rate limits are per-user, not shared.
app.set('trust proxy', 1);
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({ origin: config.clientOrigin.split(',') }));
app.use(express.json({ limit: '100kb' }));

app.get('/health', (req, res) => res.json({ ok: true }));
app.use('/api', routes);
app.use(errorHandler);

await mongoose.connect(config.mongoUri);
startWebhookWorker();
app.listen(config.port, () => console.log(`API ready on http://localhost:${config.port}`));
