const mongoose = require('mongoose');

const MessageSchema = new mongoose.Schema({
  /*
    content: {
      body: 
    }
  */
  content: {
    type: Object,
    required: true
  },
  /* 
    type = text -> tin nhắn text thông thường
    type = video -> tin nhắn video
    type = image -> tin nhắn hình ảnh
    type = notification -> thông báo thêm / xóa người dùng / đổi tên đoạn chat / cuộc gọi kết thúc
  */
  type: {
    type: String,
    required: true,
    default: 'text'
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
