import mongoose from 'mongoose';
import logger from '../utils/logger.js';

export async function connectDB() {
  const mongoURI = process.env.MONGODB_URI || 'mongodb://localhost:27017/expense-splitter';

  try {
    await mongoose.connect(mongoURI);
    logger.info('MongoDB connected');
  } catch (error) {
    logger.error('MongoDB connection error:', error);
    throw error;
  }

  mongoose.connection.on('error', (err) => {
    logger.error('MongoDB error:', err);
  });

  mongoose.connection.on('disconnected', () => {
    logger.warn('MongoDB disconnected');
  });
}

export default mongoose;
