const express = require('express');
const router = express.Router();
const {
  getAllInvoices,
  getInvoiceById,
  createInvoiceFromOrder,
  createInvoice,
  updateInvoice,
  updateInvoiceStatus,
  deleteInvoice,
  getInvoiceStats
} = require('../controllers/invoiceController');

// NO DUPLICATE AUTH MIDDLEWARE - already handled in server.js
// router.use(auth); ← REMOVE THIS LINE

// GET /api/invoices - Get all invoices with optional filtering
// Query parameters: ?search=value&status=draft&page=1&limit=10
router.get('/', getAllInvoices);

// GET /api/invoices/stats - Get invoice statistics
router.get('/stats', getInvoiceStats);

// GET /api/invoices/:id - Get single invoice by ID
router.get('/:id', getInvoiceById);

// POST /api/invoices - Create manual invoice (for special cases)
// Note: Most invoices are now auto-generated when orders are created
router.post('/', createInvoice);

// POST /api/invoices/from-order/:orderId - Create invoice from existing order
// This is mainly for orders that somehow don't have invoices
router.post('/from-order/:orderId', createInvoiceFromOrder);

// PUT /api/invoices/:id - Update invoice
router.put('/:id', updateInvoice);

// PATCH /api/invoices/:id/status - Update only invoice status
router.patch('/:id/status', updateInvoiceStatus);

// DELETE /api/invoices/:id - Delete invoice
router.delete('/:id', deleteInvoice);

module.exports = router;