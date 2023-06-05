const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const verify = require('../utils/verifyToken');
const jwt = require('jsonwebtoken');
const Conversation = require('../models/Conversation');
const User = require('../models/User');
const convertString = require('../utils/convertString');
const { responseError, callRes } = require('../response/error');
const checkInput = require('../utils/validInput');
const validTime = require('../utils/validTime');

async function verifySocketToken(token) {
    try {
        if (!token) return false;
        const verified = jwt.verify(token, process.env.jwtSecret);
        const user = await User.findById(verified.id);
        if (!user) return false;
        if (user.isBlocked == true) return false;
        if (user.dateLogin) {
            var date = new Date(verified.dateLogin);
            if (user.dateLogin.getTime() == date.getTime()) {
                return true;
            } else {
                return false;
            }
        } else {
            return false;
        }
    } catch (err) {
        console.log('verify error', err);
        return false;
    }
}
//Not API
module.exports = function (socket) {
    socket.on('me', (data) => {
        const { userId, token } = data;
        socket.join(userId);
        const numClients = _io.sockets.adapter.rooms.get(userId)?.size;
        console.log('room ' + userId + " có " + numClients)
    });
    socket.on('call', async (data) => {
        let { conversationId, token } = data;
        const verifyToken = await verifySocketToken(token);
        if (!verifyToken) {
            socket.emit('conversation_add_member', { code: '9999', message: 'FAILED', reason: 'TOKEN INVALID' });
            return;
        }
        let converation = await Conversation.findOne({ _id: conversationId });
        let participantIds = converation.participants?.map(o => o.user.toString());
        console.log('participantIds', participantIds);
        for (let item of participantIds) {
            const numClients = _io.sockets.adapter.rooms.get(item)?.size;
            console.log('room ' + item + " có " + numClients)
            socket.to(item).emit('call',
                {
                    code: '1000',
                    message: 'OK',
                    converationId: conversationId
                }
            );
        }
    })
    socket.on('get_list_conversation', async (data) => {
        const { userId, token } = data;
        const verifyToken = await verifySocketToken(token);
        if (!verifyToken) {
            socket.emit('conversation_change', { code: "9999", message: 'FAILED', reason: 'TOKEN INVALID' });
            return;
        }
        const user = await User.findOne({ _id: userId });
        if (!user) {
            socket.emit('conversation_change', { code: "9999", message: 'FAILED', reason: 'USER NOT EXIST' });
            return;
        }
        const listConversation = await Conversation.find({ _id: { $in: user.conversations } }).sort({ updatedAt: -1 });
        socket.emit('conversation_change', { code: "1000", message: 'OK', data: listConversation });
    });
    socket.on('create_conversation', async (data) => {
        const { userId, token } = data;
        let { conversationName } = data;
        const verifyToken = await verifySocketToken(token);
        if (!verifyToken) {
            socket.emit('conversation_change', { code: '9999', message: 'FAILED', reason: 'TOKEN INVALID' });
            return;
        }
        const user = await User.findOne({ _id: userId });
        if (!user) {
            socket.emit('conversation_change', { code: '9999', message: 'FAILED', reason: 'USER NOT EXIST' });
            return;
        }
        let newConveration = await Conversation.create({});
        let participants = newConveration.participants;
        participants.push({
            user: userId,
            permissions: 'owner'
        });
        user.conversations.push(newConveration._id);
        if (!conversationName) conversationName = "Cuộc hội thoại mới"
        await Conversation.findOneAndUpdate({ _id: newConveration._id },
            {
                participants: participants,
                conversationName: conversationName,
            }, { new: true, useFindAndModify: false });
        await user.save();
        const listConversation = await Conversation.find({ _id: { $in: user.conversations } }).sort({ updatedAt: -1 });
        socket.emit('conversation_change',
            {
                code: '1000',
                message: 'OK',
                data: listConversation
            }
        );
    })
    socket.on('add_member', async (data) => {
        let { phoneNumber, conversationId, token } = data;
        const verifyToken = await verifySocketToken(token);
        if (!verifyToken) {
            socket.emit('conversation_add_member', { code: '9999', message: 'FAILED', reason: 'TOKEN INVALID' });
            return;
        }
        const verified = jwt.verify(token, process.env.jwtSecret);
        const sender = await User.findOne({ _id: verified.id });

        const user = await User.findOne({ phoneNumber: phoneNumber });
        if (!user) {
            socket.emit('conversation_add_member', { code: '9999', message: 'FAILED', reason: 'USER NOT EXIST' });
            return;
        }
        let converation = await Conversation.findOne({ _id: conversationId });
        let participants = converation.participants;
        console.log('participants', participants);
        console.log('user._id', user._id);
        if (participants?.map(o => o.user).includes(user._id)) {
            socket.emit('conversation_add_member', { code: '9999', message: 'FAILED', reason: 'USER ALREADY EXISTS IN CHAT' });
            return;
        }
        participants.push({
            user: user._id
        })
        await Conversation.findOneAndUpdate({ _id: conversationId },
            {
                participants: participants,
            }, { new: true, useFindAndModify: false });
        user.conversations.push(conversationId);
        await user.save();
        const listConversation = await Conversation.find({ _id: { $in: user.conversations } }).sort({ updatedAt: -1 });
        _io.in(conversationId).emit('conversation_add_member',
            {
                code: '1000',
                message: 'OK',
                sender: {
                    id: sender._id,
                    name: sender.name,
                    avatar: sender.avatar
                },
                newMember: {
                    id: user._id,
                    name: user.name,
                    avatar: user.avatar
                }
            }
        );
        _io.in(user._id.toString()).emit('conversation_change',
            {
                code: '1000',
                message: 'OK',
                data: listConversation
            }
        );
    })
    socket.on('join_conversation', async (data) => {
        const { conversationId, token } = data;
        socket.join(conversationId);
        const conversation = await Conversation.findOne({ _id: conversationId });
        const verifyToken = await verifySocketToken(token);
        if (!verifyToken) {
            socket.emit('new_message', { code: '9999', message: 'FAILED', reason: 'TOKEN INVALID' });
            return;
        }
        if (!conversation) {
            socket.emit('new_message', { code: '9999', message: 'FAILED', reason: 'CONVERSATION NOT EXIST' });
            return;
        }
        for (let i = 0; i < conversation.participants.length; i++) {
            const user = await User.findOne({ _id: conversation.participants[i].user }).select({ "avatar": 1, "name": 1, "_id": 1, "phoneNumber": 1 });
            conversation.participants[i].user = user
        }
        socket.emit('new_message',
            {
                code: '1000',
                message: 'OK',
                data: conversation
            }
        );
    })

    socket.on('new_message', async (data) => {
        try {
            const { conversationId, token, content, userId } = data;
            const verifyToken = await verifySocketToken(token);
            if (!verifyToken) {
                socket.emit('new_message', { code: '9999', message: 'FAILED', reason: 'TOKEN INVALID' });
                return;
            }
            const user = await User.findOne({ _id: userId });
            if (!user) {
                socket.emit('new_message', { code: '9999', message: 'FAILED', reason: 'USER NOT EXIST' });
                return;
            }
            const conversation = await Conversation.findOne({ _id: conversationId });
            if (!conversation) {
                socket.emit('new_message', { code: '9999', message: 'FAILED', reason: 'CONVERSATION NOT EXIST' });
                return;
            }
            let messages = conversation.messages;
            messages.push({
                content: content,
                sender: userId
            });
            let updateData = await Conversation.findOneAndUpdate({ _id: conversationId },
                {
                    messages: messages,
                }, { new: true, useFindAndModify: false });
            for (let i = 0; i < updateData.participants.length; i++) {
                const user = await User.findOne({ _id: updateData.participants[i].user }).select({ "avatar": 1, "name": 1, "_id": 1, "phoneNumber": 1, "conversations": 1 });
                updateData.participants[i].user = {
                    avatar: user.avatar,
                    name: user.name,
                    _id: user._id,
                    phoneNumber: user.phoneNumber
                };
                const listConversation = await Conversation.find({ _id: { $in: user.conversations } }).sort({ updatedAt: -1 });
                _io.in(user._id.toString()).emit('conversation_change',
                    {
                        code: '1000',
                        message: 'OK',
                        data: listConversation
                    }
                );
            }
            _io.in(conversationId).emit('new_message',
                {
                    code: '1000',
                    message: 'OK',
                    data: updateData
                }
            );

        }
        catch (e) {
            console.log(e);
        }
    });

    // socket.on('delete_conversation', verify, async (req, res) => {
    //     let token = req.query.token;
    //     if (token === undefined) {
    //         return callRes(res, responseError.PARAMETER_IS_NOT_ENOUGH, 'token');
    //     }
    //     if (typeof token != "string") {
    //         return callRes(res, responseError.PARAMETER_VALUE_IS_INVALID, 'token');
    //     }
    //     let id = req.user.id;
    //     let thisUser = await User.findById(id);
    //     if (thisUser.isBlocked) {
    //         return callRes(res, responseError.USER_IS_NOT_VALIDATED, 'Your account has been blocked');
    //     }
    //     if (req.query.partner_id) {
    //         let targetConversation;
    //         let partnerId = req.query.partner_id;
    //         try {
    //             var partnerUser = await User.findById(partnerId);
    //         } catch (err) {
    //             return callRes(res, responseError.PARAMETER_VALUE_IS_INVALID, 'Cannot find partner');
    //         }
    //         if (partnerUser == null) {
    //             return callRes(res, responseError.PARAMETER_VALUE_IS_INVALID, 'Cannot find partner');
    //         }
    //         try {
    //             var targetConversation1 = await Conversation.findOne({ firstUser: partnerId });
    //             var targetConversation2 = await Conversation.findOne({ secondUser: partnerId });
    //         } catch (err) {
    //             return callRes(res, responseError.PARAMETER_VALUE_IS_INVALID, 'partner_id');
    //         }
    //         if (targetConversation1) {
    //             if (targetConversation1.secondUser == id) {
    //                 targetConversation = targetConversation1;
    //             } else {
    //                 return callRes(res, responseError.PARAMETER_VALUE_IS_INVALID, 'Cannot find conversation');
    //             }
    //         }
    //         else if (targetConversation2) {
    //             if (targetConversation2.firstUser == id) {
    //                 targetConversation = targetConversation2;
    //             } else {
    //                 return callRes(res, responseError.PARAMETER_VALUE_IS_INVALID, 'Cannot find conversation');
    //             }
    //         }
    //         else {
    //             return callRes(res, responseError.PARAMETER_VALUE_IS_INVALID, 'Cannot find conversation');
    //         }
    //         await Conversation.deleteOne({ _id: targetConversation._id });
    //     }
    //     else if (req.query.conversation_id) {
    //         let targetConversation;
    //         let conversationId = req.query.conversation_id;
    //         targetConversation = await Conversation.findOne({ conversationId: conversationId });
    //         if (targetConversation == null) {
    //             return callRes(res, responseError.PARAMETER_VALUE_IS_INVALID, 'Cannot find conversation');
    //         }
    //         if (targetConversation.firstUser != id && targetConversation.secondUser != id) {
    //             return callRes(res, responseError.PARAMETER_VALUE_IS_INVALID, 'This is not your conversation');
    //         }
    //         await Conversation.deleteOne({ _id: targetConversation._id });
    //     }
    //     else {
    //         return callRes(res, responseError.PARAMETER_IS_NOT_ENOUGH, 'conversation_id or partner_id');
    //     }
    //     return callRes(res, responseError.OK, 'Successfully delete conversation');
    // });

    // socket.on('delete_message', verify, async (req, res) => {
    //     let token = req.query.token;
    //     if (token === undefined) {
    //         return callRes(res, responseError.PARAMETER_IS_NOT_ENOUGH, 'token');
    //     }
    //     if (typeof token != "string") {
    //         return callRes(res, responseError.PARAMETER_VALUE_IS_INVALID, 'token');
    //     }
    //     let id = req.user.id;
    //     let thisUser = await User.findById(id);
    //     if (thisUser.isBlocked) {
    //         return callRes(res, responseError.USER_IS_NOT_VALIDATED, 'Your account has been blocked');
    //     }
    //     if (req.query.message_id === undefined) {
    //         return callRes(res, responseError.PARAMETER_IS_NOT_ENOUGH, 'message_id');
    //     }
    //     if (req.query.partner_id) {
    //         let flag = false;
    //         let targetConversation;
    //         let partnerId = req.query.partner_id;
    //         let messageId = req.query.message_id;
    //         try {
    //             var partnerUser = await User.findById(partnerId);
    //         } catch (err) {
    //             return callRes(res, responseError.PARAMETER_VALUE_IS_INVALID, 'Cannot find partner');
    //         }
    //         if (partnerUser == null) {
    //             return callRes(res, responseError.PARAMETER_VALUE_IS_INVALID, 'Cannot find partner');
    //         }
    //         try {
    //             var targetConversation1 = await Conversation.findOne({ firstUser: partnerId });
    //             var targetConversation2 = await Conversation.findOne({ secondUser: partnerId });
    //         } catch (err) {
    //             return callRes(res, responseError.PARAMETER_VALUE_IS_INVALID, 'partner_id');
    //         }
    //         if (targetConversation1) {
    //             if (targetConversation1.secondUser == id) {
    //                 targetConversation = targetConversation1;
    //             } else {
    //                 return callRes(res, responseError.PARAMETER_VALUE_IS_INVALID, 'Cannot find conversation');
    //             }
    //         }
    //         else if (targetConversation2) {
    //             if (targetConversation2.firstUser == id) {
    //                 targetConversation = targetConversation2;
    //             } else {
    //                 return callRes(res, responseError.PARAMETER_VALUE_IS_INVALID, 'Cannot find conversation');
    //             }
    //         }
    //         else {
    //             return callRes(res, responseError.PARAMETER_VALUE_IS_INVALID, 'Cannot find conversation');
    //         }
    //         for (dialog in targetConversation.dialog) {
    //             if (targetConversation.dialog[dialog].dialogId == messageId) {
    //                 if (targetConversation.dialog[dialog].sender == id) {
    //                     targetConversation.dialog.splice(dialog, 1);
    //                     flag = true;
    //                     break;
    //                 }
    //                 else {
    //                     return callRes(res, responseError.PARAMETER_VALUE_IS_INVALID, 'This is not your message');
    //                 }
    //             }
    //         }
    //         if (!flag) {
    //             return callRes(res, responseError.PARAMETER_VALUE_IS_INVALID, 'Cannot find message');
    //         }
    //         targetConversation = await targetConversation.save();
    //     }
    //     else if (req.query.conversation_id) {
    //         let flag = false;
    //         let targetConversation;
    //         let conversationId = req.query.conversation_id;
    //         let messageId = req.query.message_id;
    //         targetConversation = await Conversation.findOne({ conversationId: conversationId });
    //         if (targetConversation == null) {
    //             return callRes(res, responseError.PARAMETER_VALUE_IS_INVALID, 'Cannot find conversation');
    //         }
    //         for (dialog in targetConversation.dialog) {
    //             if (targetConversation.dialog[dialog].dialogId == messageId) {
    //                 if (targetConversation.dialog[dialog].sender == id) {
    //                     targetConversation.dialog.splice(dialog, 1);
    //                     flag = true;
    //                     break;
    //                 }
    //                 else {
    //                     return callRes(res, responseError.PARAMETER_VALUE_IS_INVALID, 'This is not your message');
    //                 }
    //             }
    //         }
    //         if (!flag) {
    //             return callRes(res, responseError.PARAMETER_VALUE_IS_INVALID, 'Cannot find message');
    //         }
    //         targetConversation = await targetConversation.save();
    //     }
    //     else {
    //         return callRes(res, responseError.PARAMETER_IS_NOT_ENOUGH, 'conversation_id or partner_id');
    //     }
    //     return callRes(res, responseError.OK, 'Successfully delete message');
    // });

    // socket.on('set_read_message', verify, async (req, res) => {
    //     let token = req.query.token;
    //     if (token === undefined) {
    //         return callRes(res, responseError.PARAMETER_IS_NOT_ENOUGH, 'token');
    //     }
    //     if (typeof token != "string") {
    //         return callRes(res, responseError.PARAMETER_VALUE_IS_INVALID, 'token');
    //     }
    //     let id = req.user.id;
    //     let thisUser = await User.findById(id);
    //     if (thisUser.isBlocked) {
    //         return callRes(res, responseError.USER_IS_NOT_VALIDATED, 'Your account has been blocked');
    //     }
    //     if (req.query.partner_id) {
    //         let targetConversation;
    //         let partnerId = req.query.partner_id;
    //         try {
    //             var partnerUser = await User.findById(partnerId);
    //         } catch (err) {
    //             return callRes(res, responseError.PARAMETER_VALUE_IS_INVALID, 'Cannot find partner');
    //         }
    //         if (partnerUser == null) {
    //             return callRes(res, responseError.PARAMETER_VALUE_IS_INVALID, 'Cannot find partner');
    //         }
    //         try {
    //             var targetConversation1 = await Conversation.findOne({ firstUser: partnerId });
    //             var targetConversation2 = await Conversation.findOne({ secondUser: partnerId });
    //         } catch (err) {
    //             return callRes(res, responseError.PARAMETER_VALUE_IS_INVALID, 'partner_id');
    //         }
    //         if (targetConversation1) {
    //             if (targetConversation1.secondUser == id) {
    //                 targetConversation = targetConversation1;
    //             } else {
    //                 return callRes(res, responseError.PARAMETER_VALUE_IS_INVALID, 'Cannot find conversation');
    //             }
    //         }
    //         else if (targetConversation2) {
    //             if (targetConversation2.firstUser == id) {
    //                 targetConversation = targetConversation2;
    //             } else {
    //                 return callRes(res, responseError.PARAMETER_VALUE_IS_INVALID, 'Cannot find conversation');
    //             }
    //         }
    //         else {
    //             return callRes(res, responseError.PARAMETER_VALUE_IS_INVALID, 'Cannot find conversation');
    //         }
    //         for (dialog in targetConversation.dialog) {
    //             targetConversation.dialog[dialog].unread = "0";
    //         }
    //         targetConversation = await targetConversation.save();
    //     }
    //     else if (req.query.conversation_id) {
    //         let targetConversation;
    //         let conversationId = req.query.conversation_id;
    //         targetConversation = await Conversation.findOne({ conversationId: conversationId });
    //         if (targetConversation == null) {
    //             return callRes(res, responseError.PARAMETER_VALUE_IS_INVALID, 'Cannot find conversation');
    //         }
    //         if (targetConversation.firstUser != id && targetConversation.secondUser != id) {
    //             return callRes(res, responseError.PARAMETER_VALUE_IS_INVALID, 'This is not your conversation');
    //         }
    //         for (dialog in targetConversation.dialog) {
    //             targetConversation.dialog[dialog].unread = "0";
    //             await targetConversation.save();
    //         }
    //         targetConversation = await targetConversation.save();
    //     }
    //     else {
    //         return callRes(res, responseError.PARAMETER_IS_NOT_ENOUGH, 'conversation_id or partner_id');
    //     }
    //     return callRes(res, responseError.OK, 'Successfully set read message');
    // });
    socket.on('client_get_list_conversation', async (dataSocket) => {
        const { token, thisUserId } = dataSocket;
        const verifyToken = await verifySocketToken(token);
        if (!verifyToken) {
            socket.emit('server_send_conversation', { message: 'failed', reason: 'token invalid' });
            return;
        }
        const verified = jwt.verify(token, process.env.jwtSecret);
        if (thisUserId !== verified.id) {
            socket.emit('server_send_conversation', { message: 'failed', reason: 'token invalid' });
            return;
        }
        let data = [];
        let totalNewMessage = 0;
        var conversations = [];
        let conversationFirst = await Conversation.find({ firstUser: thisUserId });
        let conversationSecond = await Conversation.find({ secondUser: thisUserId });
        for (let conversation in conversationFirst) {
            conversations.push(conversationFirst[conversation]);
        }
        for (let conversation in conversationSecond) {
            conversations.push(conversationSecond[conversation]);
        }
        //console.log(conversations);
        // let endFor = conversations.length < index + count ? conversations.length : index + count;
        for (let i = 0; i < conversations.length; i++) {
            let x = conversations[i];
            if (x.conversationId == null || x.conversationId == "") {
                continue;
            }
            let conversationInfo = {
                id: null,
                partner: {
                    id: null,
                    username: null,
                    avatar: null
                },
                lastMessage: {
                    message: null,
                    created: null,
                },
                numNewMessage: 0
            }
            let partner, lastDialog;
            if (x.firstUser == thisUserId) {
                partner = await User.findById(x.secondUser);
            }
            else {
                partner = await User.findById(x.firstUser);
            }
            lastDialog = x.dialog[x.dialog.length - 1];
            conversationInfo.id = x.conversationId;
            conversationInfo.partner.id = partner._id;
            conversationInfo.partner.username = partner.name;
            conversationInfo.partner.avatar = partner.avatar.url;
            conversationInfo.lastMessage.message = lastDialog?.content;
            conversationInfo.lastMessage.created = lastDialog?.created;
            var numNewMessage = 0;
            for (let j = x.dialog.length - 1; j >= 0; j--) {
                if (x.dialog[j].unread == "1" && x.dialog[j].sender.toString() !== thisUserId) {
                    numNewMessage += 1;
                }
                else break;
            }
            if (numNewMessage > 0) totalNewMessage += 1;
            conversationInfo.numNewMessage = numNewMessage;
            data.push(conversationInfo);
        }
        socket.emit('server_send_list_conversation', { message: 'OK', data: data, totalNewMessage: totalNewMessage });
    });


}


// module.exports = router;
