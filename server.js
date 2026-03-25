require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');

let Anthropic, anthropic;
try {
  Anthropic = require('@anthropic-ai/sdk');
  if (process.env.ANTHROPIC_API_KEY) {
    anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    console.log('[INIT] Anthropic SDK loaded, API key set');
  } else {
    console.log('[INIT] Anthropic SDK loaded, but no ANTHROPIC_API_KEY env var');
  }
} catch (e) {
  console.log('[INIT] Anthropic SDK not available:', e.message);
}

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const UPLOADS_DIR = path.join(__dirname, 'public', 'uploads');
const JWT_SECRET = process.env.JWT_SECRET || 'dcte-fallback-secret-change-me';

// Ensure directories exist
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// Multer config for image uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, 'prod-' + Date.now() + ext);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) cb(null, true);
    else cb(new Error('Only jpg, png, gif, webp images are allowed'));
  }
});

app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ── Helpers ──────────────────────────────────────────────────────

function readJSON(filename) {
  const file = path.join(DATA_DIR, filename);
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return []; }
}

function writeJSON(filename, data) {
  fs.writeFileSync(path.join(DATA_DIR, filename), JSON.stringify(data, null, 2));
}

function appendToFile(filename, entry) {
  const arr = readJSON(filename);
  arr.push({ ...entry, timestamp: new Date().toISOString() });
  writeJSON(filename, arr);
  return arr[arr.length - 1];
}

function deriveStockStatus(stock) {
  if (typeof stock === 'string') {
    return stock === 'in' ? 'in' : stock === 'low' ? 'low' : 'out';
  }
  const n = Number(stock);
  if (isNaN(n) || n <= 0) return 'out';
  if (n <= 10) return 'low';
  return 'in';
}

// ── Auth Middleware ───────────────────────────────────────────────

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }
  try {
    const decoded = jwt.verify(authHeader.split(' ')[1], JWT_SECRET);
    req.admin = decoded;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

function ownerOnly(req, res, next) {
  if (req.admin.role !== 'owner') {
    return res.status(403).json({ error: 'Owner access required' });
  }
  next();
}

// ── Public API ───────────────────────────────────────────────────

// GET /api/products — public storefront
app.get('/api/products', (req, res) => {
  const products = readJSON('products.json')
    .map(p => ({
      ...p,
      stockStatus: deriveStockStatus(p.stock)
    }));
  res.json(products);
});

// Contact form submission
app.post('/api/contact', (req, res) => {
  const { name, email, phone, message } = req.body;
  if (!name || !email || !message) {
    return res.status(400).json({ error: 'Name, email, and message are required' });
  }
  appendToFile('contacts.json', { name, email, phone, message });
  console.log(`[CONTACT] ${name} <${email}>: ${message.substring(0, 80)}`);
  res.json({ success: true });
});

// Customer registration (from Firebase Auth logins)
app.post('/api/customers', (req, res) => {
  const { uid, name, email, provider, photoURL } = req.body;
  if (!uid || !name) {
    return res.status(400).json({ error: 'uid and name are required' });
  }
  const customers = readJSON('customers.json');
  const existing = customers.find(c => c.uid === uid);
  if (existing) {
    // Update last login and any new info
    existing.lastLogin = new Date().toISOString();
    if (email && !existing.email) existing.email = email;
    if (name) existing.name = name;
    if (photoURL) existing.photoURL = photoURL;
    existing.loginCount = (existing.loginCount || 1) + 1;
    writeJSON('customers.json', customers);
    return res.json({ success: true, updated: true });
  }
  const customer = {
    uid, name, email: email || null, provider: provider || 'unknown',
    photoURL: photoURL || null, loginCount: 1,
    firstLogin: new Date().toISOString(), lastLogin: new Date().toISOString()
  };
  customers.push(customer);
  writeJSON('customers.json', customers);
  console.log(`[CUSTOMER] New: ${name} (${email || 'no email'}) via ${provider}`);
  res.json({ success: true, new: true });
});

// Duplicate order prevention
const recentOrderHashes = new Map();
setInterval(() => {
  const cutoff = Date.now() - 60000;
  for (const [hash, ts] of recentOrderHashes) {
    if (ts < cutoff) recentOrderHashes.delete(hash);
  }
}, 30000);

// Order submission
app.post('/api/order', (req, res) => {
  const { customer, items, shipping, payment, total } = req.body;

  // Validate customer fields
  if (!customer || typeof customer !== 'object') {
    return res.status(400).json({ error: 'Customer info is required' });
  }
  const { firstName, lastName, email, phone, street, city } = customer;
  if (!firstName || !lastName || !street || !city) {
    return res.status(400).json({ error: 'Name, street, and city are required' });
  }
  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!email || !emailRe.test(email)) {
    return res.status(400).json({ error: 'Valid email is required' });
  }
  const phoneRe = /^(\+?63|0)9\d{9}$/;
  if (!phone || !phoneRe.test(phone.replace(/[\s\-]/g, ''))) {
    return res.status(400).json({ error: 'Valid Philippine phone number is required' });
  }

  // Validate items
  if (!Array.isArray(items) || !items.length) {
    return res.status(400).json({ error: 'At least one item is required' });
  }
  for (const item of items) {
    if (!item.name || item.price == null || !item.qty) {
      return res.status(400).json({ error: 'Each item must have name, price, and qty' });
    }
  }

  // Validate shipping & payment
  const validShipping = ['rider', 'outside', 'pickup'];
  if (!shipping || !validShipping.includes(shipping)) {
    return res.status(400).json({ error: 'Invalid shipping method' });
  }
  const validPayment = ['GCash', 'Metrobank', 'GoTyme'];
  if (!payment || !validPayment.includes(payment)) {
    return res.status(400).json({ error: 'Invalid payment method' });
  }

  // Validate total
  if (!total || parseFloat(total) <= 0) {
    return res.status(400).json({ error: 'Total must be greater than 0' });
  }

  // Duplicate order prevention (same content within 60s)
  const orderHash = crypto.createHash('md5').update(JSON.stringify({ customer: { firstName, lastName, email }, items, total })).digest('hex');
  if (recentOrderHashes.has(orderHash)) {
    return res.status(409).json({ error: 'Duplicate order detected. Please wait before resubmitting.' });
  }
  recentOrderHashes.set(orderHash, Date.now());

  // Generate unique order ID
  const orderId = 'DCTE-' + Date.now() + '-' + crypto.randomBytes(3).toString('hex');
  const order = { id: orderId, customer, items, shipping, payment, total, customerUid: req.body.customerUid || null, status: 'Pending' };
  appendToFile('orders.json', order);
  console.log(`[ORDER] ${order.id} - ${firstName} ${lastName} - ${items.length} item(s) - Total: ${total}`);
  res.json({ success: true, orderId: order.id });
});

