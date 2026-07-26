import mongoose, { Schema, Document } from 'mongoose';

export interface IDevice extends Document {
  userId: string;
  name: string;
  macAddress: string;
  clusterId: string | null;
  createdAt: Date;
}

const DeviceSchema = new Schema<IDevice>({
  userId: { type: String, required: true, index: true },
  name: { type: String, required: true },
  macAddress: { type: String, required: true },
  clusterId: { type: String, default: null },
  createdAt: { type: Date, default: Date.now },
});

DeviceSchema.index({ userId: 1, macAddress: 1 }, { unique: true });

export default mongoose.model<IDevice>('Device', DeviceSchema);
