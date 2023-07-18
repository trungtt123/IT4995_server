require('dotenv').config()
const express = require('express')
const mongoose = require('mongoose')
const cors = require('cors');
const multer = require('multer');
const { responseError, callRes } = require('./response/error');

const app = express()
const http = require('http');
const server = http.createServer(app);
const io = require('socket.io')(server, { cors: { origin: '*' }, pingTimeout: 300000, maxHttpBufferSize: 3 * 1024 * 1024 });
const callIO = require('socket.io')(server, { cors: '*', path: '/io/webrtc' });

global._io = io;
global._callIO = callIO;

// use express.json as middleware
app.use(express.json())
app.use(express.urlencoded({ extended: false }));
app.use(cors());
console.log('dirname', __dirname);
// connect to MongoDB
const url = process.env.mongoURI;
mongoose.connect(url,
  { useNewUrlParser: true, useUnifiedTopology: true, useCreateIndex: true })
  .then(() => console.log("MongoDB connected"))
  .catch(err => console.log(`errors: ${err}`)
  );

// use Routes
app.use('/it4995/auth', require('./service/user/auth'));
app.use('/it4995/friend', require('./service/friend/friend'));
// app.use('/it4995/post', require('./routes/posts'));
// app.use('/it4995/search', require('./routes/search'));
// app.use('/it4995/comment', require('./routes/comments'));
// app.use('/it4995/like', require('./routes/likes'));
// app.use('/it4995/setting', require('./routes/settings'));
app.use('/it4995/user', require('./service/user/user'));
app.use('/it4995/conversation', require('./service/conversation/conversation'));
_io.on('connection', async (socket) => {
  console.log('Connected: ' + socket.id);
  require('./service/conversation/chat')(socket);
  socket.on('disconnect', () => {
    socket.disconnect();

  });
});
app.use(function (err, req, res, next) {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_UNEXPECTED_FILE') {
      return callRes(res, responseError.EXCEPTION_ERROR, "'" + err.field + "'" + " không đúng với mong đợi. Xem lại trường ảnh hoặc video gửi lên trong yêu cầu cho đúng");
    }
  }
  console.log(err);
  return callRes(res, responseError.UNKNOWN_ERROR, "Lỗi chưa xác định");
})

const port = process.env.PORT || 8000;
server.listen(port, () => console.log(`Server is running on port ${port}`))
_callIO.listen(server)
const peers = _callIO.of('/webrtcPeer')

peers.on('connection', socket => {
  require('./service/conversation/call')(socket);
  
})