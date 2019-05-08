let express = require('express');
let router = express.Router();

let http = require('http').Server(router);
let io = require('socket.io')(http);

io.on('connection', (socket) => {
 
})

module.exports = router;