// ── Admin Auth ───────────────────────────────────────────────────

app.post('/api/admin/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }
  const admins = readJSON('admins.json');
  const admin = admins.find(a => a.username === username);
  if (!admin || !bcrypt.compareSync(password, admin.password)) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  const role = admin.role || 'employee';
  const token = jwt.sign({ username: admin.username, role }, JWT_SECRET, { expiresIn: '24h' });
  res.json({ success: true, token, username: admin.username, role });
});

app.get('/api/admin/verify', authMiddleware, (req, res) => {
  const admins = readJSON('admins.json');
  const admin = admins.find(a => a.username === req.admin.username);
  const role = admin ? admin.role || 'employee' : req.admin.role || 'employee';
  res.json({ valid: true, username: req.admin.username, role });
});

// ── Admin: Dashboard Stats ───────────────────────────────────────

app.get('/api/admin/stats', authMiddleware, ownerOnly, (req, res) => {
  const products = readJSON('products.json');
  const orders = readJSON('orders.json');
  const contacts = readJSON('contacts.json');
  const customers = readJSON('customers.json');

  const totalRevenue = orders.reduce((sum, o) => sum + (parseFloat(o.total) || 0), 0);
  const lowStock = products.filter(p => deriveStockStatus(p.stock) === 'low').length;
  const outOfStock = products.filter(p => deriveStockStatus(p.stock) === 'out').length;
  const recentOrders = orders.slice(-5).reverse();

  // Revenue by day (last 30 days)
  const now = new Date();
  const revenueByDay = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().slice(0, 10);
    const dayRevenue = orders
      .filter(o => o.timestamp && o.timestamp.slice(0, 10) === dateStr)
      .reduce((sum, o) => sum + (parseFloat(o.total) || 0), 0);
    revenueByDay.push({ date: dateStr, revenue: dayRevenue });
  }

  // Orders by status
  const ordersByStatus = {};
  orders.forEach(o => {
    const s = (o.status || 'Pending');
    ordersByStatus[s] = (ordersByStatus[s] || 0) + 1;
  });

  // Top 5 products by order frequency
  const productCounts = {};
  orders.forEach(o => {
    (o.items || []).forEach(item => {
      const name = item.name || item.product || 'Unknown';
      productCounts[name] = (productCounts[name] || 0) + (item.qty || item.quantity || 1);
    });
  });
  const topProducts = Object.entries(productCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, qty]) => ({ name, qty }));

  res.json({
    totalProducts: products.length,
    totalOrders: orders.length,
    totalContacts: contacts.length,
    totalCustomers: customers.length,
    totalRevenue,
    lowStock,
    outOfStock,
    recentOrders,
    revenueByDay,
    ordersByStatus,
    topProducts
  });
});

