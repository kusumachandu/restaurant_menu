import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import mongoose from 'mongoose';
import { config } from './config.js';
import routes from './routes.js';
import { errorHandler } from './middleware.js';

const app = express();
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({ origin: config.clientOrigin.split(',') }));
app.use(express.json({ limit: '100kb' }));

app.get('/health', (req, res) => res.json({ ok: true }));
app.use('/api', routes);
app.use(errorHandler);

await mongoose.connect(config.mongoUri);
app.listen(config.port, () => console.log(`API ready on http://localhost:${config.port}`));
