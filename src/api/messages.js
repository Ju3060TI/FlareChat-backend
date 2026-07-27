// backend/src/api/messages.js
// API-Routen für 1-on-1 Nachrichten

import { jsonResponse, textResponse, errorResponse } from '../utils/responses.js';
import { getMessagesBetween, sendMessage } from '../db/queries.js';

export async function handleMessages(request, env, dbUser) {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;

  // GET /api/messages?other=username
  if (path === '/api/messages' && method === 'GET') {
    const otherUsername = url.searchParams.get('other');
    if (!otherUsername) return errorResponse('Missing other username', 400);

    const other = await env.DB.prepare('SELECT id FROM users WHERE username = ?').bind(otherUsername).first();
    if (!other) return errorResponse('User not found', 404);

    const messages = await getMessagesBetween(env.DB, dbUser.id, other.id);
    return jsonResponse(messages);
  }

  // POST /api/messages
  if (path === '/api/messages' && method === 'POST') {
    const { receiverUsername, text } = await request.json();
    if (!receiverUsername || !text) return errorResponse('Missing fields', 400);

    const receiver = await env.DB.prepare('SELECT id FROM users WHERE username = ?').bind(receiverUsername).first();
    if (!receiver) return errorResponse('User not found', 404);

    await sendMessage(env.DB, dbUser.id, receiver.id, text);
    return textResponse('OK');
  }

  return errorResponse('Messages endpoint not found', 404);
}
