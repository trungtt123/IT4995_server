const mongoose = require('mongoose');

const MessageSchema = new mongoose.Schema({
  content: {
    type: String,
    required: true,
  },
  /* 
    notification = 0 -> tin nhắn thông thường
    notification = 1 -> thông báo thêm / xóa người dùng / đổi tên đoạn chat / cuộc gọi kết thúc
    notification = 2 -> thông báo có người tạo cuộc gọi
  */
  notification: {
    type: Number,
    required: 0
  },
  sender: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'users',
    required: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

const ParticipantSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'users',
    required: true,
  },
  permissions: {
    type: String,
    required: true,
    default: "participant",
  },
});

const ConversationSchema = new mongoose.Schema({
  conversationName: {
    type: String,
    default: 'Cuộc hội thoại mới'
  },
  participants: [ParticipantSchema],
  messages: [MessageSchema],
}, { timestamps: true }, { collection: 'conversations' });

const Conversation = mongoose.model('conversations', ConversationSchema);

module.exports = Conversation;
