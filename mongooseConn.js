import mongoose from 'mongoose';
import Logger from "./middleware/logger.js";

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
    });
    Logger.info('MongoDB connected successfully');
  } catch (err) {
    Logger.error('MongoDB connection error:', err);
    process.exit(1); // Exit with failure
  }
};

export { connectDB, mongoose as default };
