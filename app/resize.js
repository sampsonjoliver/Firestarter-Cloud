
// dependencies
// Pull in Firebase and GCloud deps
var firebase = require('firebase');
var gcloud = require('gcloud')({
  projectId: process.env.GCP_PROJECT,
});

// Get GCS, Cloud Vision API
var gcs = gcloud.storage();

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

// constants
var MAX_WIDTH  = 100;
var MAX_HEIGHT = 100;

var POSTFIX = "-thumb";

exports.resizeHandler = function(context, data) {
    var urlString = "https://firebasestorage.googleapis.com/v0/b/" + data.bucket + "/o/" + data.name.replace(/\//, '%2F') + "?alt=media&token=" + data.metadata.firebaseStorageDownloadTokens;
    var dstUrlString = "https://firebasestorage.googleapis.com/v0/b/" + data.bucket + "/o/" + (data.name + POSTFIX).replace(/\//, '%2F') + "?alt=media&token=" + data.metadata.firebaseStorageDownloadTokens;
    var mediaLink = data.mediaLink

    var bucket = gcs.bucket(data.bucket)
    var file = bucket.file(data.name)

    // Infer the image type.
    var decodedName = decodeURIComponent(data.name.replace(/\+/g, " "))
    var typeMatch = decodedName.match(/\.([^.]*)$/);
    if (!typeMatch) {
        callback("Could not determine the image type.");
        return;
    }
    var imageType = typeMatch[1];
    if (imageType != "jpg" && imageType != "png") {
        callback('Unsupported image type: ${imageType}');
        return;
    }

    async.waterfall([
        function download(callback) {
            Promise.all([
              file.download(),
              file.getMetadata();
          ]).then(function(fileData, metadata) {
            var contents = data[0]
            var metadata = data[0];
            callback(null, contents, metadata)
          }, function(err) {
            callback(err)
          })
        },
        function transformImage(image, metadata, callback) {
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
                            callback(null, response.ContentType, buffer, metadata);
                        }
                    });
            });
        },
        function upload(contentType, resizedImageBuffer, metadata, callback) {
            // Stream the transformed image to a different S3 bucket.
            var resizedFile = bucket.file(data.name + POSTFIX)

            file.save(resizedImageBuffer, {
                  metadata: metadata,
                  predefinedAcl: "publicRead"
                }, function(err) {
                    if (err) {
                        callback(err)
                    } else {
                        callback(null, metadata)
                    }
                })
        },
        function saveToFirebase(metadata, callback) {
            // todo save the mediaLink to a record in Firebase
            // Need to also infer the channel the image is from
            firebase.database().ref("/images/").push().set({
              uri: urlString,
              mediaLink: mediaLink,
              thumbUrl: dstUrlString,
              metadata: metadata
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
