const { RTCPeerConnection, RTCSessionDescription } = window;

const peerConnection = new RTCPeerConnection();
let isAlreadyCalling = false;

peerConnection.ontrack = function ({ streams: [stream] }) {
    const remoteVideo = document.getElementById('remote-video');
    if (remoteVideo) {
        remoteVideo.srcObject = stream;
    }
};

/* add local video on the video tag */
navigator.mediaDevices
    .getUserMedia({
        audio: true,
        video: {
            width: 1280,
            height: 720,
        },
    })
    .then((stream) => {
        /* use the stream */
        let localVideo = document.getElementById('local-video');
        if (localVideo) {
            localVideo.srcObject = stream;
        }

        /* adding audio and video track to peer connection */
        stream
            .getTracks()
            .forEach((track) => peerConnection.addTrack(track, stream));
    })
    .catch((err) => {
        /* handle the error */
        console.warn(err.message);
    });

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
});

/* when a user requests to join peer to peer */
socket.on('call-made', async ({ offer, socketId }) => {
    await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(new RTCSessionDescription(answer));

    /* emit answer back to the requesting user */
    socket.emit('make-answer', {
        answer,
        to: socketId,
    });
});

/* when response is returned from the other user */
socket.on('answer-made', async ({ answer, socketId }) => {
    peerConnection.setRemoteDescription(new RTCSessionDescription(answer));

    if (!isAlreadyCalling) {
        callUser(socketId);
        isAlreadyCalling = true;
    }
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
    usernameEl.innerHTML = `Socket: ${socketId}`;

    userContainerEl.appendChild(usernameEl);

    userContainerEl.addEventListener('click', () => {
        unselectUsersFromList();

        /* adding a selected class to userContainerEl */
        userContainerEl.setAttribute(
            'class',
            'active-user active-user-selected'
        );
        const talkingWithInfo = document.getElementById('talking-with-info');
        talkingWithInfo.innerHTML = `Talking with: Socket: ${socketId}`;
        callUser(socketId);
    });

    return userContainerEl;
}

/* make a request to a user for a P2P connection */
async function callUser(socketId) {
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
