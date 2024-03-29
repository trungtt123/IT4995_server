const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const validInput = require('../../utils/validInput');
const verify = require('../../utils/verifyToken');
const { responseError, callRes } = require('../../response/error');
const checkInput = require('../../utils/validInput');
const validTime = require('../../utils/validTime');
const User = require('../../models/User');
var multer = require('multer');
const { Storage } = require('@google-cloud/storage');
const MAX_SIZE_IMAGE = 10 * 1024 * 1024; // for 10MB
const MAX_IMAGE_NUMBER = 4;
const MAX_VIDEO_NUMBER = 1;
const MAX_SIZE_VIDEO = 10 * 1024 * 1024; // for 10MB
const { getUserIDFromToken } = require('../../utils/getUserIDFromToken');


// Create a bucket associated to Firebase storage bucket
const { bucket } = require('../firebase');

// Initiating a memory storage engine to store files as Buffer objects
const uploader = multer({
  storage: multer.memoryStorage(),
});
router.post('/get_user_from_phone', verify, async (req, res) => {
  let { token, phoneNumber } = req.query;
  let tokenUser;
  if (token) {
    tokenUser = await getUserIDFromToken(token);
    if (tokenUser && typeof tokenUser === 'string') return callRes(res, responseError[tokenUser]);
  }
  if (!phoneNumber) return callRes(res, responseError.PARAMETER_IS_NOT_ENOUGH);
  if (typeof phoneNumber !== 'string') return callRes(res, responseError.PARAMETER_TYPE_IS_INVALID, 'phoneNumber');
  let data = {
    id: null,
    username: null,
    created: null,
    description: null,
    avatar: null,
    cover_image: null,
    link: null,
    address: null,
    city: null,
    country: null,
    listing: null,
    is_friend: null,
    online: null,
    phoneNumber: null,
    is_myself: null
  }
  try {
    const user = await User.findOne({ phoneNumber: phoneNumber });
    if (!user) return callRes(res, responseError.NO_DATA_OR_END_OF_LIST_DATA, 'user');
    data.id = user._id.toString();
    data.username = user.name;
    data.created = validTime.timeToSecond(user.createdAt);
    data.description = user.description;
    data.avatar = user.avatar.url;
    data.cover_image = user.coverImage.url;
    data.link = user.link;
    data.address = user.address;
    data.city = user.city;
    data.country = user.country;
    data.birthday = validTime.timeToSecond(user.birthday);
    data.listing = user.friends.length;
    data.is_friend = false;
    data.phoneNumber = user.phoneNumber;
    if (user._id.toString() !== tokenUser.id) {
      let indexExist = user.friends.findIndex(element => element.friend._id.equals(tokenUser.id));
      data.is_friend = (indexExist >= 0) ? true : false;
    }
    else {
      data.is_myself = true;
    }
    return callRes(res, responseError.OK, data);
  }
  catch (error) {
    return callRes(res, responseError.UNKNOWN_ERROR, error.message);
  }
});
router.post('/get_user_info', async (req, res) => {
  let { token, user_id } = req.query;
  let tokenUser, tokenError;
  if (token) {
    tokenUser = await getUserIDFromToken(token);
    if (tokenUser && typeof tokenUser === 'string') return callRes(res, responseError[tokenUser]);
  }
  if (!user_id && tokenUser) {
    user_id = tokenUser.id;
  }
  else {
    if (user_id && typeof user_id != 'string')
      return callRes(res, responseError.PARAMETER_TYPE_IS_INVALID, 'user_id');
  }
  if (!user_id) return callRes(res, responseError.PARAMETER_IS_NOT_ENOUGH)
  let user;
  let data = {
    id: null,
    username: null,
    created: null,
    description: null,
    avatar: null,
    cover_image: null,
    link: null,
    address: null,
    city: null,
    country: null,
    listing: null,
    is_friend: null,
    online: null,
    phoneNumber: null
  }
  try {
    user = await User.findById(user_id);
    if (!user) return callRes(res, responseError.NO_DATA_OR_END_OF_LIST_DATA, 'user');
    if (tokenUser && user_id != tokenUser.id && user.blockedList) {
      let index = user.blockedList.findIndex(element => element.user._id.equals(tokenUser.id));
      if (index >= 0) return callRes(res, responseError.USER_IS_NOT_VALIDATED, 'bị block rồi em ơi, khổ quá');
      let index1 = tokenUser.blockedList.findIndex(element => element.user._id.equals(user.id));
      if (index1 >= 0) return callRes(res, responseError.USER_IS_NOT_VALIDATED, 'bị block rồi em ơi, khổ quá');
    }
    data.id = user._id.toString();
    data.username = user.name;
    data.created = validTime.timeToSecond(user.createdAt);
    data.description = user.description;
    data.avatar = user.avatar.url;
    data.cover_image = user.coverImage.url;
    data.link = user.link;
    data.address = user.address;
    data.city = user.city;
    data.country = user.country;
    data.birthday = validTime.timeToSecond(user.birthday);
    data.listing = user.friends.length;
    data.is_friend = false;
    data.phoneNumber = user.phoneNumber;
    if (tokenUser && user_id != tokenUser.id) {
      let indexExist = user.friends.findIndex(element => element.friend._id.equals(tokenUser.id));
      data.is_friend = (indexExist >= 0) ? true : false;
    }
    return callRes(res, responseError.OK, data);
  } catch (error) {
    return callRes(res, responseError.UNKNOWN_ERROR, error.message);
  }
});
var uploadMedia = uploader.fields([{ name: 'image' }, { name: 'video' }]);
router.post('/upload_media', uploadMedia, verify, async (req, res, next) => {
  try {
    var image, video;
    if (req.files) {
      image = req.files.image;
      video = req.files.video;
    }
    let data = {
      image: [],
      video: []
    }
    let promises;
    if (image) {
      console.log('image length', image.length);
      // MAXIMUM_NUMBER_OF_IMAGES
      if (image.length > MAX_IMAGE_NUMBER) {
        console.log("MAXIMUM_NUMBER_OF_IMAGES");
        return setAndSendResponse(res, responseError.MAXIMUM_NUMBER_OF_IMAGES);
      }

      for (const item_image of image) {
        const filetypes = /jpeg|jpg|png/;
        const mimetype = filetypes.test(item_image.mimetype);
        // PARAMETER_TYPE_IS_INVALID
        if (!mimetype) {
          console.log("Mimetype image is invalid");
          return setAndSendResponse(res, responseError.PARAMETER_VALUE_IS_INVALID);
        }

        // FILE_SIZE_IS_TOO_BIG
        if (item_image.buffer.byteLength > MAX_SIZE_IMAGE) {
          console.log("FILE_SIZE_IS_TOO_BIG");
          return setAndSendResponse(res, responseError.FILE_SIZE_IS_TOO_BIG);
        }
      }

      promises = image.map(item_image => {
        return uploadFile(item_image);
      });
      try {
        const file = await Promise.all(promises);
        data.image = file;
      } catch (err) {
        console.error(err);
        console.log("UPLOAD_FILE_FAILED");
        return setAndSendResponse(res, responseError.UPLOAD_FILE_FAILED);
      }

    }

    if (video) {
      if (video.length > MAX_VIDEO_NUMBER) {
        console.log("MAX_VIDEO_NUMBER");
        return setAndSendResponse(res, responseError.PARAMETER_VALUE_IS_INVALID);
      }

      for (const item_video of video) {
        const filetypes = /mp4/;
        const mimetype = filetypes.test(item_video.mimetype);
        if (!mimetype) {
          console.log("Mimetype video is invalid");
          return setAndSendResponse(res, responseError.PARAMETER_VALUE_IS_INVALID);
        }

        if (item_video.buffer.byteLength > MAX_SIZE_VIDEO) {
          console.log("Max video file size");
          return setAndSendResponse(res, responseError.FILE_SIZE_IS_TOO_BIG);
        }
      }

      promises = req.files.video.map(video => {
        return uploadFile(video);
      });
      try {
        const file = await Promise.all(promises);
        data.video = file;
      } catch (err) {
        console.log("UPLOAD_FILE_FAILED");
        return setAndSendResponse(res, responseError.UPLOAD_FILE_FAILED);
      }
    }
    return callRes(res, responseError.OK, data);
  }
  catch (e) {
    return callRes(res, responseError.UNKNOWN_ERROR, error.message);
  }
});

