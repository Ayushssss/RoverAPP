import { Router, Request, Response } from 'express';
import User from '../models/User';

const router = Router();

router.post('/', async (req: Request, res: Response) => {
  try {
    const { clerkId, email, name } = req.body;
    if (!clerkId || !email || !name) {
      res.status(400).json({ error: 'clerkId, email, and name are required' });
      return;
    }

    const user = await User.findOneAndUpdate(
      { clerkId },
      { email, name },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    res.status(200).json({ id: user._id, clerkId: user.clerkId, email: user.email, name: user.name });
  } catch (err) {
    console.error('Error saving user:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
