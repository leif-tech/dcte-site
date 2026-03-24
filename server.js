const express = require('express');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const JWT_SECRET = process.env.JWT_SECRET || 'dcte-fallback-secret-change-me';

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

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

// ── Public API ───────────────────────────────────────────────────

// GET /api/products — public storefront
app.get('/api/products', (req, res) => {
  const products = readJSON('products.json');
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

// Order submission
app.post('/api/order', (req, res) => {
  const { customer, items, shipping, payment, total } = req.body;
  if (!customer || !items || !items.length) {
    return res.status(400).json({ error: 'Customer info and items are required' });
  }
  const order = { id: 'DCTE-' + Date.now(), customer, items, shipping, payment, total, status: 'Pending' };
  appendToFile('orders.json', order);
  console.log(`[ORDER] ${order.id} - ${customer.firstName} ${customer.lastName} - ${items.length} item(s) - Total: ${total}`);
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
  const token = jwt.sign({ username: admin.username }, JWT_SECRET, { expiresIn: '24h' });
  res.json({ success: true, token, username: admin.username });
});

app.get('/api/admin/verify', authMiddleware, (req, res) => {
  res.json({ valid: true, username: req.admin.username });
});

// ── Admin: Dashboard Stats ───────────────────────────────────────

app.get('/api/admin/stats', authMiddleware, (req, res) => {
  const products = readJSON('products.json');
  const orders = readJSON('orders.json');
  const contacts = readJSON('contacts.json');

  const totalRevenue = orders.reduce((sum, o) => sum + (parseFloat(o.total) || 0), 0);
  const lowStock = products.filter(p => p.stock === 'low').length;
  const recentOrders = orders.slice(-5).reverse();

  res.json({
    totalProducts: products.length,
    totalOrders: orders.length,
    totalContacts: contacts.length,
    totalRevenue,
    lowStock,
    recentOrders
  });
});

// ── Admin: Products CRUD ─────────────────────────────────────────

app.get('/api/admin/products', authMiddleware, (req, res) => {
  res.json(readJSON('products.json'));
});

app.post('/api/admin/products', authMiddleware, (req, res) => {
  const products = readJSON('products.json');
  const { cat, label, name, price, img, stock, condition, badge, specs } = req.body;
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
    img: img || '', stock: stock || 'in', condition: condition || 'new',
    badge: badge || null, specs: specs || {}
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

  const { cat, label, name, price, img, stock, condition, badge, specs } = req.body;
  if (cat !== undefined) products[idx].cat = cat;
  if (label !== undefined) products[idx].label = label;
  if (name !== undefined) products[idx].name = name;
  if (price !== undefined) products[idx].price = Number(price);
  if (img !== undefined) products[idx].img = img;
  if (stock !== undefined) products[idx].stock = stock;
  if (condition !== undefined) products[idx].condition = condition;
  if (badge !== undefined) products[idx].badge = badge || null;
  if (specs !== undefined) products[idx].specs = specs;

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

// ── Admin: Orders ────────────────────────────────────────────────

app.get('/api/admin/orders', authMiddleware, (req, res) => {
  const orders = readJSON('orders.json');
  res.json(orders.reverse());
});

app.put('/api/admin/orders/:id/status', authMiddleware, (req, res) => {
  const orders = readJSON('orders.json');
  const order = orders.find(o => o.id === req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found' });

  order.status = req.body.status || order.status;
  writeJSON('orders.json', orders);
  console.log(`[ADMIN] Order ${order.id} status → ${order.status}`);
  res.json({ success: true, order });
});

// ── Admin: Contacts ──────────────────────────────────────────────

app.get('/api/admin/contacts', authMiddleware, (req, res) => {
  const contacts = readJSON('contacts.json');
  res.json(contacts.reverse());
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
