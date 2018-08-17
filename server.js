'use strict';

// Module imports
const express = require('express')
    , http = require('http')
    , bodyParser = require('body-parser')
    , log = require('npmlog-ts')
    , _ = require('lodash')
    , RaspiCam = require("raspicam")
    , Quagga = require('quagga').default
    , uuid = require('uuid/v4')
;

log.level = 'verbose';
log.timestamp = true;

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
    log: null,
    timeout: 500 // take the picture immediately
});

camera.on("start", (err, timestamp) => {
    console.log(" photo started at " + timestamp );
});

camera.on("read", (err, timestamp, filename) => {
    console.log(" read at " + timestamp + " with filename "+ filename);
});

camera.on("exit", (timestamp) => {
    console.log(" exit at " + timestamp );
});

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(restURI, router);

router.get(pictureURI, (req, res) => {
  var filename = uuid() + ".jpg";
  camera.set("output", "./images/" + filename);
  camera.start();
  res.status(204).send();
  res.end();
});

server.listen(PORT, () => {
  log.info(REST, "REST Server initialized successfully");
});
