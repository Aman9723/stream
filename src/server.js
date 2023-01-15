const express = require('express');
const socketIO = require('socket.io');
const { createServer } = require('http');
const path = require('path');

class Server {
    #httpServer;
    #app;
    #io;
    #DEFAULT_PORT = 5000;
    #activeSockets = [];

    constructor() {
        this.#initialize();
        this.#configureApp();
        this.#handleRoutes();
        this.#handleSocketConnection();
    }

    /* creates http server with socket.io and express */
    #initialize() {
        this.#app = express();
        this.#httpServer = createServer(this.#app);
        this.#io = socketIO(this.#httpServer);
    }

    #handleRoutes() {
        this.#app.get('/', (req, res) => {
            res.send('Hello World');
        });
    }

    #handleSocketConnection() {
        this.#io.on('connection', (socket) => {
            const existingSocket = this.#activeSockets.find(
                (socketId) => socketId === socket.id
            );
            if (!existingSocket) {
                this.#activeSockets.push(socket.id);
                socket.emit('update-user-list', {
                    users: this.#activeSockets.filter(
                        (currentSocket) => currentSocket !== socket.id
                    ),
                });
                socket.broadcast.emit('update-user-list', {
                    users: [socket.id],
                });
            }

            /* when user disconnects emit an event */
            socket.on('disconnect', () => {
                this.#activeSockets = this.#activeSockets.filter(
                    (socketId) => socketId !== socket.id
                );
                /* event goes to all except the current socket */
                socket.broadcast.emit('remove-user', {
                    socketId: socket.id,
                });
            });

            socket.on('call-user', ({ offer, to }) => {
                /* emits event for a specific user to connect */
                socket.to(to).emit('call-made', {
                    offer,
                    socketId: socket.id,
                });
            });

            socket.on('make-answer', ({ answer, to }) => {
                /* emit the answer to the user requesting P2P */
                socket.to(to).emit('answer-made', {
                    socketId: socket.id,
                    answer,
                });
            });
        });
    }

    listen(cb) {
        this.#httpServer.listen(this.#DEFAULT_PORT, () => {
            cb(this.#DEFAULT_PORT);
        });
    }

    /* serves the html file */
    #configureApp() {
        this.#app.use(express.static(path.join(__dirname, '../public')));
    }
}

module.exports = Server;