// ── Admin: Products CRUD ─────────────────────────────────────────

app.get('/api/admin/products', authMiddleware, (req, res) => {
  res.json(readJSON('products.json'));
});

app.post('/api/admin/products', authMiddleware, (req, res) => {
  const products = readJSON('products.json');
  const { cat, label, name, price, img, stock, condition, badge, specs, shopee } = req.body;
  if (!cat || !name || !price) {
    return res.status(400).json({ error: 'Category, name, and price are required' });
  }
  // Generate next ID
  const maxNum = products.reduce((max, p) => {
    const n = parseInt(p.id.replace('prod-', ''));
    return n > max ? n : max;
  }, 0);
  const product = {
    id: 'prod-' + (maxNum + 1),
    cat, label: label || cat, name, price: Number(price),
    img: img || '', stock: stock !== undefined ? Number(stock) : 50, condition: condition || 'new',
    badge: badge || null, specs: specs || {}, shopee: !!shopee
  };
  products.push(product);
  writeJSON('products.json', products);
  console.log(`[ADMIN] Product added: ${name}`);
  res.json({ success: true, product });
});

app.put('/api/admin/products/:id', authMiddleware, (req, res) => {
  const products = readJSON('products.json');
  const idx = products.findIndex(p => p.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Product not found' });

  const { cat, label, name, price, img, stock, condition, badge, specs, shopee } = req.body;
  if (cat !== undefined) products[idx].cat = cat;
  if (label !== undefined) products[idx].label = label;
  if (name !== undefined) products[idx].name = name;
  if (price !== undefined) products[idx].price = Number(price);
  if (img !== undefined) products[idx].img = img;
  if (stock !== undefined) products[idx].stock = Number(stock);
  if (condition !== undefined) products[idx].condition = condition;
  if (badge !== undefined) products[idx].badge = badge || null;
  if (specs !== undefined) products[idx].specs = specs;
  if (shopee !== undefined) products[idx].shopee = !!shopee;

  writeJSON('products.json', products);
  console.log(`[ADMIN] Product updated: ${products[idx].name}`);
  res.json({ success: true, product: products[idx] });
});

app.delete('/api/admin/products/:id', authMiddleware, (req, res) => {
  let products = readJSON('products.json');
  const idx = products.findIndex(p => p.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Product not found' });

  const removed = products.splice(idx, 1)[0];
  writeJSON('products.json', products);
  console.log(`[ADMIN] Product deleted: ${removed.name}`);
  res.json({ success: true });
});

// ── Admin: Image Upload ──────────────────────────────────────────

app.post('/api/admin/upload', authMiddleware, (req, res, next) => {
  upload.single('image')(req, res, (err) => {
    if (err) {
      if (err instanceof multer.MulterError) {
        return res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'File too large (max 5MB)' : err.message });
      }
      return res.status(400).json({ error: err.message });
    }
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const url = '/uploads/' + req.file.filename;
    console.log(`[ADMIN] Image uploaded: ${url}`);
    res.json({ success: true, url });
  });
});

// ── Admin: Analyze Image (Upload + AI Detection) ─────────────────

