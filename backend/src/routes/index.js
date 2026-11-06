// All API routes in one place. ORG = organizer only, VEN = vendor only.
const express = require('express');
const { requireAuth, requireRole } = require('../middleware/auth');
const { uploadReceipt, uploadMapImage } = require('../middleware/upload');

const auth = require('../controllers/authController');
const profile = require('../controllers/profileController');
const events = require('../controllers/eventController');
const apps = require('../controllers/applicationController');
const relocations = require('../controllers/relocationController');
const helpers = require('../controllers/helperController');
const payments = require('../controllers/paymentController');
const vendors = require('../controllers/vendorController');
const reports = require('../controllers/reportController');
const stats = require('../controllers/statsController');

const router = express.Router();
const ORG = [requireAuth, requireRole('organizer')];
const VEN = [requireAuth, requireRole('vendor')];
const ANY = [requireAuth];

// --- Login, registration, password ---
router.post('/auth/login', auth.login);
router.post('/auth/register', auth.register);
router.get('/auth/me', ANY, auth.me);
router.put('/auth/password', ANY, auth.changePassword);

// --- My profile (organizer or vendor) ---
router.get('/profile', ANY, profile.getProfile);
router.put('/profile', ANY, profile.updateProfile);

// --- Events (public view + organizer management) ---
router.get('/events', events.listActive);                       // public: ongoing + upcoming
router.get('/events/all', ORG, events.listAll);
router.get('/events/:id', events.getEvent);
router.get('/events/:id/map', events.getMap);                   // public: lots + facilities
router.post('/events', ORG, events.createEvent);
router.put('/events/:id', ORG, events.updateEvent);
router.put('/events/:id/status', ORG, events.setStatus);
router.delete('/events/:id', ORG, events.deleteEvent);
router.post('/events/:id/map-image', ORG, uploadMapImage.single('map'), events.uploadMap);
router.delete('/events/:id/map-image', ORG, events.removeMap);
router.put('/events/:id/layout', ORG, events.saveLayout);       // drag-and-drop map editor

// --- Lots ---
router.get('/lots/:id', apps.getLot);
router.get('/lots/:id/applications', ORG, apps.lotApplications);

// --- Stall applications ---
router.post('/applications', VEN, apps.apply);
router.get('/applications/mine', VEN, apps.myApplications);
router.put('/applications/:id/cancel', VEN, apps.cancel);
router.put('/applications/:id/attendance', VEN, apps.setAttendance);
router.get('/applications', ORG, apps.listApplications);
router.put('/applications/:id/decision', ORG, apps.decide);
router.put('/applications/:id/revoke', ORG, apps.revoke);

// --- Relocation requests ---
router.post('/relocations', VEN, relocations.create);
router.get('/relocations/mine', VEN, relocations.mine);
router.get('/relocations', ORG, relocations.list);
router.put('/relocations/:id/decision', ORG, relocations.decide);

// --- Helpers (roster) and helper requests ---
router.get('/helpers', ORG, helpers.listHelpers);
router.post('/helpers', ORG, helpers.createHelper);
router.put('/helpers/:id', ORG, helpers.updateHelper);
router.delete('/helpers/:id', ORG, helpers.deleteHelper);
router.post('/helper-requests', VEN, helpers.createRequest);
router.get('/helper-requests/mine', VEN, helpers.myRequests);
router.get('/helper-requests', ORG, helpers.listRequests);
router.put('/helper-requests/:id/assign', ORG, helpers.assign);
router.put('/helper-requests/:id/reject', ORG, helpers.reject);
router.put('/helper-requests/:id/complete', ORG, helpers.complete);

// --- Payments (Make Payment «include» Upload Receipt) ---
router.post('/payments', VEN, uploadReceipt.single('receipt'), payments.create);
router.get('/payments/mine', VEN, payments.mine);
router.get('/payments', ORG, payments.list);
router.put('/payments/:id/review', ORG, payments.review);

// --- Vendors (organizer) ---
router.get('/vendors', ORG, vendors.list);
router.get('/vendors/:id', ORG, vendors.get);
router.put('/vendors/:id', ORG, vendors.update);
router.delete('/vendors/:id', ORG, vendors.remove);

// --- Reports (Print «extends» Generate) ---
router.get('/reports/:eventId/generate', ORG, reports.generate);
router.get('/reports/:eventId/print', ORG, reports.print);

// --- Sidebar badge counts ---
router.get('/stats/counts', ORG, stats.counts);

module.exports = router;
