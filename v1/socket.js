module.exports = function (io, usermap) {
    io.sockets.on('connection', (socket) => {
        let user = socket.handshake.query.user;
        usermap[user] = socket;
        socket.emit('users', Object.keys(usermap));
    
        socket.on("disconnect", function() {
			delete usermap[user];
		});
    });
};