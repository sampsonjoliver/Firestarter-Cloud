
// dependencies
// Pull in Firebase and GCloud deps
var firebase = require('firebase');
var gcloud = require('gcloud')({
  projectId: process.env.GCP_PROJECT,
});

var async = require('async');
var gm = require('gm').subClass({ imageMagick: true }); // Enable ImageMagick integration.
var util = require('util');

// Initialize Firebase App with service account
// TODO: get values from https://firebase.google.com/docs/server/setup#initialize_the_sdk
firebase.initializeApp({
  serviceAccount: {
    "project_id": "<your-project-id>",
    "private_key": "<your-private-key>",
    "client_email": "<your-service-account-email>"
  },
  databaseURL: "<your-database-url>"
});

// Get GCS, Cloud Vision API
var gcs = gcloud.storage()

// constants
var MAX_WIDTH  = 100;
var MAX_HEIGHT = 100;

// get reference to S3 client 
var s3 = new AWS.S3();
 
exports.resizeHandler = function(context, data) {
    var urlString = "https://firebasestorage.googleapis.com/v0/b/" + data.bucket + "/o/" + data.name.replace(/\//, '%2F') + "?alt=media&token=" + data.metadata.firebaseStorageDownloadTokens;
    var bucket = gcs.bucket(data.bucket)
    var file = bucket.file(data.name)
    
    async.waterfall([
        function download(callback) {
            file.download().then(function(data) {
                var contents = data[0]
                callback(null, contents)
            })
        },
        function transformImage(image, callback) {
            gm(image).size(function(err, size) {
                // Infer the scaling factor to avoid stretching the image unnaturally.
                var scalingFactor = Math.min(
                    MAX_WIDTH / size.width,
                    MAX_HEIGHT / size.height
                );
                var width  = scalingFactor * size.width;
                var height = scalingFactor * size.height;

                // Transform the image buffer in memory.
                this.resize(width, height)
                    .toBuffer(imageType, function(err, buffer) {
                        if (err) {
                            callback(err);
                        } else {
                            callback(null, response.ContentType, buffer);
                        }
                    });
            });
        },
        function upload(contentType, resizedImageBuffer, callback) {
            // Stream the transformed image to a different S3 bucket.
            var resizedFile = bucket.file(data.name + '-thumb')

            file.save(resizedImageBuffer, function(err) {
                if (err) {
                    callback(err)
                } else {
                    callback(null)
                }
            })
        }], 
        function(err) {
            if (err) {
                console.error(
                    'Unable to resize ' + srcBucket + '/' + srcKey +
                    ' and upload to ' + dstBucket + '/' + dstKey +
                    ' due to an error: ' + err
                );
            } else {
                console.log(
                    'Successfully resized ' + srcBucket + '/' + srcKey +
                    ' and uploaded to ' + dstBucket + '/' + dstKey
                );
            }

            context.success()
        }
    )
};