var cpUpload = uploader.fields([{ name: 'avatar' }, { name: 'cover_image' }]);
router.post('/set_user_info', cpUpload, verify, async (req, res) => {
  let { username, description, address, city, country, link, birthday } = req.query;
  let fileAvatar, fileCoverImage, linkAvatar, linkCoverImage;
  let user, promise1, promise2, inputError;
  if (req.files) {
    console.log('req.files.avatar', req.files.avatar);
    if (req.files.avatar != undefined) {
      if (req.files.avatar.length > 1)
        return callRes(res, responseError.PARAMETER_VALUE_IS_INVALID, 'avatar >= 2 files');
      fileAvatar = req.files.avatar[0];
    }
    if (req.files.cover_image != undefined) {
      if (req.files.cover_image.length > 1)
        return callRes(res, responseError.PARAMETER_VALUE_IS_INVALID, 'cover_image >= 2 files');
      fileCoverImage = req.files.cover_image[0];
    }
  }
  if (username) {
    if (typeof username !== "string")
      return callRes(res, responseError.PARAMETER_TYPE_IS_INVALID, 'username');
    await checkInput.checkUserName(username)
      .then(result => console.log(result, ' passed!'))
      .catch(err => inputError = err)
    if (inputError) return callRes(res, responseError.PARAMETER_VALUE_IS_INVALID, 'username: ' + inputError);
  }
  if (description) {
    if (typeof description !== "string")
      return callRes(res, responseError.PARAMETER_TYPE_IS_INVALID, 'description');
    if (description.length > 150)
      return callRes(res, responseError.PARAMETER_VALUE_IS_INVALID, 'description length');
  }
  if (address && typeof address !== "string")
    return callRes(res, responseError.PARAMETER_TYPE_IS_INVALID, 'address');
  if (city && typeof city !== "string")
    return callRes(res, responseError.PARAMETER_TYPE_IS_INVALID, 'city');
  if (country && typeof country !== "string")
    return callRes(res, responseError.PARAMETER_TYPE_IS_INVALID, 'country');
  if (link) {
    if (typeof link !== "string")
      return callRes(res, responseError.PARAMETER_TYPE_IS_INVALID, 'link');
    if (!validInput.checkLink(link))
      return callRes(res, responseError.PARAMETER_VALUE_IS_INVALID, 'link ' + link + ' banned');
  }
  try {
    try {
      user = await User.findById(req.user.id);
    } catch (error) {
      return callRes(res, responseError.NO_DATA_OR_END_OF_LIST_DATA, 'user');
    }

    if (fileAvatar) {
      if (!checkSizeImage(fileAvatar))
        return callRes(res, responseError.FILE_SIZE_IS_TOO_BIG, 'avatar: file quá lớn, max = 4MB');
      if (!checkTypeImage(fileAvatar))
        return callRes(res, responseError.PARAMETER_TYPE_IS_INVALID, 'avatar: sai định dạng');
      if (user.avatar.filename) {
        try {
          console.log('xoa avatar...');
          await deleteRemoteFile(user.avatar.filename);
          console.log('xoa avatar xong!');
        } catch (error) {
          console.log('xoa avatar failed');
          return callRes(res, responseError.EXCEPTION_ERROR, error.message);
        }
      }
      try {
        promise1 = await uploadFile(fileAvatar);
        linkAvatar = promise1;
      } catch (error) {
        return callRes(res, responseError.UPLOAD_FILE_FAILED, error.message);
      }
    }
    if (fileCoverImage) {
      if (!checkSizeImage(fileCoverImage))
        return callRes(res, responseError.FILE_SIZE_IS_TOO_BIG, 'cover_image: file quá lớn, max = 4MB');
      if (!checkTypeImage(fileCoverImage))
        return callRes(res, responseError.PARAMETER_TYPE_IS_INVALID, 'cover_image: sai định dạng');
      if (user.coverImage.filename) {
        try {
          console.log('xoa coverImage...');
          await deleteRemoteFile(user.coverImage.filename);
          console.log('xoa coverImage xong!');
        } catch (error) {
          console.log('xoa coverImage failed');
          return callRes(res, responseError.EXCEPTION_ERROR, error.message);
        }
      }
      try {
        promise2 = await uploadFile(fileCoverImage);
        linkCoverImage = promise2;
      } catch (error) {
        return callRes(res, responseError.UPLOAD_FILE_FAILED, error.message);
      }
    }
    if (username) user.name = username;
    if (description) user.description = description;
    if (address) user.address = address;
    if (city) user.city = city;
    if (country) user.country = country;
    if (link) user.link = link;
    if (linkAvatar) user.avatar = linkAvatar;
    if (linkCoverImage) user.coverImage = linkCoverImage;
    if (birthday) user.birthday = birthday;
    try {
      user = await user.save();
    } catch (error) {
      return callRes(res, responseError.CAN_NOT_CONNECT_TO_DB, error.message);
    }

    return callRes(res, responseError.OK, {
      avatar: user.avatar.url,
      cover_image: user.coverImage.url,
      link: user.link,
      address: user.address,
      city: user.city,
      country: user.country,
      username: user.name,
      description: user.description,
      birthday: validTime.timeToSecond(user.birthday)
    });
  } catch (error) {
    return callRes(res, responseError.UNKNOWN_ERROR, error.message);
  }
})



module.exports = router;

const checkSizeImage = (image) => image.size <= MAX_SIZE_IMAGE;

const checkTypeImage = (image) => {
  const filetypes = /jpeg|jpg|png/;
  return filetypes.test(image.mimetype);
}

function uploadFile(file) {
  const newNameFile = new Date().toISOString() + file.originalname;
  const blob = bucket.file(newNameFile);
  const blobStream = blob.createWriteStream({
    metadata: {
      contentType: file.mimetype,
    },
  });
  const publicUrl =
    `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURI(blob.name)}?alt=media`;
  return new Promise((resolve, reject) => {

    blobStream.on('error', function (err) {
      reject(err);
    });

    blobStream.on('finish', () => {
      resolve({
        filename: newNameFile,
        url: publicUrl
      });
    });

    blobStream.end(file.buffer);
  });
}

async function deleteRemoteFile(filename) {
  await bucket.file(filename).delete();
}
