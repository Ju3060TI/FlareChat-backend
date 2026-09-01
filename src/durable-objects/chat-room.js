// src/durable-objects/chat-room.js
// Durable Object für Chat-Räume

export class ChatRoom {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.sessions = new Map(); // username -> WebSocket
    this.roomId = state.id.toString();
  }

  async fetch(request) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (path === '/ws') {
      const username = url.searchParams.get('username');
      if (!username) {
        return new Response('Missing username', { status: 400 });
      }

      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);

      this.state.acceptWebSocket(server);
      this.sessions.set(username, server);

      console.log(`🟢 [Room ${this.roomId}] ${username} connected`);

      this.broadcast({
        type: 'user_joined',
        username: username,
        timestamp: Date.now()
      }, username);

      return new Response(null, {
        status: 101,
        webSocket: client,
      });
    }

    if (path === '/messages' && request.method === 'GET') {
      const messages = await this.state.storage.get('messages') || [];
      return new Response(JSON.stringify(messages), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (path === '/send' && request.method === 'POST') {
      try {
        const { sender, text } = await request.json();
        if (!sender || !text) {
          return new Response(JSON.stringify({ error: 'Missing fields' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          });
        }

        const messages = await this.state.storage.get('messages') || [];
        const newMessage = {
          id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
          sender: sender,
          text: text,
          timestamp: Date.now(),
          type: 'text'
        };
        messages.push(newMessage);

        if (messages.length > 1000) {
          messages.splice(0, messages.length - 1000);
        }
        await this.state.storage.put('messages', messages);

        this.broadcast({
          type: 'new_message',
          ...newMessage
        });

        return new Response(JSON.stringify({ success: true }), {
          headers: { 'Content-Type': 'application/json' },
        });
      } catch (error) {
        return new Response(JSON.stringify({ error: 'Invalid request' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    }

    return new Response('Not found', { status: 404 });
  }

  async webSocketMessage(ws, message) {
    try {
      const data = JSON.parse(message);

      const messages = await this.state.storage.get('messages') || [];
      const newMessage = {
        id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
        sender: data.sender || 'unknown',
        text: data.text,
        timestamp: Date.now(),
        type: data.type || 'text'
      };

      messages.push(newMessage);

      if (messages.length > 1000) {
        messages.splice(0, messages.length - 1000);
      }
      await this.state.storage.put('messages', messages);

      this.broadcast({
        type: 'new_message',
        ...newMessage
      }, data.sender);

    } catch (error) {
      console.error('Fehler beim Verarbeiten der Nachricht:', error);
    }
  }

  async webSocketClose(ws, code, reason, wasClean) {
    let disconnectedUser = null;
    for (const [username, session] of this.sessions) {
      if (session === ws) {
        disconnectedUser = username;
        break;
      }
    }

    if (disconnectedUser) {
      this.sessions.delete(disconnectedUser);
      console.log(`🔴 [Room ${this.roomId}] ${disconnectedUser} disconnected`);

      this.broadcast({
        type: 'user_left',
        username: disconnectedUser,
        timestamp: Date.now()
      });
    }
  }

  async webSocketError(ws, error) {
    console.error(`⚠️ [Room ${this.roomId}] WebSocket error:`, error);
    for (const [username, session] of this.sessions) {
      if (session === ws) {
        this.sessions.delete(username);
        break;
      }
    }
  }

  broadcast(data, excludeSender = null) {
    const message = JSON.stringify(data);
    for (const [username, ws] of this.sessions) {
      if (username === excludeSender) continue;
      try {
        ws.send(message);
      } catch (e) {
        console.error(`Broadcast an ${username} fehlgeschlagen:`, e);
      }
    }
  }
}
