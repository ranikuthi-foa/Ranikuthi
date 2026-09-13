/**
 * RANIKUTHI V5 (Node/Supabase rebuild) — backend/src/index.js
 * Minimal entry point. Proves the server runs before any real logic is added.
 */
require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:5173', credentials: true }));
app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ status: 'Ranikuthi backend is running.', timestamp: new Date().toISOString() });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('Server listening on port ' + PORT);
});

const authRoutes = require('./modules/auth/auth.routes');
app.use('/auth', authRoutes);

const membersRoutes = require('./modules/members/members.routes');
app.use('/members', membersRoutes);

const billingRoutes = require('./modules/billing/billing.routes');
app.use('/billing', billingRoutes);

const accountingRoutes = require('./modules/accounting/accounting.routes');
app.use('/accounting', accountingRoutes);

const complaintsRoutes = require('./modules/complaints/complaints.routes');
app.use('/complaints', complaintsRoutes);

const settingsRoutes = require('./modules/settings/settings.routes');
app.use('/settings', settingsRoutes);

const documentsRoutes = require('./modules/documents/documents.routes');
app.use('/documents', documentsRoutes);