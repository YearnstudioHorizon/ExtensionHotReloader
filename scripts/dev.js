'use strict';
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const CONFIG_FILE = path.join(__dirname, '../extension.config.json');

if (!fs.existsSync(CONFIG_FILE)) {
    console.log('\x1b[33m未检测到配置，开始初始化...\x1b[0m\n');
    execSync('node ' + JSON.stringify(path.join(__dirname, '../init.js')), {
        stdio: 'inherit',
        shell: true
    });
}

require('./server.js');
