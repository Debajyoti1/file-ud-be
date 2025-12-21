const mongoose = require('mongoose');
const config=require('./env');
const logger = require('./logger.config');
async function connectDB() {
  const MONGO_URI = config.mongo.uri;
  if (!MONGO_URI) {
    throw new Error('MONGO_URI is missing in environment variables');
  }

  mongoose.connection.on('disconnected', () => {
    logger.error('MongoDB disconnected!');
  });

  mongoose.connection.on('error', (err) => {
    logger.error('MongoDB connection error:', err);
    process.kill(process.pid, "SIGTERM");
  });

  await mongoose.connect(MONGO_URI);

  return mongoose;
}

module.exports = connectDB;
