import jwt from "jsonwebtoken";
import User from "../models/User.js";
import Conversation from "../models/Conversation.js";
import Message from "../models/Message.js";

const onlineUsers = new Map();
const activeCalls = new Map();
const userRoom = (userId) => `user:${userId}`;

const saveCallMessage = async (io, call, status, endedBy) => {
  const duration = call.answeredAt
    ? Math.max(0, Math.floor((Date.now() - call.answeredAt) / 1000))
    : 0;
  const mediaLabel = call.callType === "video" ? "Video call" : "Voice call";
  const text = status === "completed"
    ? `${mediaLabel} · ${Math.floor(duration / 60)}:${String(duration % 60).padStart(2, "0")}`
    : status === "declined"
      ? `${mediaLabel} declined`
      : `Missed ${mediaLabel.toLowerCase()}`;

  const message = await Message.create({
    conversation: call.conversationId,
    sender: endedBy || call.callerId,
    receiver: endedBy === call.callerId ? call.receiverId : call.callerId,
    text,
    message_type: "call",
    call_type: call.callType,
    call_status: status,
    call_duration: duration,
  });
  await Conversation.findByIdAndUpdate(call.conversationId, {
    last_message: message._id,
    updatedAt: new Date(),
  });
  for (const participantId of [call.callerId, call.receiverId]) {
    io.to(userRoom(participantId)).emit("call:log-created", { conversationId: call.conversationId });
  }
};

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

    const userSockets = onlineUsers.get(userId) || new Set();
    userSockets.add(socket.id);
    onlineUsers.set(userId, userSockets);
    socket.join(userRoom(userId));

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

    const getCallRecipient = async (receiverId, conversationId) => {
      if (!receiverId || !conversationId) return null;
      const conversation = await Conversation.findById(conversationId).select("participants");
      if (!conversation) return null;
      const participantIds = conversation.participants.map((participant) => participant.toString());
      if (!participantIds.includes(userId) || !participantIds.includes(receiverId)) return null;
      return onlineUsers.has(receiverId) ? userRoom(receiverId) : null;
    };

    const getCallParticipants = async (receiverId, conversationId) => {
      if (!receiverId || !conversationId) return null;
      const conversation = await Conversation.findById(conversationId).select("participants");
      if (!conversation) return null;
      const participantIds = conversation.participants.map((participant) => participant.toString());
      if (!participantIds.includes(userId) || !participantIds.includes(receiverId)) return null;
      return { conversationId, callerId: userId, receiverId };
    };

    socket.on("call:offer", async ({ receiverId, conversationId, callType, offer }) => {
      try {
        if (!["audio", "video"].includes(callType) || !offer) {
          socket.emit("call:error", { message: "Invalid call request." });
          return;
        }
        const participants = await getCallParticipants(receiverId, conversationId);
        if (!participants) {
          socket.emit("call:error", { message: "You cannot call from this conversation." });
          return;
        }
        if (activeCalls.has(conversationId)) {
          socket.emit("call:error", { message: "There is already a call in this conversation." });
          return;
        }
        const recipientSocketId = await getCallRecipient(receiverId, conversationId);
        const call = { ...participants, callType, startedAt: Date.now(), answeredAt: null };
        activeCalls.set(conversationId, call);
        if (!recipientSocketId) {
          activeCalls.delete(conversationId);
          await saveCallMessage(io, call, "missed", userId);
          socket.emit("call:error", { message: "This person is offline or unavailable." });
          return;
        }
        io.to(recipientSocketId).emit("call:incoming", {
          from: {
            id: userId,
            name: socket.user.name,
            profile_image: socket.user.profile_image,
          },
          conversationId,
          callType,
          offer,
        });
      } catch (error) {
        console.error("Could not start call:", error);
        socket.emit("call:error", { message: "Could not start the call. Please try again." });
      }
    });

    socket.on("call:answer", async ({ receiverId, conversationId, answer }) => {
      try {
        const call = activeCalls.get(conversationId);
        if (!answer || !call || call.receiverId !== userId || call.callerId !== receiverId) return;
        call.answeredAt = Date.now();
        const recipientSocketId = await getCallRecipient(receiverId, conversationId);
        if (recipientSocketId) {
          io.to(recipientSocketId).emit("call:answered", { answer, from: userId });
        } else {
          activeCalls.delete(conversationId);
          await saveCallMessage(io, call, "missed", call.callerId);
          socket.emit("call:error", { message: "The caller disconnected before the call connected." });
        }
      } catch (error) {
        console.error("Could not answer call:", error);
        socket.emit("call:error", { message: "Could not answer the call." });
      }
    });

    socket.on("call:ice-candidate", async ({ receiverId, conversationId, candidate }) => {
      try {
        if (!candidate) return;
        const recipientSocketId = await getCallRecipient(receiverId, conversationId);
        if (recipientSocketId) {
          io.to(recipientSocketId).emit("call:ice-candidate", { candidate, from: userId });
        }
      } catch (error) {
        console.error("Could not relay call candidate:", error);
      }
    });

    socket.on("call:end", async ({ receiverId, conversationId }) => {
      try {
        const call = activeCalls.get(conversationId);
        if (call && [call.callerId, call.receiverId].includes(userId)) {
          activeCalls.delete(conversationId);
          await saveCallMessage(io, call, call.answeredAt ? "completed" : "missed", userId);
        }
        const recipientSocketId = await getCallRecipient(receiverId, conversationId);
        if (recipientSocketId) io.to(recipientSocketId).emit("call:ended", { from: userId });
      } catch (error) {
        console.error("Could not end call:", error);
      }
    });

    socket.on("call:decline", async ({ receiverId, conversationId }) => {
      try {
        const call = activeCalls.get(conversationId);
        if (call && call.receiverId === userId && call.callerId === receiverId) {
          activeCalls.delete(conversationId);
          await saveCallMessage(io, call, "declined", call.callerId);
        }
        const recipientSocketId = await getCallRecipient(receiverId, conversationId);
        if (recipientSocketId) io.to(recipientSocketId).emit("call:declined", { from: userId });
      } catch (error) {
        console.error("Could not decline call:", error);
      }
    });

    socket.on("disconnect", async () => {
      const userSockets = onlineUsers.get(userId);
      userSockets?.delete(socket.id);
      if (userSockets?.size) return;
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