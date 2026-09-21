import 'dotenv/config';
import express from "express";
import cors from "cors";
import mongoose from "mongoose";
import Logger, { requestLogger, errorLogger } from "./middleware/logger.js";
import { connectDB } from "./mongooseConn.js";
import conversationRoutes from "./routes/conversation.js";
import authRoutes from "./routes/auth.js";

const app = express();
const PORT = process.env.PORT || 5000;

// Connect to MongoDB
connectDB();

// CORS configuration supporting localhost (all dev ports) and production domains
const allowedOrigins = [
  'https://docongoai.vercel.app',
  'http://localhost:3000',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:5174',
  'http://127.0.0.1:5174',
  'http://localhost:4173',
  'http://127.0.0.1:4173',
  process.env.FRONTEND_URL
].filter(Boolean);

const corsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps, curl, Postman)
    if (!origin) return callback(null, true);

    // Check if origin is explicitly allowed
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    // Allow any localhost/127.0.0.1 origin or any *.vercel.app domain
    if (
      /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin) ||
      /\.vercel\.app$/.test(origin)
    ) {
      return callback(null, true);
    }

    return callback(new Error(`CORS blocked for origin: ${origin}`));
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Gemini-API-Key'],
  credentials: true
};

app.use(cors(corsOptions));
// NOTE: Do NOT add `app.options('*', ...)` here. Express 5 uses path-to-regexp v8,
// where a bare '*' path throws "Missing parameter name" and crashes the server on boot.
// `app.use(cors(corsOptions))` above already answers CORS preflight (OPTIONS) requests.
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
