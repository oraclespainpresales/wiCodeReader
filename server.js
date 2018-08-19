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
    , path = require('path')
    , fs = require('fs-extra')
;

// Log stuff
const PROCESS = 'PROCESS'
    , REST    = 'REST'
    , CAMERA  = 'CAMERA'
    , CODE    = 'CODE'
;
log.level = 'verbose';
log.timestamp = true;

class Event extends EventEmitter {}
const event = new Event();

// Web server stuff
var mime = {
    html: 'text/html',
    txt: 'text/plain',
    css: 'text/css',
    gif: 'image/gif',
    jpg: 'image/jpeg',
    png: 'image/png',
    svg: 'image/svg+xml',
    js: 'application/javascript'
};

// Initializing REST server BEGIN
const PORT = 8886
    , restURI  = '/reader'
    , takeURI  = '/take'
    , lastURI  = '/last'
    , listURI  = '/list'
    , cleanURI = '/clean'
    , viewURI  = '/view/:filename'
;

var app    = express()
  , router = express.Router()
  , server = http.createServer(app)
;

// Misc
const IMAGES  = './images/'
    , DEMOZONEFILE  = '/demozone.dat'
    , DEFAULTDEMOZONE = 'MADRID'
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

// Get demozone Data
var DEMOZONE = DEFAULTDEMOZONE;
fs.readFile(DEMOZONEFILE,'utf8').then((data)=>{DEMOZONE=data.trim()}).catch(() => {});
log.info(PROCESS, 'Working for demozone: %s', DEMOZONE);

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
  log.verbose(CODE, "Looking for a barcode...");
  code.decodeSingle({
    src: IMAGES + filename,
    numOfWorkers: 0,  // Needs to be 0 when used within node
    inputStream: {
      size: 640  // restrict input-size to be 800px in width (long-side)
    },
    decoder: {
      readers: ["code_128_reader"] // List of active readers
    }
  }, (result) => {
    var response = { result: "Failure", message: "No result available" };
    if (result) {
      if(result.codeResult) {
        delete response.message;
        response.result = "Success";
        response.filename = filename;
        response.code = result.codeResult.code;
        log.verbose(CODE, "Code detected: '%s'", result.codeResult.code);
      } else {
        response.message = "No code detected";
        log.verbose(CODE, response.message);
      }
    } else {
      log.error(CODE, "No result available!");
    }
    event.emit('finished', response);
  });
});

camera.on("exit", (timestamp) => {
  log.verbose(CAMERA, "Photo take ended");
});

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(restURI, router);

router.get(takeURI, (req, res) => {
  var prefix = (fs.readdirSync(IMAGES).length + 1).toString().padStart(4,'0');
  var filename = DEMOZONE + "_" + prefix + "_" + uuid() + ".jpg";
  log.verbose(REST, "Photo take requested. Random filename: %s", filename);
  camera.set("output", IMAGES + filename);
  event.once('finished', function(result) {
    res.status(200).send(result);
    res.end();
  });
  camera.start();
});

router.get(viewURI, function (req, res) {
  serveImage(req.params.filename, res);
});

router.get(lastURI, function (req, res) {
  var dir = IMAGES;
  var files = fs.readdirSync(dir);
  files = files.map(function (fileName) {
    return {
      name: fileName,
      time: fs.statSync(dir + '/' + fileName).mtime.getTime()
    };
  })
  .sort(function (a, b) {
    return b.time - a.time; })
  .map(function (v) {
    return v.name; });

  serveImage(files[0], res);
});

router.get(cleanURI, function (req, res) {
  fs.emptyDir(IMAGES)
  .then(() => {
    res.status(200).send({ result: "Success" });
  })
  .catch(err => {
    res.status(200).send({ result: "Failure", message: err });
  })
});

server.listen(PORT, () => {
  log.info(REST, "REST Server initialized successfully");
});

function serveImage( filename, res) {
  var file = 'images/' + filename;
  var type = mime[path.extname(file).slice(1)] || 'text/plain';
  var s = fs.createReadStream(file);
  s.on('open', function () {
    res.set('Content-Type', type);
    s.pipe(res);
  });
  s.on('error', function () {
    res.set('Content-Type', 'text/plain');
    res.status(404).end('Not found');
  });
}
