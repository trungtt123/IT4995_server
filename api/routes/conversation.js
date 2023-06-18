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

router.get('/get-list-conversation', verify, async (req, res) => {
    const { userId, token } = req.query;
    console.log('userId', userId)
    const user = await User.findOne({ _id: userId });
    if (!user) {
        res.status(200).send({
            code: "1000",
            message: "OK",
            data: []
        });
    }
    const listConversation = await Conversation.find({ _id: { $in: user.conversations } });
    res.status(200).send({
        code: "1000",
        message: "OK",
        data: listConversation
    });
});

router.post('/create', verify, async (req, res) => {
    let { userId, conversationName } = req.body;
    const user = await User.findOne({ _id: userId });
    let newConveration = await Conversation.create({});
    let participants = newConveration.participants;
    participants.push({
        user: userId,
        permissions: 'owner'
    });
    user.conversations.push(newConveration._id);
    if (!conversationName) conversationName = "Cuộc hội thoại mới"
    let updateData = await Conversation.findOneAndUpdate({ _id: newConveration._id },
        {
            participants: participants,
            conversationName: conversationName,
        }, { new: true, useFindAndModify: false });
    await user.save();
    const listConversation = await Conversation.find({ _id: { $in: user.conversations } });
    _io.in(userId).emit('conversation_change',
        {
            message: 'OK',
            conversations: listConversation
        }
    );
    res.status(200).send({
        code: "1000",
        message: "OK",
        data: updateData
    });
});
router.post('/add-member', verify, async (req, res) => {
    let { phoneNumber, conversationId } = req.body;
    console.log(phoneNumber, conversationId)
    const user = await User.findOne({ phoneNumber: phoneNumber });
    if (!user) return;
    let converation = await Conversation.findOne({ _id: conversationId });
    let participants = converation.participants;
    participants.push({
        user: user._id
    })
    let updateData = await Conversation.findOneAndUpdate({ _id: conversationId },
        {
            participants: participants,
        }, { new: true, useFindAndModify: false });
    user.conversations.push(conversationId);
    await user.save();
    const listConversation = await Conversation.find({ _id: { $in: user.conversations } });
    _io.in(user._id.toString()).emit('conversation_change',
        {
            message: 'OK',
            conversations: listConversation
        }
    );
    res.status(200).send({
        code: "1000",
        message: "OK",
        data: updateData
    });
});
router.get('/conversation', verify, async (req, res) => {
    let conversationId = req.query.conversationId;
    console.log(conversationId);
    let conversation = await Conversation.findOne({ _id: conversationId });
    for (let i = 0; i < conversation.participants.length; i++) {
        conversation.participants[i].user =
            await User.findOne({ _id: conversation.participants[i].user }).select({ "avatar": 1, "name": 1, "_id": 1, "phoneNumber": 1 })
    }
    // let updateData = await Conversation.findOneAndUpdate({ _id: newConveration._id }, { participants: participants }, { new: true, useFindAndModify: false });
    res.status(200).send({
        code: "1000",
        message: "OK",
        data: conversation
    });
});

module.exports = router;
