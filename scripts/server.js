'use strict';
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const open = require('open');
const readline = require('readline');
const { WebSocketServer } = require('ws');
const http = require('http');

const config = require('../extension.config.json');

const app = express();
app.use(cors());

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const PORT = 8000;
const EXT_FILE = path.join(__dirname, '../src/extension.js');
const LOADER_FILE = path.join(__dirname, 'loader.js');

const getHash = () => {
    if (!fs.existsSync(EXT_FILE)) return '';
    const content = fs.readFileSync(EXT_FILE);
    return crypto.createHash('md5').update(content).digest('hex');
};

app.get('/version', (req, res) => { res.json({ hash: getHash() }); });

app.get('/code.js', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.sendFile(EXT_FILE);
});

app.get('/extension.js', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', 'application/javascript');
    let loaderCode = fs.readFileSync(LOADER_FILE, 'utf-8');
    loaderCode = loaderCode.replace('{{EXTENSION_ID}}', config.id);
    res.send(loaderCode);
});

const broadcastChange = (filename) => {
    const hash = getHash();
    const msg = JSON.stringify({ type: 'change', hash });
    let count = 0;

    let sizeStr = '0 B';
    try {
        const stats = fs.statSync(EXT_FILE);
        const size = stats.size;
        sizeStr = size < 1024 ? size + ' B' : (size / 1024).toFixed(2) + ' KB';
    } catch(e) {}

    wss.clients.forEach(client => {
        if (client.readyState === 1) {
            client.send(msg);
            count++;
        }
    });

    const time = new Date().toLocaleTimeString();
    console.log(`\n\x1b[42m\x1b[30m [UPDATE] \x1b[0m \x1b[32m${time}\x1b[0m`);
    console.log(`   文件: ${path.basename(filename)}  大小: ${sizeStr}  客户端: ${count}`);
};

let fsWait = false;
if (fs.existsSync(EXT_FILE)) {
    fs.watch(EXT_FILE, (event, filename) => {
        if (filename) {
            if (fsWait) return;
            fsWait = setTimeout(() => { fsWait = false; }, 100);
            broadcastChange(filename);
        }
    });
}

server.listen(PORT, async () => {
    console.clear();
    console.log(`\x1b[36m
  ===========================================
   Extension Hot Reloader  ·  ${config.name}
  ===========================================
\x1b[0m`);
    console.log(`\x1b[32mHTTP: http://127.0.0.1:${PORT}\x1b[0m`);
    console.log(`\x1b[35mWS:   ws://127.0.0.1:${PORT}\x1b[0m`);

    const autoOpenUrl = `https://turbowarp.org/editor?extension=http://localhost:${PORT}/extension.js`;

    console.log('');
    console.log('将会自动打开: ' + autoOpenUrl);

    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question('是否打开 TurboWarp 网页版? (Y/n) ', (answer) => {
        if (answer.trim().toLowerCase() !== 'n') {
            open(autoOpenUrl);
        }
        rl.close();
    });
});
