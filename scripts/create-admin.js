#!/usr/bin/env node
// Create admin account for the DCTE admin panel
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

const username = process.argv[2] || 'admin';
const password = process.argv[3] || 'dcte2024';

const adminsFile = path.join(__dirname, '..', 'data', 'admins.json');

let admins = [];
try { admins = JSON.parse(fs.readFileSync(adminsFile, 'utf8')); } catch {}

// Check if username already exists
if (admins.find(a => a.username === username)) {
  console.log(`Admin "${username}" already exists. Updating password...`);
  admins = admins.filter(a => a.username !== username);
}

const hash = bcrypt.hashSync(password, 10);
admins.push({ username, password: hash, createdAt: new Date().toISOString() });

fs.writeFileSync(adminsFile, JSON.stringify(admins, null, 2));
console.log(`Admin account created:`);
console.log(`  Username: ${username}`);
console.log(`  Password: ${password}`);
console.log(`  File: ${adminsFile}`);
console.log(`\nChange the default password after first login!`);
