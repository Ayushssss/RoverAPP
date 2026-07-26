import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import http from 'http';
import mongoose from 'mongoose';
import { Server as SocketIOServer } from 'socket.io';
import { setupWebSocket } from './websocket';
import { startESP32WebSocket } from './esp32ws';
import userRoutes from './routes/users';
import deviceRoutes from './routes/devices';
import clusterRoutes from './routes/clusters';

const app = express();
const server = http.createServer(app);
const io = new SocketIOServer(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
});

app.use(cors());
app.use(express.json());

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// Latest app version — increment on each build
const APP_VERSION = { latest: '1.0.1', minRequired: '1.0.1' };
app.get('/api/version', (_req, res) => {
  res.json(APP_VERSION);
});


app.use('/api/users', userRoutes);
app.use('/api/devices', deviceRoutes);
app.use('/api/clusters', clusterRoutes);

setupWebSocket(io);
startESP32WebSocket(server);

const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/roverapp';

mongoose.connect(MONGODB_URI).then(() => {
  console.log('Connected to MongoDB');
  server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}).catch((err) => {
  console.error('MongoDB connection error:', err);
  process.exit(1);
});
