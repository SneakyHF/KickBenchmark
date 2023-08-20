const socketUrl = 'wss://ws-us2.pusher.com/app/eb1d5f283081a78b932c?protocol=7&client=js&version=7.6.0&flash=false';

const MAX_MESSAGE_COUNT = 11;
const MESSAGE_TIME_WINDOW = 60 * 1000;

const userMessages1 = {};
const userMessages2 = {};
let averageUpdateInterval1;
let averageUpdateInterval2;

function displayMessage(container, content, options = {}) {
  const { sender, timestamp, systemMessage } = options;
  const messageContainer = document.getElementById(container);

  if (systemMessage) {
    const messageElement = document.createElement('div');
    messageElement.className = 'system-message';
    messageElement.textContent = content;

    messageContainer.insertBefore(messageElement, messageContainer.firstChild);
    while (messageContainer.children.length > MAX_MESSAGE_COUNT) {
      messageContainer.removeChild(messageContainer.lastChild);
    }
  } else {
    const messageElement = document.createElement('div');
    messageElement.className = 'message';

    const formattedMessage = `
      <div class="message-content" style="display: flex; align-items: center;">
        <div class="timestamp" style="font-style: italic; color: #757575; font-size: 12px; margin-right: 15px;">(<span>${timestamp}</span>)</div>
        <div class="username" style="color: ${options.userColor || '#39ff14'}; font-weight: ${options.userBold ? 'bold' : 'normal'}; margin-right: 15px;">${sender}</div>
        <div class="content">${content}</div>
      </div>
    `;

    messageElement.innerHTML = formattedMessage;

    messageContainer.insertBefore(messageElement, messageContainer.firstChild);
    while (messageContainer.children.length > MAX_MESSAGE_COUNT) {
      messageContainer.removeChild(messageContainer.lastChild);
    }
  }
}

function updateAverage(currentTime, userMessages, averageUpdateInterval, averageDisplay) {
  let totalUniqueMessages = 0;

  for (const user in userMessages) {
    const userTimestamps = userMessages[user];
    const recentMessages = userTimestamps.filter(timestamp => currentTime - timestamp <= MESSAGE_TIME_WINDOW);
    if (recentMessages.length > 0) {
      totalUniqueMessages += 1;
    }
  }

  const averageUniqueMessages = totalUniqueMessages / (MESSAGE_TIME_WINDOW / (60 * 1000));
  averageDisplay.textContent = `Unique Messages ${averageUniqueMessages} / m`;
}

function connectAndSubscribe(container, channels, userMessages, averageUpdateInterval, averageDisplay) {
  const socket = new WebSocket(socketUrl);

  socket.addEventListener('open', () => {
    displayMessage(container, 'Connected to WebSocket server', { systemMessage: true });

    channels.forEach(channel => {
      socket.send(JSON.stringify(channel));
    });
  });

  socket.addEventListener('message', event => {
    const messageData = JSON.parse(event.data);

    if (messageData.event === 'pusher:connection_established') {
      displayMessage(container, 'WebSocket connection established', { systemMessage: true });
    } else if (messageData.event === 'pusher_internal:subscription_succeeded') {
      const channel = messageData.channel;
      displayMessage(container, `Subscribed to channel ${channel}`, { systemMessage: true });
    } else if (messageData.event === 'message' || messageData.event === 'App\\Events\\ChatMessageEvent') {
      let eventData = messageData.data;

      try {
        eventData = JSON.parse(eventData);

        if (typeof eventData === 'string') {
          eventData = JSON.parse(eventData);
        }

        if (eventData.sender && eventData.created_at && eventData.content) {
          const senderUsername = eventData.sender.username;
          const createdAt = new Date(eventData.created_at).toLocaleTimeString();
          const messageContent = eventData.content;

          const lines = messageContent.split('\n').filter(line => line.trim() !== '');

          lines.forEach(line => {
            const formattedLine = parseEmotes(line);
            displayMessage(container, formattedLine, {
              sender: senderUsername,
              timestamp: createdAt,
              userColor: eventData.sender.identity.color,
              userBold: true,
            });

            const userMessagesContainer = container === 'messageContainer1' ? userMessages1 : userMessages2;
            if (!userMessagesContainer[senderUsername]) {
              userMessagesContainer[senderUsername] = [];
            }
            userMessagesContainer[senderUsername].push(Date.now());

            const averageUpdateIntervalContainer = container === 'messageContainer1' ? averageUpdateInterval1 : averageUpdateInterval2;
            if (!averageUpdateIntervalContainer) {
              averageUpdateIntervalContainer = setInterval(() => {
                const currentTime = Date.now();
                const userMessagesContainer = container === 'messageContainer1' ? userMessages1 : userMessages2;
                const averageDisplay = container === 'messageContainer1' ? averageDisplay1 : averageDisplay2;
                updateAverage(currentTime, userMessagesContainer, averageUpdateIntervalContainer, averageDisplay);
              }, MESSAGE_TIME_WINDOW);
            }
          });
        }
      } catch (error) {
        console.error('Error parsing message data:', error);
      }
    }
  });

  socket.addEventListener('close', () => {
    console.log('WebSocket connection closed');
  });
}

function parseEmotes(line) {
  const emoteRegex = /\[emote:(\d+):[A-Za-z0-9]*\]/g;

  return line.replace(emoteRegex, (match, emoteNumber) => {
    return `<img src="https://files.kick.com/emotes/${emoteNumber}/fullsize" alt="${emoteNumber}" width="28" height="28" />`;
  });
}

document.addEventListener('DOMContentLoaded', () => {
  const fetchButton = document.getElementById('fetchButton');
  const input1 = document.getElementById('input1');
  const input2 = document.getElementById('input2');

  fetchButton.addEventListener('click', async () => {
    const username1 = input1.value;
    const username2 = input2.value;

    if (!username1 || !username2) {
      alert('Please enter both usernames.');
      return;
    }

    try {
      const response1 = await fetch(`https://kick.com/api/v2/channels/${username1}/chatroom`);
      const data1 = await response1.json();
      const channelId1 = data1.id;

      const response2 = await fetch(`https://kick.com/api/v2/channels/${username2}/chatroom`);
      const data2 = await response2.json();
      const channelId2 = data2.id;

      connectAndSubscribe('messageContainer1', [
        {"event":"pusher:subscribe","data":{"auth":"","channel":`chatrooms.${channelId1}.v2`}}
      ], userMessages1, averageUpdateInterval1, averageDisplay1);

      connectAndSubscribe('messageContainer2', [
        {"event":"pusher:subscribe","data":{"auth":"","channel":`chatrooms.${channelId2}.v2`}}
      ], userMessages2, averageUpdateInterval2, averageDisplay2);
    } catch (error) {
      console.error('Error fetching chatroom data:', error);
      alert('Error fetching chatroom data.');
    }
  });
});