app.post('/api/admin/analyze-image', authMiddleware, (req, res, next) => {
  upload.single('image')(req, res, async (err) => {
    if (err) {
      if (err instanceof multer.MulterError) {
        return res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'File too large (max 5MB)' : err.message });
      }
      return res.status(400).json({ error: err.message });
    }
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const url = '/uploads/' + req.file.filename;
    console.log(`[ADMIN] Image uploaded: ${url}`);

    // Try lazy-init if key was added after startup
    if (!anthropic && Anthropic && process.env.ANTHROPIC_API_KEY) {
      anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
      console.log('[ADMIN] Anthropic client lazy-initialized');
    }

    // If still no client, behave like plain upload
    if (!anthropic) {
      console.log('[ADMIN] No Anthropic client — skipping detection. KEY set:', !!process.env.ANTHROPIC_API_KEY, 'SDK:', !!Anthropic);
      return res.json({ success: true, url, detected: null });
    }

    try {
      const imgPath = path.join(UPLOADS_DIR, req.file.filename);
      const imgBuffer = fs.readFileSync(imgPath);
      const base64 = imgBuffer.toString('base64');
      const ext = path.extname(req.file.filename).toLowerCase();
      const mediaType = ext === '.png' ? 'image/png'
        : ext === '.gif' ? 'image/gif'
        : ext === '.webp' ? 'image/webp'
        : 'image/jpeg';

      const response = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 2048,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: mediaType, data: base64 }
            },
            {
              type: 'text',
              text: `You are analyzing a product promotional image for a PC parts store called DCTE (Davao Computer Trade-in Express).

1. First, extract any info visible in the image.
2. Then, based on the product you identified, use your knowledge to provide additional technical specs that a buyer would want to know (e.g. resolution, response time, ports, TDP, core count, etc. depending on the product type). Do NOT repeat specs already found in the image.

Return this JSON structure:
{
  "product_name": "Full product name (brand + model + key variant info)",
  "category": "one of: gpu, cpu, mobo, ram, psu, monitor, case, cooler, bundle",
  "label": "Human-readable category (e.g. Video Card, Processor, Monitor)",
  "price": null or number in PHP (no currency symbol),
  "image_specs": { "key": "value" pairs found IN the image },
  "researched_specs": { "key": "value" pairs from your knowledge about this product }
}

Return ONLY valid JSON, no markdown, no code fences.`
            }
          ]
        }]
      });

      let text = response.content[0].text.trim();
      // Strip markdown code fences if present
      text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/,'');
      const detected = JSON.parse(text);
      console.log(`[ADMIN] AI detected: ${detected.product_name || 'unknown'}`);
      res.json({ success: true, url, detected });
    } catch (aiErr) {
      console.error('[ADMIN] AI detection failed:', aiErr.message);
      // Still return the uploaded image — don't waste the upload
      res.json({ success: true, url, detected: null });
    }
  });
});

// ── Admin: Bulk Product Actions ──────────────────────────────────

app.post('/api/admin/products/bulk', authMiddleware, (req, res) => {
  const { action, ids, value } = req.body;
  if (!ids || !ids.length) return res.status(400).json({ error: 'No products selected' });

  let products = readJSON('products.json');

  if (action === 'delete') {
    const before = products.length;
    products = products.filter(p => !ids.includes(p.id));
    writeJSON('products.json', products);
    console.log(`[ADMIN] Bulk deleted ${before - products.length} products`);
    return res.json({ success: true, deleted: before - products.length });
  }

  if (action === 'set-stock') {
    const stockVal = Number(value);
    if (isNaN(stockVal) || stockVal < 0) return res.status(400).json({ error: 'Invalid stock value' });
    let count = 0;
    products.forEach(p => {
      if (ids.includes(p.id)) { p.stock = stockVal; count++; }
    });
    writeJSON('products.json', products);
    console.log(`[ADMIN] Bulk set stock to ${stockVal} for ${count} products`);
    return res.json({ success: true, updated: count });
  }

  if (action === 'set-badge') {
    const badge = value || null;
    let count = 0;
    products.forEach(p => {
      if (ids.includes(p.id)) { p.badge = badge; count++; }
    });
    writeJSON('products.json', products);
    console.log(`[ADMIN] Bulk set badge to "${badge}" for ${count} products`);
    return res.json({ success: true, updated: count });
  }

  res.status(400).json({ error: 'Unknown action' });
});

// ── Admin: Orders ────────────────────────────────────────────────

app.get('/api/admin/orders', authMiddleware, (req, res) => {
  const orders = readJSON('orders.json');
  res.json(orders.reverse());
});

app.put('/api/admin/orders/:id/status', authMiddleware, (req, res) => {
  const orders = readJSON('orders.json');
  const order = orders.find(o => o.id === req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found' });

  const validStatuses = ['Pending', 'Confirmed', 'Shipped', 'Completed'];
  if (!req.body.status || !validStatuses.includes(req.body.status)) {
    return res.status(400).json({ error: 'Invalid status. Must be: ' + validStatuses.join(', ') });
  }

  order.status = req.body.status;
  writeJSON('orders.json', orders);
  console.log(`[ADMIN] Order ${order.id} status → ${order.status}`);
  res.json({ success: true, order });
});

// ── Admin: Contacts ──────────────────────────────────────────────

app.get('/api/admin/contacts', authMiddleware, (req, res) => {
  const contacts = readJSON('contacts.json');
  res.json(contacts.reverse());
});

// ── Admin: Customers ─────────────────────────────────────────────

app.get('/api/admin/customers', authMiddleware, (req, res) => {
  const customers = readJSON('customers.json');
  res.json(customers.reverse());
});

// ── Admin: Export ────────────────────────────────────────────────

app.get('/api/admin/export/products', authMiddleware, (req, res) => {
  const file = path.join(DATA_DIR, 'products.json');
  res.download(file, 'products-backup.json');
});

// ── API 404 handler ──────────────────────────────────────────────

app.all('/api/*', (req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Serve admin panel
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Catch-all: serve index.html for SPA
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`DCTE server running on port ${PORT}`);
});
