const jwt = require('jsonwebtoken');

// Middleware standard (header Bearer)
function auth(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader?.startsWith('Bearer ') 
    ? authHeader.split(' ')[1] 
    : req.query.token;  // Support token en query param pour les téléchargements
  
  if (!token) return res.status(401).json({ error: 'Token manquant' });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch(e) {
    return res.status(401).json({ error: 'Token expiré ou invalide' });
  }
}

module.exports = auth;
