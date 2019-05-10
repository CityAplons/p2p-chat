module.exports = function (io, usermap) {
    io.sockets.on('connection', (socket) => {
        let user = socket.handshake.query.user;

        //Handle multiple sockets
        let map = usermap[user] || {
            sockets: []
          };
        map.sockets.push(socket);
        usermap[user] = map;  
        
        //Send to client online users
        io.emit('users', Object.keys(usermap));
        
        //webrtc socket fetch
        socket.on('join', function(room){
            socket.join(room);
            io.in(room).emit('ready', room);
        });

        socket.on("room", function(room) {
            let room_users = room.split("_");
            let from = room_users[0];
            let to = room_users[1];
			// Входим в запрошенную комнату
            socket.join(room);
            // Отправялем второму пользователю приглашение
            toSocketId = usermap[to];
            for(let index in toSocketId) { 
                io.to(toSocketId[index][0].id).emit('join', room);
            };
		});
        
        socket.on('candidate', function(json){
            io.to(json.room).emit('candidate', json.candidate);
        });

        socket.on('offer', function(json){
            console.log('relaying offer');
            io.to(json.room).emit('offer', json.offer);
        });

        socket.on('answer', function(json){
            console.log('relaying answer');
            io.to(json.room).emit('answer', json.answer);
        });

        //Emty socket on disconnect
        socket.on("disconnect", function() {
            let index = map.sockets.indexOf(socket);
            if (index > -1) map.sockets.splice(index, 1);
            if (usermap[user].sockets.length == 0)  {
                delete usermap[user];
            }
            io.emit('users', Object.keys(usermap));
		});
    });
};