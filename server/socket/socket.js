import jwt from "jsonwebtoken";
import User from "../models/User.js";

const onlineUsers = new Map();

const initializeSocket = (io) => {
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;

      if (!token) {
        return next(
          new Error("Authentication required")
        );
      }

      const decoded = jwt.verify(
        token,
        process.env.JWT_SECRET
      );

      const user = await User.findById(decoded.id);

      if (!user) {
        return next(
          new Error("User not found")
        );
      }

      socket.user = user;

      next();
    } catch (error) {
      next(new Error("Invalid socket token"));
    }
  });

  io.on("connection", async (socket) => {
    const userId = socket.user._id.toString();

    onlineUsers.set(userId, socket.id);

    await User.findByIdAndUpdate(userId, {
      is_online: true,
    });

    io.emit("user_online", {
      userId,
    });

    console.log(
      `User connected: ${socket.user.name}`
    );

    socket.on("join_conversation", (conversationId) => {
      socket.join(conversationId);
    });

    socket.on("send_message", (message) => {
      io.to(message.conversation).emit(
        "receive_message",
        message
      );
    });

    socket.on("typing", ({ conversationId }) => {
      socket.to(conversationId).emit("typing", {
        userId,
      });
    });

    socket.on(
      "stop_typing",
      ({ conversationId }) => {
        socket
          .to(conversationId)
          .emit("stop_typing", {
            userId,
          });
      }
    );

    socket.on("disconnect", async () => {
      onlineUsers.delete(userId);

      await User.findByIdAndUpdate(userId, {
        is_online: false,
        last_seen: new Date(),
      });

      io.emit("user_offline", {
        userId,
      });

      console.log(
        `User disconnected: ${socket.user.name}`
      );
    });
  });
};

export default initializeSocket;