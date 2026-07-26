import { Router, Request, Response } from 'express';
import Cluster from '../models/Cluster';

const router = Router();

router.get('/', async (req: Request, res: Response) => {
  try {
    const userId = req.query.userId as string;
    if (!userId) {
      res.status(400).json({ error: 'userId query parameter is required' });
      return;
    }
    const clusters = await Cluster.find({ userId }).sort({ createdAt: -1 });
    res.json(clusters.map(c => ({
      id: c._id.toString(),
      name: c.name,
      description: c.description,
      created_at: c.createdAt.toISOString(),
    })));
  } catch (err) {
    console.error('Error listing clusters:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/', async (req: Request, res: Response) => {
  try {
    const { userId, name, description } = req.body;
    if (!userId || !name) {
      res.status(400).json({ error: 'userId and name are required' });
      return;
    }
    const cluster = await Cluster.create({ userId, name, description: description ?? '' });
    res.status(201).json({
      id: cluster._id.toString(),
      name: cluster.name,
      description: cluster.description,
      created_at: cluster.createdAt.toISOString(),
    });
  } catch (err) {
    console.error('Error creating cluster:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
