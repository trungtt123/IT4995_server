const admin = require('firebase-admin')

// Initialize firebase admin SDK
admin.initializeApp({
  credential: admin.credential.cert(__dirname + "/product-upload-facebook-media-firebase.json"),
  storageBucket: 'product-upload-facebook-media.appspot.com'
})
// Cloud storage
const bucket  = admin.storage().bucket();

module.exports = {
  bucket 
}
