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
    
    //WebSocket connection to relay
    let socket = io.connect("", { query: `user=${userId}` });
    
    //load users
    socket.on('users', function (data) {
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
                        <span class="info-button">✉</span>
                    </div>`
                    $("#users").append(template);
                }
            });
        });
    });
    
})