const { verifySessionToken } = require('./auth.service');

async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  const user = await verifySessionToken(token);
  if (!user) {
    return res.status(401).json({ error: 'Session expired or invalid. Please log in again.' });
  }
  req.user = user;
  next();
}

module.exports = { requireAuth };

function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.role_name)) {
      return res.status(403).json({ error: 'Insufficient role for this action.' });
    }
    next();
  };
}

const supabase = require('../../db');

function requirePermission(permissionKey) {
  return async (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Not authenticated.' });

    const { data, error } = await supabase
      .from('roles_permission_matrix')
      .select('allowed')
      .eq('role_name', req.user.role_name)
      .eq('permission_key', permissionKey)
      .maybeSingle();

    if (error) return res.status(500).json({ error: error.message });
    if (!data || !data.allowed) {
      return res.status(403).json({ error: `Role ${req.user.role_name} is not permitted to perform ${permissionKey}.` });
    }
    next();
  };
}

module.exports = { requireAuth, requireRole, requirePermission };