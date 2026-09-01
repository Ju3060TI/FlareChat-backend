// src/index.js
// Cloudflare Worker mit WebSocket-Unterstützung (Durable Objects)

// ============================================================
// CORS-HEADER
// ============================================================
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

// ============================================================
// HELPER-FUNKTIONEN
// ============================================================
const jsonResponse = (data, status = 200) => {
  return new Response(JSON.stringify(data), { status, headers: corsHeaders });
};

const textResponse = (text, status = 200) => {
  return new Response(text, { status, headers: corsHeaders });
};

// ============================================================
// MAIN WORKER
// ============================================================
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    // CORS Preflight
    if (method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    // ============================================================
    // 🔌 WEBSOCKET HANDSHAKE (mit Durable Object)
    // ============================================================
    if (path === '/ws' && method === 'GET') {
      const roomName = url.searchParams.get('room');
      const username = url.searchParams.get('username');

      if (!roomName || !username) {
        return textResponse('Missing room or username', 400);
      }

      const roomId = env.CHAT_ROOM.idFromName(roomName);
      const roomObject = env.CHAT_ROOM.get(roomId);

      const newUrl = new URL(request.url);
      newUrl.pathname = '/ws';

      const modifiedRequest = new Request(newUrl.toString(), {
        method: request.method,
        headers: request.headers,
        body: request.body,
      });

      return roomObject.fetch(modifiedRequest);
    }

    // ============================================================
    // REGISTER
    // ============================================================
    if (path === '/register' && method === 'POST') {
      const { username, password } = await request.json();
      if (!username || !password) return textResponse('Missing fields', 400);
      if (username.length < 3 || username.length > 20) return textResponse('Username length 3-20', 400);
      if (!/^[a-zA-Z0-9_.-]+$/.test(username)) return textResponse('Invalid characters', 400);
      
      const existing = await env.DB.prepare('SELECT id FROM users WHERE username = ?').bind(username).first();
      if (existing) return textResponse('User already exists', 409);
      
      await env.DB.prepare('INSERT INTO users (username, password, avatar_url) VALUES (?, ?, ?)').bind(username, password, '').run();
      return jsonResponse({ success: true });
    }

    // ============================================================
    // LOGIN
    // ============================================================
    if (path === '/login' && method === 'POST') {
      const { username, password } = await request.json();
      if (!username || !password) return textResponse('Missing fields', 400);
      
      const user = await env.DB.prepare('SELECT * FROM users WHERE username = ?').bind(username).first();
      if (!user || user.password !== password) {
        return textResponse('Invalid username or password', 401);
      }
      
      await env.DB.prepare('UPDATE users SET last_seen = ? WHERE username = ?').bind(Date.now(), username).run();
      
      return jsonResponse({ 
        success: true, 
        id: user.id, 
        username: user.username, 
        avatar_url: user.avatar_url || '' 
      });
    }

    // ============================================================
    // HEARTBEAT
    // ============================================================
    if (path === '/heartbeat' && method === 'POST') {
      const { username } = await request.json();
      if (!username) return textResponse('Missing username', 400);
      await env.DB.prepare('UPDATE users SET last_seen = ? WHERE username = ?').bind(Date.now(), username).run();
      return textResponse('OK');
    }

    // ============================================================
    // FRIENDS
    // ============================================================
    if (path === '/friends' && method === 'POST') {
      const { username } = await request.json();
      if (!username) return textResponse('Missing username', 400);
      
      const user = await env.DB.prepare('SELECT id FROM users WHERE username = ?').bind(username).first();
      if (!user) return textResponse('User not found', 404);

      const friends = await env.DB.prepare(
        `SELECT u.username, u.avatar_url, u.last_seen 
         FROM users u 
         JOIN friends f ON f.friend_id = u.id 
         WHERE f.user_id = ? AND f.status = 'accepted'`
      ).bind(user.id).all();

      const requests = await env.DB.prepare(
        `SELECT u.username 
         FROM users u 
         JOIN friends f ON f.user_id = u.id 
         WHERE f.friend_id = ? AND f.status = 'pending'`
      ).bind(user.id).all();

      return jsonResponse({ friends: friends.results, requests: requests.results });
    }

    // ============================================================
    // ADD FRIEND
    // ============================================================
    if (path === '/add-friend' && method === 'POST') {
      const { myUsername, friendUsername } = await request.json();
      if (!myUsername || !friendUsername) return textResponse('Missing fields', 400);

      const me = await env.DB.prepare('SELECT id FROM users WHERE username = ?').bind(myUsername).first();
      const friend = await env.DB.prepare('SELECT id FROM users WHERE username = ?').bind(friendUsername).first();
      if (!me || !friend) return textResponse('User not found', 404);
      if (me.id === friend.id) return textResponse('Cannot add yourself', 400);

      const existing = await env.DB.prepare(
        'SELECT id FROM friends WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)'
      ).bind(me.id, friend.id, friend.id, me.id).first();
      if (existing) return textResponse('Already friends or request pending', 400);

      await env.DB.prepare('INSERT INTO friends (user_id, friend_id, status) VALUES (?, ?, ?)').bind(me.id, friend.id, 'pending').run();
      return textResponse('Friend request sent');
    }

    // ============================================================
    // RESPOND FRIEND
    // ============================================================
    if (path === '/respond-friend' && method === 'POST') {
      const { myUsername, requesterUsername, accept } = await request.json();
      if (!myUsername || !requesterUsername) return textResponse('Missing fields', 400);

      const me = await env.DB.prepare('SELECT id FROM users WHERE username = ?').bind(myUsername).first();
      const requester = await env.DB.prepare('SELECT id FROM users WHERE username = ?').bind(requesterUsername).first();
      if (!me || !requester) return textResponse('User not found', 404);

      if (accept) {
        await env.DB.prepare('UPDATE friends SET status = ? WHERE user_id = ? AND friend_id = ?').bind('accepted', requester.id, me.id).run();
        await env.DB.prepare('INSERT INTO friends (user_id, friend_id, status) VALUES (?, ?, ?)').bind(me.id, requester.id, 'accepted').run();
        return textResponse('Friend request accepted');
      } else {
        await env.DB.prepare('DELETE FROM friends WHERE user_id = ? AND friend_id = ?').bind(requester.id, me.id).run();
        return textResponse('Friend request declined');
      }
    }

    // ============================================================
    // MESSAGES
    // ============================================================
    if (path === '/messages' && method === 'POST') {
      const { myUsername, otherUsername } = await request.json();
      if (!myUsername || !otherUsername) return textResponse('Missing fields', 400);

      const me = await env.DB.prepare('SELECT id FROM users WHERE username = ?').bind(myUsername).first();
      const other = await env.DB.prepare('SELECT id FROM users WHERE username = ?').bind(otherUsername).first();
      if (!me || !other) return textResponse('User not found', 404);

      const msgs = await env.DB.prepare(
        `SELECT m.text, m.created_at, sender.username as sender, sender.avatar_url as avatar_url 
         FROM messages m
         JOIN users sender ON m.sender_id = sender.id
         WHERE (m.sender_id = ? AND m.receiver_id = ?) OR (m.sender_id = ? AND m.receiver_id = ?)
         ORDER BY m.created_at ASC`
      ).bind(me.id, other.id, other.id, me.id).all();

      return jsonResponse(msgs.results);
    }

    // ============================================================
    // SEND (HTTP-Fallback, wenn WebSocket nicht verfügbar)
    // ============================================================
    if (path === '/send' && method === 'POST') {
      const { senderUsername, receiverUsername, text } = await request.json();
      if (!senderUsername || !receiverUsername || !text) return textResponse('Missing fields', 400);

      const sender = await env.DB.prepare('SELECT id FROM users WHERE username = ?').bind(senderUsername).first();
      const receiver = await env.DB.prepare('SELECT id FROM users WHERE username = ?').bind(receiverUsername).first();
      if (!sender || !receiver) return textResponse('User not found', 404);

      // In D1 speichern
      await env.DB.prepare('INSERT INTO messages (sender_id, receiver_id, text, created_at) VALUES (?, ?, ?, ?)')
        .bind(sender.id, receiver.id, text, Date.now()).run();

      // Versuchen, über Durable Object zu senden (für Echtzeit)
      try {
        const roomName = `dm_${[senderUsername, receiverUsername].sort().join('_')}`;
        const roomId = env.CHAT_ROOM.idFromName(roomName);
        const roomObject = env.CHAT_ROOM.get(roomId);
        
        await roomObject.fetch(new Request('https://dummy/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sender: senderUsername, text: text })
        }));
      } catch (doError) {
        console.warn('Durable Object nicht erreichbar, Nachricht nur in D1 gespeichert.');
      }

      return textResponse('OK');
    }

    // ============================================================
    // GROUPS
    // ============================================================
    if (path === '/my-groups' && method === 'POST') {
      const { username } = await request.json();
      if (!username) return textResponse('Missing username', 400);

      const user = await env.DB.prepare('SELECT id FROM users WHERE username = ?').bind(username).first();
      if (!user) return textResponse('User not found', 404);

      const groups = await env.DB.prepare(
        `SELECT g.id, g.name FROM groups g
         JOIN group_members gm ON gm.group_id = g.id
         WHERE gm.user_id = ?`
      ).bind(user.id).all();

      return jsonResponse(groups.results);
    }

    // ============================================================
    // GROUP MESSAGES
    // ============================================================
    if (path === '/group-messages' && method === 'POST') {
      const { groupId } = await request.json();
      if (!groupId) return textResponse('Missing groupId', 400);

      const msgs = await env.DB.prepare(
        `SELECT gm.text, gm.created_at, u.username as sender 
         FROM group_messages gm
         JOIN users u ON gm.sender_id = u.id
         WHERE gm.group_id = ?
         ORDER BY gm.created_at ASC`
      ).bind(groupId).all();

      return jsonResponse(msgs.results);
    }

    // ============================================================
    // GROUP SEND
    // ============================================================
    if (path === '/group-send' && method === 'POST') {
      const { groupId, senderUsername, text } = await request.json();
      if (!groupId || !senderUsername || !text) return textResponse('Missing fields', 400);

      const sender = await env.DB.prepare('SELECT id FROM users WHERE username = ?').bind(senderUsername).first();
      if (!sender) return textResponse('User not found', 404);

      await env.DB.prepare('INSERT INTO group_messages (group_id, sender_id, text, created_at) VALUES (?, ?, ?, ?)')
        .bind(groupId, sender.id, text, Date.now()).run();

      // Versuchen, über Durable Object zu senden
      try {
        const roomName = `group_${groupId}`;
        const roomId = env.CHAT_ROOM.idFromName(roomName);
        const roomObject = env.CHAT_ROOM.get(roomId);
        
        await roomObject.fetch(new Request('https://dummy/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sender: senderUsername, text: text })
        }));
      } catch (doError) {
        console.warn('Durable Object nicht erreichbar, Nachricht nur in D1 gespeichert.');
      }

      return textResponse('OK');
    }

    // ============================================================
    // FALLBACK
    // ============================================================
    return new Response('Not found', { status: 404, headers: corsHeaders });
  }
};
