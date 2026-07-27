// backend/src/api/users.js
// API-Routen für Benutzer-Profil

import { jsonResponse, errorResponse } from '../utils/responses.js';
import { getUserByUsername } from '../db/queries.js';

export async function handleUsers(request, env, dbUser) {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;

  // GET /api/users/me
  if (path === '/api/users/me' && method === 'GET') {
    return jsonResponse({
      username: dbUser.username,
      avatar_url: dbUser.avatar_url,
      email: dbUser.email,
      created_at: dbUser.created_at,
    });
  }

  return errorResponse('User endpoint not found', 404);
}
