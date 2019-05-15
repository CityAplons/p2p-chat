# p2p-chat

This is a chat that using WebRTC protocol to communicate clients. 
Encryption type: end-to-end (ECDH + AES)
WebRTC dataChannel works only when both clients in the same chat (window)
Chat data saves at client-side.
Server-side saves only users data (username, password, name, surname) and encrypted stalled messages (did not reach the addressee).

Server requirments:
  - nodeJS
  - postgresql

Host requirments:
  - TURN and STUN server
  - SSL certificate to use crypto.subtle

How to execute app:
  ```bash
  npm install
  ```
  ```bash
  node server
  ```
