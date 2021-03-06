/* Cheatsheet:

    users               (to front)            sending info about online users
    stash               (to front)            send unrecieved messages 
    getStash            (from front)          call for stash check
    ready               (to front)            set ready flag to activate RTC 
    close               (bi-direction)        handling close flag
    room                (from front)          join room
    recieveViaSocket    (from front)          recieving messages through WebSocket
    sendViaSocket       (to front)            sending messages through WebSocket
    candidate           (bi-direction)        handling RTC candidate 
    offer               (bi-direction)        handling RTC offer
    answer              (bi-direction)        handling RTC answer
    setSocket           (to front)            sending flag to set type of chatting = WebSocket
    setRTC              (to front)            sending flag to set type of chatting = WebRTC

*/
let db = require("../models");

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

        socket.on("room", function(room) {
            // Входим в запрошенную комнату
            socket.join(room);
            // Проверяем есть ли в комнате оба клиента, если да, то коннектим их через WebRTC
            const roomNow = io.sockets.adapter.rooms[room];
            if(roomNow.length === 1){
                //Set socket chat
                io.to(room).emit('setSocket');
            } else if(roomNow.length === 2){
                //Set RTC chat
                io.to(room).emit('setRTC');
                socket.to(room).emit('ready');
            } else if(roomNow.length > 2)
                socket.leave(room);
        });
        
        socket.on('sendViaSocket', function(json){
            const room = json.room;
            const message = json.message;
            const from = json.from;
            const to = json.to;
            let toSocketId = usermap[to];
            if(toSocketId !== undefined){
                //Sending to client directly
                let answer = {
                    room: room,
                    message: message,
                    user: from
                }
                for(let index in toSocketId) {
                    socket.to(toSocketId[index][0].id).emit('recieveViaSocket', answer);
                }
            }else{
                //Sending to temporary storage in relay database
                db.stash.create({ 
                    from: from, 
                    to: to,
                    message: message,
                    time: Date.now().toString() 
                })
            }
        });

        socket.on('getStash', function(user){
            db.stash.findAll({
                where: {
                  to: user
                }
            }).then((data) => {
                socket.emit('stash', data);
                db.stash.destroy({
                    where: {
                        to: user
                    }
                })
            });
        });
        
        socket.on('candidate', function(json){
            socket.to(json.room).emit('candidate', json.candidate);
        });

        socket.on('offer', function(json){
            socket.to(json.room).emit('offer', json.offer);
        });

        socket.on('answer', function(json){
            socket.to(json.room).emit('answer', json.answer);
        });

        socket.on('close', function(room){
            io.to(room).emit('setSocket');
            socket.to(room).emit('close');
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