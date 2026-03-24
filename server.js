const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Helper to append to JSON file
function appendToFile(filename, entry) {
  const file = path.join(DATA_DIR, filename);
  let arr = [];
  try { arr = JSON.parse(fs.readFileSync(file, 'utf8')); } catch {}
  arr.push({ ...entry, timestamp: new Date().toISOString() });
  fs.writeFileSync(file, JSON.stringify(arr, null, 2));
}

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
  const order = { id: 'DCTE-' + Date.now(), customer, items, shipping, payment, total };
  appendToFile('orders.json', order);
  console.log(`[ORDER] ${order.id} - ${customer.firstName} ${customer.lastName} - ${items.length} item(s) - Total: ${total}`);
  res.json({ success: true, orderId: order.id });
});

// API 404 handler
app.all('/api/*', (req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Catch-all: serve index.html for SPA
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`DCTE server running on port ${PORT}`);
});
