// backend/src/api/friends.js
// API-Routen für Freundesliste und Anfragen

import { jsonResponse, textResponse, errorResponse } from '../utils/responses.js';
import { getFriendsList, getFriendRequests } from '../db/queries.js';

export async function handleFriends(request, env, dbUser) {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;

  // GET /api/friends
  if (path === '/api/friends' && method === 'GET') {
    const friends = await getFriendsList(env.DB, dbUser.id);
    const requests = await getFriendRequests(env.DB, dbUser.id);
    return jsonResponse({ friends, requests });
  }

  // POST /api/friends (Anfrage senden)
  if (path === '/api/friends' && method === 'POST') {
    const { friendUsername } = await request.json();
    if (!friendUsername) return errorResponse('Missing friendUsername', 400);

    const friend = await env.DB.prepare('SELECT id FROM users WHERE username = ?').bind(friendUsername).first();
    if (!friend) return errorResponse('User not found', 404);
    if (dbUser.id === friend.id) return errorResponse('Cannot add yourself', 400);

    const existing = await env.DB.prepare(
      'SELECT id FROM friends WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)'
    ).bind(dbUser.id, friend.id, friend.id, dbUser.id).first();
    if (existing) return errorResponse('Already friends or request pending', 400);

    await env.DB.prepare('INSERT INTO friends (user_id, friend_id, status) VALUES (?, ?, ?)')
      .bind(dbUser.id, friend.id, 'pending').run();

    return textResponse('Friend request sent');
  }

  // PUT /api/friends/:username (Anfrage akzeptieren/ablehnen)
  if (path.startsWith('/api/friends/') && method === 'PUT') {
    const friendUsername = path.split('/').pop();
    const { accept } = await request.json();
    if (!friendUsername) return errorResponse('Missing username', 400);

    const friend = await env.DB.prepare('SELECT id FROM users WHERE username = ?').bind(friendUsername).first();
    if (!friend) return errorResponse('User not found', 404);

    if (accept) {
      await env.DB.prepare('UPDATE friends SET status = ? WHERE user_id = ? AND friend_id = ?')
        .bind('accepted', friend.id, dbUser.id).run();
      await env.DB.prepare('INSERT INTO friends (user_id, friend_id, status) VALUES (?, ?, ?)')
        .bind(dbUser.id, friend.id, 'accepted').run();
      return textResponse('Friend request accepted');
    } else {
      await env.DB.prepare('DELETE FROM friends WHERE user_id = ? AND friend_id = ?')
        .bind(friend.id, dbUser.id).run();
      return textResponse('Friend request declined');
    }
  }

  return errorResponse('Friends endpoint not found', 404);
}
