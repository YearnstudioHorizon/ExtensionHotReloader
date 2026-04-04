'use strict';
const fs = require('fs');
const path = require('path');

const config = require('../extension.config.json');

const SRC = path.join(__dirname, '../src/extension.js');
const DIST_DIR = path.join(__dirname, '../dist');
const DIST_FILE = path.join(DIST_DIR, `${config.id}.js`);

if (!fs.existsSync(DIST_DIR)) fs.mkdirSync(DIST_DIR);

console.log('\x1b[36m📦 Building...\x1b[0m');
fs.writeFileSync(DIST_FILE, fs.readFileSync(SRC));
console.log(`\x1b[32m✅ Build Success: dist/${config.id}.js\x1b[0m`);
