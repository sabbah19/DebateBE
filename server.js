const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

let waitingUsers = {}; // Store users waiting by topic
let userInRoom = {}; // Store active users in rooms

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // Handle the topic selection event
  socket.on('chooseTopic', (topic) => {
    console.log(`User ${socket.id} chose topic: ${topic}`);

    if (waitingUsers[topic]) {
      const partnerSocket = waitingUsers[topic];
      delete waitingUsers[topic];

      const roomId = `${socket.id}-${partnerSocket.id}`;
      socket.join(roomId);
      partnerSocket.join(roomId);
      userInRoom[socket.id] = roomId;
      userInRoom[partnerSocket.id] = roomId;

      // Notify both users that a partner was found
      socket.emit('partnerFound', { partnerId: partnerSocket.id });
      partnerSocket.emit('partnerFound', { partnerId: socket.id });
    } else {
      waitingUsers[topic] = socket;
      console.log(`User ${socket.id} is waiting for a partner on topic: ${topic}`);
    }
  });

  // Handle the cancelWait event from the client
  socket.on('cancelWait', () => {
    let userRemoved = false; // To check if the user was removed

    for (let topic in waitingUsers) {
      if (waitingUsers[topic] === socket) {
        // Remove the user from the waiting list for the chosen topic
        delete waitingUsers[topic];
        console.log(`User ${socket.id} canceled waiting for a partner on topic: ${topic}`);
        userRemoved = true;
        break; // Exit the loop after removing the user
      }
    }

    // If the user wasn't in the waiting list, log that they weren't found
    if (!userRemoved) {
      console.log(`User ${socket.id} was not found in the waiting list.`);
    }
  });

  // Handle sending messages
  socket.on('message', (data) => {
    const roomId = userInRoom[socket.id];
    if (roomId) {
      socket.broadcast.to(roomId).emit('message', { from: 'Partner', message: data.message });
    }
  });

  // Handle ending the debate
  socket.on('endDebate', () => {
    const roomId = userInRoom[socket.id];
    if (roomId) {
      socket.to(roomId).emit('partnerEnded'); // Notify the partner
      socket.leave(roomId);
      delete userInRoom[socket.id];
    }
  });

  // Handle disconnect event
  socket.on('disconnect', () => {
    const roomId = userInRoom[socket.id];
    if (roomId) {
      socket.to(roomId).emit('partnerEnded'); // Notify the partner that this user left
      delete userInRoom[socket.id];
    }
    for (let topic in waitingUsers) {
      if (waitingUsers[topic] === socket) {
        delete waitingUsers[topic]; // Remove user from waiting list if disconnected
      }
    }
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
