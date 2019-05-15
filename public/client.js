$(document).ready(function (){
    //Globals
    const username = $("#user").html();
    const userId = $("#user").data("id");
    let currentAesKey;
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
        let chatHistory = db.createObjectStore('messages', { keyPath: "timestamp" });
        chatHistory.createIndex("chatQuery", "chatId", { unique: false });
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
                    window.crypto.subtle.exportKey(
                        "jwk",
                        keyPair.privateKey 
                    )
                    .then(function(keydata){
                        const private = keydata;
                        window.crypto.subtle.exportKey(
                            "jwk", 
                            keyPair.publicKey
                        )
                        .then(function(keydata2){
                            const public = keydata2;
                            let txAddKey = db.transaction('keys', 'readwrite');
                            let keyDB = txAddKey.objectStore('keys');
                            let item = {
                                userId: userId,
                                private: private,
                                public: public
                            };
                            console.log(item);
                            keyDB.put(item); 
                            sendKey(public); 
                        })
                        .catch(function(err){
                            console.error(err);
                        });      
                    })
                    .catch(function(err){
                        console.error(err);
                    });   
                }); 
            } else {
                sendKey(this.result.public);
            }
        }
        function sendKey(pubKey){
            //Send current public key to relay
            $.ajax({
                type: "POST",
                url: `/${userId}/updateKey`,
                data: { raw: JSON.stringify(pubKey) },
                success: function(data){
                    console.log("Key data on relay was successfully updated!");
                }
            });
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
                iceServers: [
                    {url: "stun:stun.l.google.com:19302" },
                    {
                        url: 'turn:turn.anyfirewall.com:443?transport=tcp',
                        credential: 'webrtc',
                        username: 'webrtc'
                    }
                ]
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
                Channel.dataChannel = null;
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
                const parseData = JSON.parse(event.data);
                const iv = new Uint8Array(obj2arr(parseData.iv));
                const message = new Uint8Array(obj2arr(parseData.encMessage));
                decrypt(currentAesKey, iv, message).then( message => {
                    //Костыль :Р
                    let room_users = currentRoom.split("_");
                    let user = "";
                    let us1 = room_users[0];
                    let us2 = room_users[1];
                    if(us1 == userId)
                        user = us2;
                    else if(us2 == userId)
                        user = us1;
                    const stringMess = ab2str(message)
                    //Здесь кончается
                    saveMessage(currentRoom, stringMess, user, null);
                })
            };
            receiveChannel.onclose = function(event){
                event.channel = null;
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
            Channel.dataChannel = null;
            Channel.peerConnection = null;
            numOfChannels--;
        }
    };

    //Recieving stashed messages
    socket.on('stash', (data) => {
        $.each(data, function(index, value) {
            const from = parseInt(value.from);
            const to = parseInt(value.to);
            const time = parseInt(value.time);
            let chat;
            if(from > to) chat = to + "_" + from;
            else chat = from + "_" + to;
            const parseData = JSON.parse(value.message);
            const iv = new Uint8Array(obj2arr(parseData.iv));
            const message = new Uint8Array(obj2arr(parseData.encMessage));
            setEnc(from).then( aesKey => {
                decrypt(aesKey, iv, message).then( message => {
                    const stringMess = ab2str(message)
                    saveMessage(chat, stringMess, from, time);
                });
            });
            addQuantityM(1,from);
        }); 
    });

    //Running RTC
    //RTC client states
    socket.on('ready', () => {
        Channel.establishConnection()
    });     
    socket.on('answer', Channel.onAnswer);
    socket.on('offer', Channel.onOffer);
    socket.on('close', Channel.closeChannel);

    //On successful reconection
    socket.on('reconnect', (attemptNumber) => {
        socket.emit('getStah', userId);
    });

    socket.on('setRTC', () => {
        chatChannel = "rtc";
        $("#relay-link").hide();
        $("#p2p-link").show(150);
    });

    //Closing connection
    $( window ).on('beforeunload',function() {
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

        //Setting up encryption
        setEnc(parseInt(user)).then( key => {
            currentAesKey = key;
        });
    
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

    //Text to ArrayBuffer
    function ab2str(buf) {
        return String.fromCharCode.apply(null, new Uint8Array(buf));
    }
    function str2ab(str) {
        var buf = new ArrayBuffer(str.length*2); // 2 bytes for each char
        var bufView = new Uint8Array(buf);
        for (var i=0, strLen=str.length; i < strLen; i++) {
            bufView[i] = str.charCodeAt(i);
        }
        return buf;
    }
    function obj2arr(obj){
        let result = Object.keys(obj).map(function(key) {
            return [obj[key]];
        });
        return result;
    }  

    async function encrypt(key, message) {
        return new Promise((resolve, reject) => {
            const iv = window.crypto.getRandomValues(new Uint8Array(16))
            window.crypto.subtle.encrypt(
                {
                    name: "AES-CBC",
                    iv
                },
                key,
                str2ab(message)
            )
            .then(function(encrypted){
                const encMessage = new Uint8Array(encrypted);
                ans = { encMessage, iv }
                resolve(ans)
            })
            .catch(function(err){
                console.error(err);
            });
        });
    }

    async function decrypt(key, secret, message) {
        return new Promise((resolve, reject) => {
            window.crypto.subtle.decrypt(
                {
                    name: "AES-CBC",
                    iv: secret,
                },
                key,
                message
            )
            .then(function(decrypted){
                //returns an ArrayBuffer containing the decrypted data
                resolve(new Uint8Array(decrypted));
            })
            .catch(function(err){
                console.error(err);
            });
        });
    }

    //Send message
    async function send(message, room) {    //data contains encMessage and iv
        encrypt(currentAesKey, message).then( data => {
            if ( chatChannel === "rtc" ){
                Channel.sendData(JSON.stringify(data));
            } else {
                const enc = JSON.stringify(data);
                let json = new Object;
                json.room = room;
                json.message = enc;
                json.from = userId;
                //Костыль :Р
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
        })
    }

    //On socket message
    socket.on('recieveViaSocket', function(data){  
        console.log(`Recieved message via socket to the ${data.room} chat. Saving...`);
        const parseData = JSON.parse(data.message);
        const iv = new Uint8Array(obj2arr(parseData.iv));
        const message = new Uint8Array(obj2arr(parseData.encMessage));
        setEnc(data.user).then( aesKey => {
            decrypt(aesKey, iv, message).then( message => {
                const stringMess = ab2str(message)
                saveMessage(data.room, stringMess, data.user, null);
            })
            addQuantityM(1, data.user);
        });
    });

    //Get public key
    async function getPublicKey(id){
        try {
            let req = await $.ajax({
                type: "GET",
                url: `/${id}/getUserInfo`,
            });
            return req;
        } catch (error) {
            console.error(error);
        }    
    }

    //Generate chat key encryption
    async function setEnc(id){
        return new Promise(
            (gResolve, gReject) => {
            getPublicKey(id).then((data) => {
                //Foreign key
                const sKey = JSON.parse(data['key']);
                //Fetching keypair from db
                let fetchYourthKey = () => {
                    return new Promise(
                    (resolve, reject) => {
                        let dbPromise = idb.open('clientDB', 3);
                        dbPromise.onsuccess = function() {
                            let db = this.result;
                            let dbTransaction = db.transaction(["keys"]);
                            let getKeys = dbTransaction.objectStore("keys");
                            let request = getKeys.get(userId);
                            request.onerror = function(event) {
                                reject(error);
                            }; 
                            request.onsuccess = function(event) {
                                window.crypto.subtle.importKey(
                                    "jwk", 
                                    request.result.private,
                                    { 
                                        name: "ECDH",
                                        namedCurve: "P-521", 
                                    },
                                    true, 
                                    ["deriveKey", "deriveBits"]
                                )
                                .then(function(privateKey){
                                    const private = privateKey;
                                    window.crypto.subtle.importKey(
                                        "jwk", 
                                        request.result.public,
                                        { 
                                            name: "ECDH",
                                            namedCurve: "P-521", 
                                        },
                                        true, 
                                        []
                                    )
                                    .then(function(publicKey){
                                        const public = publicKey;
                                        const key = {
                                            publicKey: public,
                                            privateKey: private
                                        }
                                        resolve(key);
                                    })
                                    .catch(function(err){
                                        console.error(err);
                                    });
                                })
                                .catch(function(err){
                                    console.error(err);
                                });
                            };
                        }    
                    })
                };
                fetchYourthKey().then(
                    key => {
                        //Importing public key
                        window.crypto.subtle.importKey(
                            "jwk",
                            sKey,
                            {   
                                name: "ECDH",
                                namedCurve: "P-521", 
                            },
                            false,
                            []
                        )
                        .then(function(sPublicKey){
                            const yKey = key;
                            //Generating encryption key
                            window.crypto.subtle.deriveKey(
                                {
                                    name: "ECDH",
                                    namedCurve: "P-521",
                                    public: sPublicKey,
                                },
                                yKey.privateKey,
                                {
                                    name: "AES-CBC",
                                    length: 256,
                                },
                                false,
                                ["encrypt", "decrypt"]
                            )
                            .then(function(keydata){
                                //returns the exported key data
                                gResolve(keydata);
                            })
                            .catch(function(err){
                                console.error(err);
                            });
                        })
                        .catch(function(err){
                            console.error(err);
                        });
                    }
                ).catch(function(err){
                    console.error(err);
                });
            });
        })
    }

    //load users
    socket.on('users', function (data) {
        let curUsers = new Array();
        $('.user[data-id]').each(function() {
            let cur = $(this).data('id');
            curUsers.push(cur);
        });
        
        let list = data;
        list = list.filter(item => item != userId);
        curUsers.forEach(element => {
            list = list.filter(item => item != element);
        });
        let unlist = curUsers;
        data.forEach(element => {
            unlist = unlist.filter(item => item != element);
        });
        
        //Adding user
        list.forEach(element => {
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
        //Remove user
        unlist.forEach(element => {
            $(`.user[data-id=${element}]`).remove();
        });
    });

    //fetch saved messages
    async function loadSavedMessages(chatId){
        let dbPromise = idb.open('clientDB', 3);
        dbPromise.onsuccess = await function() {
            let db = this.result;
            let dbTransaction = db.transaction(["messages"]);
            let messages = dbTransaction.objectStore("messages");
            let index = messages.index('chatQuery'); 
            let chatWindow = $("#chatWindow");
            index.openCursor(chatId, "next").onsuccess = function(event) {
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
    async function saveMessage(chatId, message, user, timestamp){
        let dbPromise = idb.open('clientDB', 3);
        dbPromise.onsuccess = function() {
            let db = this.result;
            let dbTransaction = db.transaction(["messages"], 'readwrite');
            let messages = dbTransaction.objectStore("messages");
            let time;
            if(timestamp !== null) time = parseInt(timestamp);
            else time = Date.now();
            let mesObj = {
                chatId: chatId,
                user: user,
                message: message,
                timestamp: time
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

    //Checking for unrecieved messages
    if(userId !== undefined) socket.emit('getStash', userId);

    //handle message form for submit
    $(document).on('submit','.messageForm', (event) => {
        event.preventDefault();
        let messageInput = $("#message");

        const message = messageInput.val();
        messageInput.val("");
        messageInput.prop("disabled", true);

        const room = $("#chatName").data("id");
        if(room) send(message, room).then(() => {
            saveMessage(room, message, userId, null);
            messageInput.prop("disabled", false);
            messageInput.focus();
        });

    });

})