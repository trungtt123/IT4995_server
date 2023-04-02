require('dotenv').config()
const express = require('express')
const mongoose = require('mongoose')
const cors = require('cors');
const multer = require('multer');
const {responseError, callRes} = require('./response/error');

const app = express()
const http = require('http');
const server = http.createServer(app);
const io = require('socket.io')(server, { cors: { origin: '*' }, pingTimeout: 60000 });
const callIO = require('socket.io')(server, { cors: '*', path: '/io/webrtc' });

global._io = io;
const rooms = {}
const messages = {}
// use express.json as middleware
app.use('/public', express.static(__dirname + '/webview'))
app.use(express.json())
app.use(express.urlencoded({ extended: false }));
app.use(cors());

// connect to MongoDB
const url = process.env.mongoURI;
mongoose.connect(url,
    { useNewUrlParser: true, useUnifiedTopology: true, useCreateIndex: true })
    .then(() => console.log("MongoDB connected"))
    .catch(err => console.log(`errors: ${err}`)
    );

app.get('/it4788/finishedsignup', (req, res) => {
    res.sendFile(__dirname + '/webview/finishSignup.html');
});
// use Routes
app.use('/it4788/auth', require('./routes/auth'));
app.use('/it4788/friend', require('./routes/friend'));
app.use('/it4788/post', require('./routes/posts'));
app.use('/it4788/search', require('./routes/search'));
app.use('/it4788/comment', require('./routes/comments'));
app.use('/it4788/like', require('./routes/likes'));
app.use('/it4788/friend', require('./routes/friend'));
app.use('/it4788/setting', require('./routes/settings'));
app.use('/it4788/user', require('./routes/user'));
app.use('/it4788/chat', require('./routes/restChat'));
_io.on('connection', async (socket) => {
	console.log('Connected: ' + socket.id);
    require('./routes/chat')(socket);
    socket.on('disconnect', () => {
        socket.disconnect();

    });
});
app.use(function (err, req, res, next) {
    if(err instanceof multer.MulterError) {
        if(err.code === 'LIMIT_UNEXPECTED_FILE') {
            return callRes(res, responseError.EXCEPTION_ERROR, "'" + err.field + "'" + " không đúng với mong đợi. Xem lại trường ảnh hoặc video gửi lên trong yêu cầu cho đúng");
        }
    }
    console.log(err);
    return callRes(res, responseError.UNKNOWN_ERROR, "Lỗi chưa xác định");
})

const port = process.env.PORT || 8000;
server.listen(port, () => console.log(`Server is running on port ${port}`))
callIO.listen(server)
callIO.on('connection', socket => {
    console.log('user call connected')
  })
  const peers = callIO.of('/webrtcPeer')
  
  peers.on('connection', socket => {
  
    const room = socket.handshake.query.room
  
    rooms[room] = rooms[room] && rooms[room].set(socket.id, socket) || (new Map()).set(socket.id, socket)
    messages[room] = messages[room] || []
  
    console.log(socket.id, room)
    socket.emit('connection-success', {
      success: socket.id,
      peerCount: rooms[room].size,
      messages: messages[room],
    })
  
    // const broadcast = () => socket.broadcast.emit('joined-peers', {
    //   peerCount: connectedPeers.size,
    // })
    const broadcast = () => {
      const _connectedPeers = rooms[room]
  
      for (const [socketID, _socket] of _connectedPeers.entries()) {
        // if (socketID !== socket.id) {
          _socket.emit('joined-peers', {
            peerCount: rooms[room].size, //connectedPeers.size,
          })
        // }
      }
    }
    broadcast()
  
    // const disconnectedPeer = (socketID) => socket.broadcast.emit('peer-disconnected', {
    //   peerCount: connectedPeers.size,
    //   socketID: socketID
    // })
    const disconnectedPeer = (socketID) => {
      const _connectedPeers = rooms[room]
      for (const [_socketID, _socket] of _connectedPeers.entries()) {
          _socket.emit('peer-disconnected', {
            peerCount: rooms[room].size,
            socketID
          })
      }
    }
  
    socket.on('new-message', (data) => {
      console.log('new-message', JSON.parse(data.payload))
  
      messages[room] = [...messages[room], JSON.parse(data.payload)]
    })
  
    socket.on('disconnect', () => {
      console.log('disconnected is ', socket.id)
      // connectedPeers.delete(socket.id)
      rooms[room].delete(socket.id)
      messages[room] = rooms[room].size === 0 ? null : messages[room]
      disconnectedPeer(socket.id)
    })
  
    // ************************************* //
    // NOT REQUIRED
    // ************************************* //
    socket.on('socket-to-disconnect', (socketIDToDisconnect) => {
      console.log('disconnected')
      // connectedPeers.delete(socket.id)
      rooms[room].delete(socketIDToDisconnect)
      messages[room] = rooms[room].size === 0 ? null : messages[room]
      disconnectedPeer(socketIDToDisconnect)
    })
  
    socket.on('onlinePeers', (data) => {
      const _connectedPeers = rooms[room]
      for (const [socketID, _socket] of _connectedPeers.entries()) {
        // don't send to self
        if (socketID !== data.socketID.local) {
          console.log('online-peer', data.socketID, socketID)
          socket.emit('online-peer', socketID)
        }
      }
    })
  
    socket.on('offer', data => {
      console.log(data)
      const _connectedPeers = rooms[room]
      for (const [socketID, socket] of _connectedPeers.entries()) {
        // don't send to self
        if (socketID === data.socketID.remote) {
          // console.log('Offer', socketID, data.socketID, data.payload.type)
          socket.emit('offer', {
              sdp: data.payload,
              socketID: data.socketID.local
            }
          )
        }
      }
    })
  
    socket.on('answer', (data) => {
      console.log(data)
      const _connectedPeers = rooms[room]
      for (const [socketID, socket] of _connectedPeers.entries()) {
        if (socketID === data.socketID.remote) {
          console.log('Answer', socketID, data.socketID, data.payload.type)
          socket.emit('answer', {
              sdp: data.payload,
              socketID: data.socketID.local
            }
          )
        }
      }
    })
  
    // socket.on('offerOrAnswer', (data) => {
    //   // send to the other peer(s) if any
    //   for (const [socketID, socket] of connectedPeers.entries()) {
    //     // don't send to self
    //     if (socketID !== data.socketID) {
    //       console.log(socketID, data.payload.type)
    //       socket.emit('offerOrAnswer', data.payload)
    //     }
    //   }
    // })
  
    socket.on('candidate', (data) => {
      console.log(data)
      const _connectedPeers = rooms[room]
      // send candidate to the other peer(s) if any
      for (const [socketID, socket] of _connectedPeers.entries()) {
        if (socketID === data.socketID.remote) {
          socket.emit('candidate', {
            candidate: data.payload,
            socketID: data.socketID.local
          })
        }
      }
    })
  
  })