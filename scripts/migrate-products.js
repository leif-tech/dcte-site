#!/usr/bin/env node
// One-time migration: extract products from index.html into data/products.json
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');

// Extract the W base URL
const wMatch = html.match(/const W='([^']+)'/);
const W = wMatch ? wMatch[1] : '';

// Extract products array (lines between "const products=[" and "];")
const prodStart = html.indexOf("const products=[");
const prodEnd = html.indexOf("];", prodStart) + 2;
const prodBlock = html.substring(prodStart, prodEnd);

// Execute in a sandbox to get the array
const prodFn = new Function('W', prodBlock + '; return products;');
const products = prodFn(W);

// Extract specDB object
const specStart = html.indexOf("const specDB={");
const specEnd = html.indexOf("};", specStart) + 2;
const specBlock = html.substring(specStart, specEnd);
const specFn = new Function(specBlock + '; return specDB;');
const specDB = specFn();

// Build productMeta (reproducing the logic from index.html)
const productMeta = {};
products.forEach((p, i) => { productMeta[i] = { stock: 'in', condition: 'new', badge: null }; });
[0, 1, 2].forEach(i => productMeta[i].badge = 'hot');
[6, 7].forEach(i => productMeta[i].badge = 'new');
[48, 49].forEach(i => productMeta[i].badge = 'new');
[86, 87, 88].forEach(i => productMeta[i].badge = 'sale');
products.forEach((p, i) => { if (p.cat === 'bundle') productMeta[i].badge = 'hot'; });

// Merge into unified product objects
const unified = products.map((p, i) => {
  const meta = productMeta[i] || { stock: 'in', condition: 'new', badge: null };
  const specs = specDB[p.name] || {};
  return {
    id: 'prod-' + (i + 1),
    cat: p.cat,
    label: p.label,
    name: p.name,
    price: p.price,
    img: p.img,
    stock: meta.stock,
    condition: meta.condition,
    badge: meta.badge,
    specs: specs
  };
});

const outPath = path.join(__dirname, '..', 'data', 'products.json');
fs.writeFileSync(outPath, JSON.stringify(unified, null, 2));
console.log(`Migrated ${unified.length} products to ${outPath}`);
console.log(`  - With specs: ${unified.filter(p => Object.keys(p.specs).length > 0).length}`);
console.log(`  - With badges: ${unified.filter(p => p.badge).length}`);
