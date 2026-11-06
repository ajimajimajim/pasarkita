// Turns any error into a clean JSON response.
const { MAX_MB } = require('./upload');

module.exports = function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ error: `File is too large. Maximum size is ${MAX_MB} MB.` });
  }
  if (err.code === 'ER_DUP_ENTRY') {
    return res.status(409).json({ error: 'That record already exists (duplicate value).' });
  }
  if (err.code === 'ECONNREFUSED' || err.code === 'ER_ACCESS_DENIED_ERROR' || err.code === 'ER_BAD_DB_ERROR') {
    console.error('Database connection problem:', err.code, err.message);
    return res.status(503).json({ error: 'Cannot reach the database. Is MySQL running and is .env correct?' });
  }
  if (err.code === 'ER_NO_SUCH_TABLE') {
    console.error(err.message);
    return res.status(503).json({ error: 'Database tables are missing. Run "npm run setup" first.' });
  }
  const status = err.status || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: status >= 500 ? 'Something went wrong on the server.' : err.message });
};
