const { RTCPeerConnection, RTCSessionDescription } = window;

let isAlreadyCalling = false,
    isAlreadyCalled = false,
    addStream,
    currentConnection;

const talkingWithInfo = document.getElementById('talking-with-info');
const remoteVideo = document.getElementById('remote-video');
const form = document.getElementById('form');
const message = document.getElementById('message');
const chat = document.getElementById('chat');

/* add local video on the video tag */
navigator.mediaDevices
    .getUserMedia({
        audio: true,
        video: true,
    })
    .then((stream) => {
        /* attach the stream to video tag */
        let localVideo = document.getElementById('local-video');
        localVideo.srcObject = stream;

        /* on stream close show image */
        const id = setInterval(() => {
            if (!stream.active) {
                localVideo.srcObject = null;
                clearInterval(id);
            }
        }, 500);

        /* adding audio and video track to peer connection */
        addStream = (peerConnection) => {
            stream
                .getTracks()
                .forEach((track) => peerConnection.addTrack(track, stream));
        };
    })
    .catch((err) => {
        if (err.message == 'Permission denied') {
            alert(
                `Please give permission to access the camera & microphone to use this site.`
            );
        } else alert(`${err.message}`);
    });

let peerConnection;
async function createPeerConnection() {
    peerConnection = new RTCPeerConnection({
        /* adding STUN and TURN servers to build connection even with NAT, firewall and connection problems */
        iceServers: [
            {
                urls: 'stun:relay.metered.ca:80',
            },
            {
                urls: 'turn:relay.metered.ca:80',
                username: '148b198ca9db0c2508f4adf2',
                credential: 'sZeaVB3sMK5gdAWe',
            },
            {
                urls: 'turn:relay.metered.ca:443',
                username: '148b198ca9db0c2508f4adf2',
                credential: 'sZeaVB3sMK5gdAWe',
            },
            {
                urls: 'turn:relay.metered.ca:443?transport=tcp',
                username: '148b198ca9db0c2508f4adf2',
                credential: 'sZeaVB3sMK5gdAWe',
            },
        ],
    });
    peerConnection.ontrack = function ({ streams: [stream] }) {
        remoteVideo.srcObject = stream;
    };
    await addStream(peerConnection);
}

/* make a socket connection to backend */
const socket = io();

socket.on('update-user-list', ({ users }) => {
    updateUserList(users);
});

/* remove user by catching the element with socket id */
socket.on('remove-user', ({ socketId }) => {
    const elToRemove = document.getElementById(socketId);
    if (elToRemove) {
        elToRemove.remove();
    }
    if (currentConnection == socketId) {
        talkingWithInfo.innerHTML = 'Talking with info';
        currentConnection = null;
        chat.innerHTML = null;
        remoteVideo.srcObject = null;
    }
});

/* when a user requests to join peer to peer */
socket.on('call-made', async ({ offer, socketId }) => {
    /* take permission of second user */
    let permission = '';
    if (!isAlreadyCalled) {
        permission = prompt(
            `${socketId} wants to connect.\nClick ok to connect.`
        );
    }

    if (permission == '') {
        if (!isAlreadyCalled) {
            /* If joining another connection close previous one */
            chat.innerHTML = null;
            if (peerConnection) {
                await peerConnection.close();
                socket.emit('end-call', {
                    to: currentConnection,
                });
            }
            createPeerConnection();
        }
        await peerConnection.setRemoteDescription(
            new RTCSessionDescription(offer)
        );
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(
            new RTCSessionDescription(answer)
        );

        isAlreadyCalled = true;
        setTimeout(() => {
            isAlreadyCalled = false;
        }, 5000);

        /* emit answer back to the requesting user */
        talkingWithInfo.innerHTML = `Talking with: ${socketId}`;
        currentConnection = socketId;
        socket.emit('make-answer', {
            answer,
            to: socketId,
        });
    } else {
        socket.emit('make-answer', {
            answer: null,
            to: socketId,
        });
    }
});

/* when response is returned from the other user */
socket.on('answer-made', async ({ answer, socketId }) => {
    if (answer == null) {
        alert('User denied the connection request');
    } else {
        talkingWithInfo.innerHTML = `Talking with: ${socketId}`;
        currentConnection = socketId;
        peerConnection.setRemoteDescription(new RTCSessionDescription(answer));

        if (!isAlreadyCalling) {
            isAlreadyCalling = true;
            callUser(socketId);
            setTimeout(() => {
                isAlreadyCalling = false;
            }, 5000);
        }
    }
});

socket.on('close-connection', async ({ socketId }) => {
    chat.innerHTML = null;
    await peerConnection.close();
    remoteVideo.srcObject = null;
    talkingWithInfo.innerHTML = 'Talking with info';
    currentConnection = null;
});

/* add user in active user list if not present */
function updateUserList(socketIds) {
    const activeUserContainer = document.getElementById(
        'active-users-container'
    );
    socketIds.forEach((socketId) => {
        const alreadyExistingUser = document.getElementById(socketId);

        if (!alreadyExistingUser) {
            const userContainerEl = createUserItemContainer(socketId);
            activeUserContainer.appendChild(userContainerEl);
        }
    });
}

/* creates and returns a userContainerEl with all features */
function createUserItemContainer(socketId) {
    const userContainerEl = document.createElement('div');
    const usernameEl = document.createElement('p');

    userContainerEl.setAttribute('class', 'active-user');
    userContainerEl.setAttribute('id', socketId);
    usernameEl.setAttribute('class', 'username');
    usernameEl.innerHTML = `${socketId}`;

    userContainerEl.appendChild(usernameEl);

    userContainerEl.addEventListener('click', async () => {
        unselectUsersFromList();

        /* adding a selected class to userContainerEl */
        userContainerEl.setAttribute(
            'class',
            'active-user active-user-selected'
        );

        chat.innerHTML = null;
        /* tells the other user to close connection */
        if (currentConnection)
            socket.emit('end-call', { to: currentConnection });
        /* close self connection */
        if (peerConnection) await peerConnection.close();
        talkingWithInfo.innerHTML = 'Talking with info';
        currentConnection = null;
        remoteVideo.srcObject = null;

        createPeerConnection();
        callUser(socketId);
    });

    return userContainerEl;
}

/* make a request to a user for a P2P connection */
async function callUser(socketId) {
    if (!isAlreadyCalling) {
        alert(`Call made to ${socketId}`);
    }
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(new RTCSessionDescription(offer));

    socket.emit('call-user', {
        offer,
        to: socketId,
    });
}

/* removing all selected user classes */
function unselectUsersFromList() {
    const alreadySelectedUser = document.querySelectorAll(
        '.active-user.active-user--selected'
    );

    alreadySelectedUser.forEach((el) => {
        el.setAttribute('class', 'active-user');
    });
}

/* sending message */
form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!currentConnection) return;

    const textEl = document.createElement('p');
    textEl.innerHTML = `<b>You: </b> ${message.value}`;
    chat.append(textEl);
    textEl.scrollIntoView();
    /* send message to stranger */
    socket.emit('send-message', {
        message: message.value,
        to: currentConnection,
    });
    message.value = '';
});

/* recieving message */
socket.on('recieve-message', ({ message }) => {
    const textEl = document.createElement('p');
    textEl.innerHTML = `<b>Stranger: </b> ${message}`;
    chat.append(textEl);
    textEl.scrollIntoView();
});
