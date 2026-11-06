// PasarKita web server: serves the website and the REST API on one port.
require('dotenv').config({ quiet: true });
const path = require('path');
const express = require('express');
const cors = require('cors');
const routes = require('./routes');
const errorHandler = require('./middleware/errorHandler');

if (!process.env.JWT_SECRET) {
  console.error('JWT_SECRET is missing. Copy backend/.env.example to backend/.env first.');
  process.exit(1);
}

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (req, res) => res.json({ status: 'ok', service: 'PasarKita' }));
app.use('/api', routes);
app.use('/api', (req, res) => res.status(404).json({ error: 'API route not found.' }));

// Uploaded receipts and map images.
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

// The website (frontend folder).
const frontendDir = path.join(__dirname, '..', '..', 'frontend');
app.use(express.static(frontendDir, { extensions: ['html'] }));
app.get('/favicon.ico', (req, res) => res.status(204).end());
app.use((req, res) => res.status(404).sendFile(path.join(frontendDir, '404.html')));

app.use(errorHandler);

const PORT = Number(process.env.PORT) || 3000;
app.listen(PORT, () => {
  console.log(`PasarKita is running at http://localhost:${PORT}`);
});

module.exports = app;
