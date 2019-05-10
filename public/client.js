$(document).ready(function (){
    //Globals
    const username = $("#user").html();
    const userId = $("#user").data("id");

    console.log(`User: [${userId}] ${username}`);

    //Declaring indexedDB to store objects locally
    if (!('indexedDB' in window)) {
        console.log('This browser doesn\'t support IndexedDB');
        return;
    }

    const idb = window.indexedDB || window.mozIndexedDB || window.webkitIndexedDB || window.msIndexedDB;
    
    let dbPromise = idb.open('clientDB', 2);
 
    dbPromise.onupgradeneeded = function(event) { 
        let db = event.target.result;
        db.createObjectStore('keys', {keyPath: 'userId'});
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
    let Channel = {
        onJoin: function(room){
            //Join to room handler
            console.log(`Join ${room}`);
            socket.emit('join', room);
        },
        onReady: function(room){
            //Chat ready handler
            console.log(`Ready ${room}`);
            Channel.establishConnection(room);
        },
        onAnswer: function(answer){
            let rtcAnswer = new RTCSessionDescription(JSON.parse(answer));
            Channel.peerConnection.setRemoteDescription(rtcAnswer);
        },
        onOffer: function(offer){
            console.log("Offer accepted");
            Channel.handlePeerConnection();
            Channel.createAnswer(offer);
        },
        establishConnection: function(room){
            Channel.handlePeerConnection();
            Channel.createOffer(room);        
        },
        handlePeerConnection: function(){
            Channel.peerConnection = new RTCPeerConnection({
                iceServers: [{url: "stun:stun.l.google.com:19302" }]
            });
            Channel.peerConnection.onicecandidate = Channel.onIceCandidate;
            Channel.peerConnection.ondatachannel = Channel.receiveChannelCallback;
            socket.on('candidate', Channel.onCandidate);
        },
        createOffer: function(room){
            let json = new Object();
            json.room = room;
            Channel.createDataChannel(room);
            console.log('data channel created, creating offer');
            Channel.peerConnection.createOffer(
                function(offer){
                    Channel.peerConnection.setLocalDescription(offer);
                    json.offer = JSON.stringify(offer);
                    socket.emit('offer', JSON.stringify(json));
                },
                function(err){
                    console.log(err);
                }
            );
        },
        createAnswer: function(offer){
            let rtcOffer = new RTCSessionDescription(JSON.parse(offer));
            Channel.peerConnection.setRemoteDescription(rtcOffer);
            Channel.peerConnection.createAnswer(
                function(answer){
                    Channel.peerConnection.setLocalDescription(answer);
                    let json = new Object();
                    json.room = "1_2";
                    json.answer = answer;
                    socket.emit('answer', JSON.stringify(json));
                },
                function(err){
                    console.log(err);
                }
            );
        },
        onIceCandidate: function(event){
            if (event.candidate){
                let json = new Object();
                json.room = "1_2";
                json.candidate = event.candidate;
                socket.emit('candidate', JSON.stringify(json));
            }
        },
        onCandidate: function(candidate){
            rtcCandidate = new RTCIceCandidate(JSON.parse(candidate));
            Channel.peerConnection.addIceCandidate(rtcCandidate);
        },

        createDataChannel: function(label){
            console.log('creating data channel');
            Channel.dataChannel = Channel.peerConnection.createDataChannel(label);
            Channel.dataChannel.onerror = function(err){
                console.log(err);
            }
            Channel.dataChannel.onmessage = function(event) {
                console.log('got channel message: ' + event.data);
            };
    
            Channel.dataChannel.onopen = function(){
                Channel.dataChannel.send("Hello!");
            };
    
            Channel.dataChannel.onclose = function(){
                console.log('channel closed');
            };
    
        },
    
        receiveChannelCallback: function(event){
            console.log('received callback');
            var receiveChannel = event.channel;
            receiveChannel.onopen = function(){
                console.log('receive channel event open');
            };
            receiveChannel.onmessage = function(event){
                console.log('receive channel event: ' + event.data);
            };
        },

        sendData: function(text){
            Channel.dataChannel.send(text);
        }

    } 

    //Client ready state
    socket.on('join', Channel.onJoin);
    socket.on('ready', Channel.onReady);
    socket.on('answer', Channel.onAnswer);
    socket.on('offer', Channel.onOffer);
    
    //Joining to the chat
    $(document).on("click", ".chat-button", function (){
        const user = $(this).parent().data("id");
        const room = userId + "_" + user;
        console.log(`Try to join ${room}`);
        socket.emit('room', room);
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
    
})