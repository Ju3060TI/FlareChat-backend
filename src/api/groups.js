// backend/src/api/groups.js
// API-Routen für Gruppen

import { jsonResponse, textResponse, errorResponse } from '../utils/responses.js';
import { getGroupsForUser, getGroupMessages, sendGroupMessage } from '../db/queries.js';

export async function handleGroups(request, env, dbUser) {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;

  // GET /api/groups
  if (path === '/api/groups' && method === 'GET') {
    const groups = await getGroupsForUser(env.DB, dbUser.id);
    return jsonResponse(groups);
  }

  // POST /api/groups (neue Gruppe erstellen)
  if (path === '/api/groups' && method === 'POST') {
    const { name } = await request.json();
    if (!name) return errorResponse('Missing group name', 400);

    const generateId = () => {
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
      let id = '';
      for (let i = 0; i < 6; i++) id += chars.charAt(Math.floor(Math.random() * chars.length));
      return id;
    };

    let groupId;
    let existing;
    do {
      groupId = generateId();
      existing = await env.DB.prepare('SELECT id FROM groups WHERE id = ?').bind(groupId).first();
    } while (existing);

    await env.DB.prepare('INSERT INTO groups (id, name, created_by, created_at) VALUES (?, ?, ?, ?)')
      .bind(groupId, name, dbUser.id, Date.now()).run();
    await env.DB.prepare('INSERT INTO group_members (group_id, user_id) VALUES (?, ?)')
      .bind(groupId, dbUser.id).run();

    return jsonResponse({ groupId, name });
  }

  // POST /api/groups/join
  if (path === '/api/groups/join' && method === 'POST') {
    const { groupId } = await request.json();
    if (!groupId) return errorResponse('Missing groupId', 400);

    const group = await env.DB.prepare('SELECT id FROM groups WHERE id = ?').bind(groupId).first();
    if (!group) return errorResponse('Group not found', 404);

    await env.DB.prepare('INSERT OR IGNORE INTO group_members (group_id, user_id) VALUES (?, ?)')
      .bind(groupId, dbUser.id).run();

    return textResponse('Joined group');
  }

  // GET /api/groups/:groupId/messages
  if (path.match(/^\/api\/groups\/[^\/]+\/messages$/) && method === 'GET') {
    const groupId = path.split('/')[3];
    if (!groupId) return errorResponse('Missing groupId', 400);

    const messages = await getGroupMessages(env.DB, groupId);
    return jsonResponse(messages);
  }

  // POST /api/groups/:groupId/messages
  if (path.match(/^\/api\/groups\/[^\/]+\/messages$/) && method === 'POST') {
    const groupId = path.split('/')[3];
    const { text } = await request.json();
    if (!groupId || !text) return errorResponse('Missing fields', 400);

    await sendGroupMessage(env.DB, groupId, dbUser.id, text);
    return textResponse('OK');
  }

  return errorResponse('Groups endpoint not found', 404);
}
