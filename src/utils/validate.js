// backend/src/utils/validate.js
// Zentrale Validierungsfunktionen

export function validateUsername(username) {
  if (!username) return { valid: false, error: 'Username is required' };
  if (username.length < 3 || username.length > 20) {
    return { valid: false, error: 'Username must be between 3 and 20 characters' };
  }
  if (!/^[a-zA-Z0-9_.-]+$/.test(username)) {
    return { valid: false, error: 'Username contains invalid characters' };
  }
  return { valid: true };
}

export function validatePassword(password) {
  if (!password) return { valid: false, error: 'Password is required' };
  if (password.length < 6) {
    return { valid: false, error: 'Password must be at least 6 characters' };
  }
  return { valid: true };
}
