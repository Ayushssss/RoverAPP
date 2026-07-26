import mongoose, { Schema, Document } from 'mongoose';

export interface ICluster extends Document {
  userId: string;
  name: string;
  description: string;
  createdAt: Date;
}

const ClusterSchema = new Schema<ICluster>({
  userId: { type: String, required: true, index: true },
  name: { type: String, required: true },
  description: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.model<ICluster>('Cluster', ClusterSchema);
