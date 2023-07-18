const rooms = {}
const Conversation = require('../../models/Conversation');
module.exports = function (socket) {
    const room = socket.handshake.query.room

    if (rooms[room]) {
        console.log('peerCount: rooms[room].size', rooms[room].size)
        if (!rooms[room].has(socket.id))
            rooms[room] = rooms[room].set(socket.id, socket);
    }
    else {
        rooms[room] = (new Map()).set(socket.id, socket);
    }
    socket.emit('connection-success', {
        success: socket.id,
        peerCount: rooms[room].size,
    })
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
    const disconnectedPeer = async (socketID) => {
        if (rooms[room].size === 0) {
            let converation = await Conversation.findOne({ _id: room });
            let participantIds = converation.participants?.map(o => o.user.toString());
            //console.log('participantIds', participantIds);
            for (let item of participantIds) {
                const numClients = _io.sockets.adapter.rooms.get(item)?.size;
                //console.log('room ' + item + " có " + numClients)
                _io.in(item).emit('endcall');
            }
        }
        const _connectedPeers = rooms[room]
        for (const [_socketID, _socket] of _connectedPeers.entries()) {
            _socket.emit('peer-disconnected', {
                peerCount: rooms[room].size,
                socketID
            })
        }
    }

    socket.on('disconnect', async () => {
        //console.log('disconnected is ', socket.id)
        // connectedPeers.delete(socket.id)
        //console.log('rooms[room]', rooms[room]);
        rooms[room].delete(socket.id);
        await disconnectedPeer(socket.id)
    })

    // ************************************* //
    // NOT REQUIRED
    // ************************************* //
    socket.on('socket-to-disconnect', async (socketIDToDisconnect) => {
        //console.log('disconnected')
        // connectedPeers.delete(socket.id)
        rooms[room].delete(socketIDToDisconnect);
        disconnectedPeer(socketIDToDisconnect);
    })

    socket.on('send-emoji', data => {
        const _connectedPeers = rooms[room]
        for (const [socketID, _socket] of _connectedPeers.entries()) {
            _socket.emit('receive-emoji', data);
        }
    })
    socket.on('onlinePeers', (data) => {
        const _connectedPeers = rooms[room]
        for (const [socketID, _socket] of _connectedPeers.entries()) {
            // don't send to self
            if (socketID !== data.socketID.local) {
                //console.log('online-peer', data.socketID, socketID)
                socket.emit('online-peer', socketID)
            }
        }
    })

    socket.on('offer', data => {
        //console.log(data)
        const _connectedPeers = rooms[room]
        for (const [socketID, socket] of _connectedPeers.entries()) {
            // don't send to self
            if (socketID === data.socketID.remote) {
                // //console.log('Offer', socketID, data.socketID, data.payload.type)
                socket.emit('offer', {
                    sdp: data.payload,
                    socketID: data.socketID.local
                }
                )
            }
        }
    })

    socket.on('answer', (data) => {
        //console.log(data)
        const _connectedPeers = rooms[room]
        for (const [socketID, socket] of _connectedPeers.entries()) {
            if (socketID === data.socketID.remote) {
                //console.log('Answer', socketID, data.socketID, data.payload.type)
                socket.emit('answer', {
                    sdp: data.payload,
                    socketID: data.socketID.local
                }
                )
            }
        }
    })

    socket.on('candidate', (data) => {
        //console.log(data)
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

}

