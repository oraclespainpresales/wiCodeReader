'use strict';

// Module imports
const express = require('express')
    , http = require('http')
    , bodyParser = require('body-parser')
    , log = require('npmlog-ts')
    , _ = require('lodash')
    , RaspiCam = require("raspicam")
    , code = require('quagga').default
    , uuid = require('uuid/v4')
    , EventEmitter = require('events')
;

log.level = 'verbose';
log.timestamp = true;

class Event extends EventEmitter {}
const event = new Event();

// Initializing REST server BEGIN
const PORT = process.env.READERPORT || 8886
    , restURI    = '/reader'
    , pictureURI = '/take'
    , lastURI    = '/last'
    , listURI    = '/list'
    , clearURI   = '/clear'
;

var app    = express()
  , router = express.Router()
  , server = http.createServer(app)
;

// Misc
const PROCESS = 'PROCESS'
    , REST    = 'REST'
    , CAMERA  = 'CAMERA'
    , CODE    = 'CODE'
;

// Detect CTRL-C
process.on('SIGINT', function() {
  log.info(PROCESS, "Caught interrupt signal");
  log.info(PROCESS, "Exiting gracefully");
  process.removeAllListeners()
  if (typeof err != 'undefined')
    log.error(PROCESS, err)
  process.exit(2);
});

var camera = new RaspiCam({
    mode: "photo",
    output: "dummy",
    encoding: "jpg",
    log: () =>{},
    timeout: 500 // take the picture immediately
});

camera.on("start", (err, timestamp) => {
  log.verbose(CAMERA, "Photo take started...");
});

camera.on("read", (err, timestamp, filename) => {
  log.verbose(CAMERA, "Photo take completed. File: %s", filename);
  code.decodeSingle({
      src: __dirname + '/images/' + filename,
      numOfWorkers: 0,  // Needs to be 0 when used within node
      inputStream: {
          size: 640  // restrict input-size to be 800px in width (long-side)
      },
      decoder: {
          readers: ["code_128_reader"] // List of active readers
      },
  }, (result) => {
    if (result) {
      event.emit('finished', result);
      if(result.codeResult) {
        log.verbose(CODE, "result: '%s'", result.codeResult.code);
      } else {
        log.verbose(CODE, "not detected");
      }
    } else {
      log.error(CODE, "No result available!");
    }
  });
});

camera.on("exit", (timestamp) => {
  log.verbose(CAMERA, "Photo take ended");
});

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(restURI, router);

router.get(pictureURI, (req, res) => {
  var filename = uuid() + ".jpg";
  log.verbose(REST, "Photo take requested. Random filename: %s", filename);
  camera.set("output", "./images/" + filename);
  camera.start();
  event.once('finished', function(result) {
    res.status(200).send(result);
    res.end();
  });
});

server.listen(PORT, () => {
  log.info(REST, "REST Server initialized successfully");
});
