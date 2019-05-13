$(document).ready(function (){
    //Globals
    const username = $("#user").html();
    const userId = $("#user").data("id");
    let chatChannel = "socket";
    let currentRoom = "";

    console.log(`User: [${userId}] ${username}`);

    //Declaring indexedDB to store objects locally
    if (!('indexedDB' in window)) {
        console.log('This browser doesn\'t support IndexedDB');
        return;
    }

    const idb = window.indexedDB || window.mozIndexedDB || window.webkitIndexedDB || window.msIndexedDB;
    
    let dbPromise = idb.open('clientDB', 3);
 
    dbPromise.onupgradeneeded = function(event) { 
        let db = event.target.result;
        db.createObjectStore('keys', {keyPath: 'userId'});
        let chatHistory = db.createObjectStore('messages', { keyPath: "id", autoIncrement:true });
        chatHistory.createIndex("chatId", "chatId", { unique: false });
    };

    //ECDH key pairs checks and generation
    dbPromise.onsuccess = function(event) {
        let db = this.result;
        let tx = db.transaction('keys');
        let obj = tx.objectStore('keys');
        let req = obj.get(userId);
        req.onsuccess = function(event){
            if(this.result === undefined){
                window.crypto.subtle.generateKey(
                    {
                      name: "ECDH",
                      namedCurve: "P-521"
                    },
                    true,
                    ["deriveKey", "deriveBits"]
                  ).then((keyPair) => {
                    console.log(`No keypair found on this account! Generating new one...`);
                    console.log(keyPair);
                    let txAddKey = db.transaction('keys', 'readwrite');
                    let keyDB = txAddKey.objectStore('keys');
                    let item = {
                        userId: userId,
                        key: keyPair
                    };
                    keyDB.add(item); 
                    sendKey(keyPair.publicKey);          
                }); 
            } else {
                sendKey(this.result.key.publicKey);
            }
        }
        function sendKey(pubKey){
            //Send current public key to relay
            window.crypto.subtle.exportKey(
                "jwk",
                pubKey
            ).then(function(keydata){
                $.ajax({
                    type: "POST",
                    url: `/${userId}/updateKey`,
                    data: { raw: JSON.stringify(keydata) },
                    success: function(data){
                        console.log("Key data on relay was successfully updated!");
                    }
                });
            })
        }
    
    }

    //Filter users
    $("#findUser").on("keyup", function() {
        var value = $(this).val().toLowerCase();
        $("#users h4").filter(function() {
          $(this).parent().toggle($(this).text().toLowerCase().indexOf(value) > -1)
        });
    });

    //Get info about user
    $(document).on("click", ".info-button", function (){
        const user = $(this).parent().data("id");
        const btnOffset = $(this).offset();
        const x = btnOffset.left;
        const y = btnOffset.top + 60;
        $(this).addClass("hovered");
        $.ajax({
            type: "GET",
            url: `/${user}/getUserInfo`,
            success: function(data){
                let key = JSON.parse(data['key']);
                let template = $("#modal");
                template.find(".mUsername").html(data['username']);
                template.find(".mFirst").html(data['firstname']);
                template.find(".mLast").html(data['lastname']);
                template.find(".mKey").html(key.x);
                template.css({top: y, left: x});
                template.show();
            }
        });
    });

    $(".container").click(function () {
        $("#modal").hide();
        $(".info-button").removeClass("hovered");
    })
    
    //WebSocket connection to relay
    let socket = io.connect("", { query: `user=${userId}` });

    //Channel controllers
    let numOfChannels = 0;
    let Channel = {
        establishConnection: function(){
            Channel.handlePeerConnection();
            Channel.createOffer();        
        },
        handlePeerConnection: function(){
            Channel.peerConnection = new RTCPeerConnection({
                iceServers: [{url: "stun:stun.l.google.com:19302" }]
            });
            Channel.peerConnection.onicecandidate = Channel.onIceCandidate;
            Channel.peerConnection.ondatachannel = Channel.receiveChannelCallback;
            socket.on('candidate', Channel.onCandidate);
        },
        sendData: function(data){
            Channel.dataChannel.send(data);
        },
        onIceCandidate: function(event){
            if (event.candidate){
                let ans = {
                    room: currentRoom,
                    candidate: event.candidate
                }
                socket.emit('candidate', ans);
            }
        },
        onCandidate: function(candidate){
            let rtcCandidate = new RTCIceCandidate(candidate);
            Channel.peerConnection.addIceCandidate(rtcCandidate);
        },
        createOffer: function(){
            let json = new Object();
            json.room = currentRoom;
            Channel.createDataChannel(currentRoom);
            console.log(`data channel ${currentRoom} created, creating offer`);
            Channel.peerConnection.createOffer(
                function(offer){
                    Channel.peerConnection.setLocalDescription(offer);
                    json.offer = offer;
                    socket.emit('offer', json);
                },
                function(err){
                    console.log(err);
                }
            );
        },
        onOffer: function(offer){
            console.log("Offer accepted");
            Channel.handlePeerConnection();
            Channel.createAnswer(offer);
        },
        createAnswer: function(offer){
            let rtcOffer = new RTCSessionDescription(offer);
            Channel.peerConnection.setRemoteDescription(rtcOffer);
            Channel.peerConnection.createAnswer(
                function(answer){
                    Channel.peerConnection.setLocalDescription(answer);
                    let ans = {
                        room: currentRoom,
                        answer: answer
                    }
                    socket.emit('answer', ans);
                },
                function(err){
                    console.log(err);
                }
            );
        },
        onAnswer: function(answer){
            let rtcAnswer = new RTCSessionDescription(answer);
            Channel.peerConnection.setRemoteDescription(rtcAnswer);
        },
        createDataChannel: function(label){
            console.log('creating data channel');
            Channel.dataChannel = Channel.peerConnection.createDataChannel(label, {});
            Channel.dataChannel.onerror = function(err){
                console.log(err);
            };
            Channel.dataChannel.onmessage = function(event) {
                console.log('got channel message: ' + event.data);
            };

            Channel.dataChannel.onopen = function(){
                console.log('channel opened');
                numOfChannels++;
            };
    
            Channel.dataChannel.onclose = function(){
                console.log('channel closed');
            };
    
        },
        receiveChannelCallback: function(event){
            console.log('received callback');
            let receiveChannel = event.channel;
            receiveChannel.onopen = function(){
                console.log('receive channel event open');
                if(numOfChannels < 1) Channel.establishConnection();
            };
            receiveChannel.onmessage = function(event){
                //Колхоз :Р
                let room_users = currentRoom.split("_");
                let user = "";
                let us1 = room_users[0];
                let us2 = room_users[1];
                if(us1 == userId)
                    user = us2;
                else if(us2 == userId)
                    user = us1;
                //Здесь кончается
                saveMessage(currentRoom, event.data, user);
            };
        },
        onClose: function(){
            let ans = currentRoom;
            socket.emit('close', ans);
            Channel.closeChannel;
        },
        closeChannel: function(){
            Channel.dataChannel.close();
            Channel.peerConnection.close();
            numOfChannels--;
        }
    };

    socket.on('setRTC', () => {
        chatChannel = "rtc";
        $("#relay-link").hide();
        $("#p2p-link").show(150);
        //Running RTC
        //RTC client states
        socket.on('ready', () => {
            Channel.establishConnection()
        });
        socket.on('answer', Channel.onAnswer);
        socket.on('offer', Channel.onOffer);
        socket.on('close', Channel.closeChannel);
    });

    //Closing connection
    $( document ).on('beforeunload',function() {
        if(chatChannel == "rtc") Channel.onClose();
    });

    socket.on('setSocket', () => {
        chatChannel = "socket";
        $("#relay-link").show();
        $("#p2p-link").hide(150);
    });
    
    //Joining to the chat
    $(document).on("click", ".chat-button", function (){
        const user = parseInt($(this).parent().data("id"));
        let room;
        if(parseInt(userId) < user)
            room = userId + "_" + user;
        else
            room = user + "_" + userId;
        const spinner = $(".sk-spinner-pulse");
        const server = $("#relay-link");
        const rtc = $("#p2p-link");
        let chatWindow = $("#chatWindow");
        let chatDiv = $(".chat");

        //Clearing chat
        chatDiv.removeClass("disabled");
        if(chatChannel == "rtc") Channel.onClose();
        chatWindow.empty();

        //Load old messages
        spinner.show();
        loadSavedMessages(room).then( result => {
            if(result){
                spinner.hide();
                server.show();
                //Scroll to the end of chat (костыль)
                setTimeout(() => {
                    chatWindow.scrollTop(chatWindow.prop("scrollHeight"));
                }, 100);
            }
        });

        addQuantityM(0,user);

        //Fetching username
        const username = $(this).parent().find("h4").html();
        chatDiv.find("#chatName").html(username);
        chatDiv.find("#chatName").data("id", room);
        currentRoom = room;
        chatWindow.data("room", room);

        //Enable message form
        $("#message").prop("disabled", false);
        
        //Connecting to Socket.io room
        console.log(`Joining to room ${room}`);
        socket.emit('room', room);

    });

    //Send message
    async function send(message, room) {
        if ( chatChannel === "rtc" ){
            Channel.sendData(message);
        } else {
            let json = new Object;
            json.room = room;
            json.message = message;
            json.from = userId;
            //Колхоз :Р
            let room_users = room.split("_");
            let us1 = room_users[0];
            let us2 = room_users[1];
            if(us1 == userId)
                json.to = us2;
            else if(us2 == userId)
                json.to = us1;
            //Здесь кончается
            socket.emit('sendViaSocket', json); 
        }
    }

    //On socket message
    socket.on('recieveViaSocket', function(data){  
        console.log(`Recieved message via socket to the ${data.room} chat. Saving...`);
        saveMessage(data.room, data.message, data.user);
        addQuantityM(1, data.user);
    });

    //load users
    socket.on('users', function (data) {
        $("#users").empty();
        data.forEach(element => {
            if(element != userId)
            $.ajax({
                type: "GET",
                url: `/${element}/getUserInfo`,
                success: function(data2){
                    let template = `
                    <div data-id="${data2['id']}" class="user noselect">
                        ${jdenticon.toSvg(data2['username'], 60)}
                        <h4>${data2['username']}</h4>
                        <span class="info-button">ℹ</span>
                        <span class="chat-button">✉</span>
                    </div>`
                    $("#users").append(template);
                }
            });
        });
    });

    //fetch saved messages
    async function loadSavedMessages(chatId){
        let dbPromise = idb.open('clientDB', 3);
        dbPromise.onsuccess = await function() {
            let db = this.result;
            let dbTransaction = db.transaction(["messages"]);
            let messages = dbTransaction.objectStore("messages");
            let index = messages.index('chatId'); 
            let chatWindow = $("#chatWindow");
            index.openCursor(chatId).onsuccess = function(event) {
                let cursor = event.target.result;
                if (cursor) {
                    let self = "";
                    if(cursor.value.user === userId) self = "self";
                    let messageTemplate = `
                        <div class="message ${self}">
                            <p>${cursor.value.message}</p>
                            <span class="time">${moment(cursor.value.timestamp).format('HH:mm:ss DD MMMM YYYY')}</span>
                        </div><br>
                    `;
                    chatWindow.append(messageTemplate);
                    cursor.continue();
                }
            };
        }
        return true;
    }

    //save message to local DB
    async function saveMessage(chatId, message, user){
        let dbPromise = idb.open('clientDB', 3);
        dbPromise.onsuccess = function() {
            let db = this.result;
            let dbTransaction = db.transaction(["messages"], 'readwrite');
            let messages = dbTransaction.objectStore("messages");
            let mesObj = {
                chatId: chatId,
                user: user,
                message: message,
                timestamp: Date.now()
            };
            let save = messages.add(mesObj);
            save.onerror = function(event) {
                // Handle errors!
                console.log("Something went wrong with local DB :(")
            };
            save.onsuccess = function(event) {
                //Display message if chat window opened
                const openedChat = $("#chatName").data("id");
                let chatWindow = $("#chatWindow");
                if(openedChat !== undefined)
                    if(openedChat == chatId){
                        let self = "";
                        if(userId == user) self = "self";
                        let messageTemplate = `
                        <div class="message ${self}">
                            <p>${message}</p>
                            <span class="time">${moment(Date.now()).format('HH:mm:ss DD MMMM YYYY')}</span>
                        </div><br>
                        `;
                        chatWindow.append(messageTemplate);
                        chatWindow.scrollTop(chatWindow.prop("scrollHeight"));
                        $(`.user[data-id="${user}"]`).find('.chat-button').text("✉");
                    }
            };
        }
    }
    
    function addQuantityM(q, user) {
        let userId = $(`.user[data-id="${user}"]`);
        let btn = userId.find('.chat-button');
        if(q>0){
            let cur = btn.text();
            userId.prependTo("#users");
            btn.empty();
            if(cur !== "✉"){
                cur = parseInt(cur);
                let now = cur + q;
                btn.text(now);
            } else {
                btn.text(q);
            }
        } else if (q === 0){
            btn.text("✉");
        }
    }

    //handle message form for submit
    $(document).on('submit','.messageForm', (event) => {
        event.preventDefault();
        let messageInput = $("#message");

        const message = messageInput.val();
        messageInput.val("");
        messageInput.prop("disabled", true);

        const room = $("#chatName").data("id");
        if(room) send(message, room).then(() => {
            saveMessage(room, message, userId);
            messageInput.prop("disabled", false);
            messageInput.focus();
        });

    });

})