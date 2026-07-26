import { Router, Request, Response } from 'express';
import Device from '../models/Device';

const router = Router();

router.get('/', async (req: Request, res: Response) => {
  try {
    const userId = req.query.userId as string;
    if (!userId) {
      res.status(400).json({ error: 'userId query parameter is required' });
      return;
    }
    const devices = await Device.find({ userId }).sort({ createdAt: -1 });
    res.json(devices.map(d => ({
      id: d._id.toString(),
      name: d.name,
      mac_address: d.macAddress,
      cluster_id: d.clusterId,
      created_at: d.createdAt.toISOString(),
    })));
  } catch (err) {
    console.error('Error listing devices:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/', async (req: Request, res: Response) => {
  try {
    const { userId, name, macAddress, clusterId } = req.body;
    if (!userId || !name || !macAddress) {
      res.status(400).json({ error: 'userId, name, and macAddress are required' });
      return;
    }

    const existing = await Device.findOne({ userId, macAddress });
    if (existing) {
      res.json({
        id: existing._id.toString(), name: existing.name,
        mac_address: existing.macAddress, cluster_id: existing.clusterId,
        created_at: existing.createdAt.toISOString(),
      });
      return;
    }

    const device = await Device.create({ userId, name, macAddress, clusterId: clusterId ?? null });
    res.status(201).json({
      id: device._id.toString(), name: device.name,
      mac_address: device.macAddress, cluster_id: device.clusterId,
      created_at: device.createdAt.toISOString(),
    });
  } catch (err) {
    console.error('Error adding device:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const userId = req.query.userId as string;
    if (!userId) {
      res.status(400).json({ error: 'userId query parameter is required' });
      return;
    }
    const device = await Device.findOneAndDelete({ _id: req.params.id, userId });
    if (!device) {
      res.status(404).json({ error: 'Device not found' });
      return;
    }
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting device:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
