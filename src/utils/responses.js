// backend/src/utils/responses.js
// Einheitliche JSON- und Text-Antworten für den Worker

export function jsonResponse(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
  });
}

export function textResponse(text, status = 200, headers = {}) {
  return new Response(text, {
    status,
    headers: {
      'Content-Type': 'text/plain',
      ...headers,
    },
  });
}

export function errorResponse(message, status = 400, headers = {}) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
  });
}
