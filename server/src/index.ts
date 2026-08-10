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
// Latest app version — increment on each build
const APP_VERSION = {
  latest: '1.0.1',
  minRequired: '1.0.1',
  apkUrl: 'https://roverapp.onrender.com/downloads/AgriverseROVER-v1.0.1.apk',
};
app.get('/api/version', (_req, res) => {
  res.json(APP_VERSION);
});


app.use('/api/users', userRoutes);
app.use('/api/devices', deviceRoutes);
app.use('/api/clusters', clusterRoutes);

// Serve APK downloads
app.use('/downloads', express.static('downloads'));

setupWebSocket(io);
startESP32WebSocket(server);

const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/roverapp';

/*
  Listen first, connect to Mongo second — and never let Mongo stop the relay.

  Nothing on the drive path touches the database. A joystick vector goes from
  the app, through the WebSocket fan-out, to the rover, and no part of that
  reads or writes a document. Mongo backs the device and user REST routes only.

  So refusing to listen until Mongo answers made a database outage into a
  grounded rover, which is the wrong trade by a wide margin. Worse, exiting on
  failure turned a bad password into a crash loop — systemd restarting a
  process that could never succeed, 63 times, while the drive path it was
  perfectly capable of serving stayed down.

  Now the socket comes up immediately. If Mongo is unreachable the rover still
  drives; only the REST routes degrade, and mongoose queues and retries in the
  background so they recover on their own when the database comes back.
*/
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

mongoose.connect(MONGODB_URI)
  .then(() => console.log('Connected to MongoDB'))
  .catch((err) => {
    console.error('MongoDB connection error — REST routes will fail, driving is unaffected:');
    console.error(`  ${err.message}`);
    if (/bad auth|Authentication failed/i.test(err.message)) {
      console.error('  ^ the credentials in MONGODB_URI are wrong, not the network.');
    }
  });

// Logged rather than swallowed: a link that drops and recovers is normal, and
// seeing both halves is what distinguishes it from one that never came back.
mongoose.connection.on('disconnected', () => console.warn('[db] disconnected'));
mongoose.connection.on('reconnected', () => console.log('[db] reconnected'));
