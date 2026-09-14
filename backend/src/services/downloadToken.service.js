const crypto = require('crypto');

const SECRET = process.env.DOWNLOAD_TOKEN_SECRET;
if (!SECRET) {
  console.warn('DOWNLOAD_TOKEN_SECRET is not set — document downloads will fail.');
}

function signDownloadToken(storagePath, expiresInSeconds = 300) {
  const exp = Date.now() + expiresInSeconds * 1000;
  const payload = Buffer.from(JSON.stringify({ storagePath, exp })).toString('base64url');
  const sig = crypto.createHmac('sha256', SECRET).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

function verifyDownloadToken(token) {
  const [payload, sig] = (token || '').split('.');
  if (!payload || !sig) return null;
  const expected = crypto.createHmac('sha256', SECRET).update(payload).digest('base64url');
  if (sig !== expected) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
    if (Date.now() > data.exp) return null;
    return data;
  } catch {
    return null;
  }
}

module.exports = { signDownloadToken, verifyDownloadToken };
