import Logger, { requestLogger, errorLogger } from "./middleware/logger.js";
import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import mongoose from "mongoose";
import { connectDB } from "./mongooseConn.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Connect to MongoDB
connectDB();

// Middleware
app.use(cors({
  origin: ['https://docongoai.vercel.app', 'http://localhost:3000'],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(requestLogger); 

// Basic route
app.get("/", (req, res) => {
  res.send("DocOnGo API is running");
});

// Health check route
app.get("/health", (req, res) => {
  res.status(200).json({ status: "ok", message: "DocOnGo API is healthy" });
});

// Routes
import conversationRoutes from "./routes/conversation.js";
import authRoutes from "./routes/auth.js";

app.use("/api/conversation", conversationRoutes);
app.use("/api/auth", authRoutes);

// Error handling middleware
app.use(errorLogger);
app.use((err, req, res, next) => {
  const statusCode = err.statusCode || 500;
  const message = err.message || "Internal Server Error";

  Logger.error(`Error in ${req.method} ${req.originalUrl}`, {
    statusCode,
    message,
    stack: err.stack,
  });

  return res.status(statusCode).json({
    success: false,
    statusCode,
    message,
  });
});

// Start server
app.listen(PORT, () => {
  Logger.success(`Server running on port ${PORT}`);
});

// Handle unhandled promise rejections
process.on("unhandledRejection", (err) => {
  Logger.error(`Unhandled Rejection: ${err.message}`);
  process.exit(1);
});
