import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import http from "http";
import { Server } from "socket.io";

import connectDB from "./config/db.js";

import authRoutes from "./routes/authRoutes.js";
import userRoutes from "./routes/userRoutes.js";
import chatRoutes from "./routes/chatRoutes.js";
import messageRoutes from "./routes/messageRoutes.js";
import adminRoutes from "./routes/adminRoutes.js";
import mediaRoutes from "./routes/mediaRoutes.js";

import initializeSocket from "./socket/socket.js";

import errorMiddleware from "./middleware/errorMiddleware.js";

dotenv.config();

const app = express();
const server = http.createServer(app);
app.set("trust proxy", 1);

// Allowed frontend URLs
const allowedOrigins = [
  "http://localhost:5173",
  "https://sonuchat.netlify.app",
  process.env.CLIENT_URL,
  process.env.DEPLOY_PRIME_URL,
].filter(Boolean);

const allowFrontendOrigin = (origin, callback) => {
  const isNetlifyOrigin = /^https:\/\/[a-z0-9-]+\.netlify\.app$/i.test(origin || "");
  if (!origin || allowedOrigins.includes(origin) || isNetlifyOrigin) {
    callback(null, true);
    return;
  }
  callback(new Error("Origin is not allowed by CORS"));
};

// Socket.IO
const io = new Server(server, {
  cors: {
    origin: allowFrontendOrigin,
    credentials: true,
  },
});

// Database
connectDB();

// Middleware
app.use(
  cors({
    origin: allowFrontendOrigin,
    credentials: true,
  })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Static files
app.use("/uploads", express.static("uploads"));

// API routes
app.use("/api/auth", authRoutes);
app.use("/api/user", userRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/message", messageRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/media", mediaRoutes);

// Test route
app.get("/", (req, res) => {
  res.json({
    status: true,
    message: "Chat App Server is running",
  });
});

// Socket.IO
initializeSocket(io);

// Error middleware
app.use(errorMiddleware);

// Server
const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});