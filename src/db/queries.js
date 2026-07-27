// backend/src/db/queries.js
// Zentrale D1-Datenbank-Queries

// ============================================================
// USER QUERIES
// ============================================================
export async function getUserByUsername(db, username) {
  return await db.prepare('SELECT * FROM users WHERE username = ?').bind(username).first();
}

export async function getUserByFirebaseUid(db, uid) {
  return await db.prepare('SELECT * FROM users WHERE firebase_uid = ?').bind(uid).first();
}

export async function createUser(db, username, password, avatarUrl = '') {
  await db.prepare('INSERT INTO users (username, password, avatar_url) VALUES (?, ?, ?)')
    .bind(username, password, avatarUrl).run();
}

export async function createUserWithFirebase(db, uid, username, email, avatarUrl = '') {
  await db.prepare('INSERT INTO users (firebase_uid, username, email, avatar_url, created_at) VALUES (?, ?, ?, ?, ?)')
    .bind(uid, username, email, avatarUrl, Date.now()).run();
}

export async function updateLastSeen(db, username) {
  await db.prepare('UPDATE users SET last_seen = ? WHERE username = ?').bind(Date.now(), username).run();
}

// ============================================================
// FRIEND QUERIES
// ============================================================
export async function getFriendsList(db, userId) {
  const result = await db.prepare(
    `SELECT u.username, u.avatar_url, u.last_seen 
     FROM users u 
     JOIN friends f ON f.friend_id = u.id 
     WHERE f.user_id = ? AND f.status = 'accepted'`
  ).bind(userId).all();
  return result.results;
}

export async function getFriendRequests(db, userId) {
  const result = await db.prepare(
    `SELECT u.username 
     FROM users u 
     JOIN friends f ON f.user_id = u.id 
     WHERE f.friend_id = ? AND f.status = 'pending'`
  ).bind(userId).all();
  return result.results;
}

// ============================================================
// MESSAGE QUERIES
// ============================================================
export async function getMessagesBetween(db, myId, otherId) {
  const result = await db.prepare(
    `SELECT m.text, m.created_at, sender.username as sender, sender.avatar_url as avatar_url 
     FROM messages m
     JOIN users sender ON m.sender_id = sender.id
     WHERE (m.sender_id = ? AND m.receiver_id = ?) OR (m.sender_id = ? AND m.receiver_id = ?)
     ORDER BY m.created_at ASC`
  ).bind(myId, otherId, otherId, myId).all();
  return result.results;
}

export async function sendMessage(db, senderId, receiverId, text) {
  await db.prepare('INSERT INTO messages (sender_id, receiver_id, text, created_at) VALUES (?, ?, ?, ?)')
    .bind(senderId, receiverId, text, Date.now()).run();
}

// ============================================================
// GROUP QUERIES
// ============================================================
export async function getGroupsForUser(db, userId) {
  const result = await db.prepare(
    `SELECT g.id, g.name FROM groups g
     JOIN group_members gm ON gm.group_id = g.id
     WHERE gm.user_id = ?`
  ).bind(userId).all();
  return result.results;
}

export async function getGroupMessages(db, groupId) {
  const result = await db.prepare(
    `SELECT gm.text, gm.created_at, u.username as sender 
     FROM group_messages gm
     JOIN users u ON gm.sender_id = u.id
     WHERE gm.group_id = ?
     ORDER BY gm.created_at ASC`
  ).bind(groupId).all();
  return result.results;
}

export async function sendGroupMessage(db, groupId, senderId, text) {
  await db.prepare('INSERT INTO group_messages (group_id, sender_id, text, created_at) VALUES (?, ?, ?, ?)')
    .bind(groupId, senderId, text, Date.now()).run();
}
