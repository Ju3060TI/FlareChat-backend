// src/index.js (Ausschnitt – nur den WebSocket-Teil ersetzen)

// ============================================================
// 🔌 WEBSOCKET HANDSHAKE (mit Durable Object)
// ============================================================
if (path === '/ws' && method === 'GET') {
  // Prüfen, ob ein Raumname übergeben wurde
  const roomName = url.searchParams.get('room');
  const username = url.searchParams.get('username');
  
  if (!roomName || !username) {
    return textResponse('Missing room or username', 400);
  }

  // Durable Object für diesen Raum holen (oder erstellen)
  const roomId = env.CHAT_ROOM.idFromName(roomName);
  const roomObject = env.CHAT_ROOM.get(roomId);

  // Anfrage an das Durable Object weiterleiten
  const newUrl = new URL(request.url);
  newUrl.pathname = '/ws';
  
  const modifiedRequest = new Request(newUrl.toString(), {
    method: request.method,
    headers: request.headers,
    body: request.body,
  });

  return roomObject.fetch(modifiedRequest);
}
