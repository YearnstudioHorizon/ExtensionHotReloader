const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { execSync } = require('child_process');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

console.log("\x1b[36m%s\x1b[0m", "扩展开发服务器");

rl.question('请输入扩展 ID (例如 my-super-ext): ', (extId) => {
    rl.question('请输入扩展名称 (例如 My Super Ext): ', (extName) => {

        // --- 1. 创建目录结构 ---
        console.log("\n📂 正在构建目录...");
        const dirs = ['src', 'scripts', 'dist'];
        dirs.forEach(d => {
            if (!fs.existsSync(d)) fs.mkdirSync(d);
        });

        // --- 2. 写入 package.json ---
        const packageJson = {
            "name": extId,
            "version": "2.6.0",
            "description": "TurboWarp Extension Dev Server (Loading State Refresh)",
            "license": "MIT",
            "scripts": {
                "start": "node scripts/server.js",
                "build": "node scripts/build.js",
                "clean": "rimraf dist"
            },
            "dependencies": {
                "express": "^4.18.2",
                "cors": "^2.8.5",
                "open": "^8.4.2",
                "clipboardy": "^2.3.0",
                "ws": "^8.13.0"
            },
            "extensionConfig": {
                "id": extId,
                "name": extName
            }
        };
        fs.writeFileSync('package.json', JSON.stringify(packageJson, null, 2));

        // --- 3. 写入 src/extension.js ---
        const extensionTemplate = `(function(Scratch) {
    'use strict';
    class MyExtension {
        getInfo() {
            return {
                id: '${extId}',
                name: '${extName}',
                color1: '#0FBD8C',
                blocks: [
                    {
                        opcode: 'test',
                        blockType: Scratch.BlockType.COMMAND,
                        text: '测试',
                        func: 'test'
                    }
                ]
            };
        }
        test() {
            alert('代码已更新');
        }
    }
    Scratch.extensions.register(new MyExtension());
})(Scratch);`;
        fs.writeFileSync('src/extension.js', extensionTemplate);

        // --- 4. 写入 scripts/loader.js (核心修改：Loading 状态逻辑) ---
        const loaderTemplate = `(function() {
    'use strict';
    const TARGET_EXTENSION_ID = '{{EXTENSION_ID}}'; 
    const SERVER_PORT = 8000;
    const HTTP_URL = 'http://127.0.0.1:' + SERVER_PORT;
    const WS_URL = 'ws://127.0.0.1:' + SERVER_PORT;
    
    const Scratch = window.Scratch;
    if (!Scratch || !Scratch.extensions.unsandboxed) throw new Error("Need Unsandboxed Mode");

    class HotProxy {
        constructor() {
            this.target = { getInfo: () => ({ id: TARGET_EXTENSION_ID, name: '连接中...', blocks: [] }) };
            this.lastHash = '';
            this.ws = null;
            
            // 状态控制：是否正在热重载
            this.isLoading = false;
        }

        getInfo() {
            // 状态 A: 正在加载中 (显示占位积木)
            if (this.isLoading) {
                return {
                    id: TARGET_EXTENSION_ID,
                    name: '正在热重载...',
                    color1: '#FF5500', // 醒目的橙色
                    blocks: [
                        {
                            opcode: '__loading__',
                            blockType: Scratch.BlockType.COMMAND,
                            text: '⏳ 正在拉取新代码...',
                            func: '__loading__', 
                            arguments: {}
                        }
                    ]
                };
            }

            // 状态 B: 正常显示 (代理目标扩展的积木)
            const info = this.target.getInfo();
            if (!info.blocks) info.blocks = [];

            // 注入控制积木
            info.blocks.push('---');
            info.blocks.push({ 
                opcode: '__forceReload__', 
                blockType: Scratch.BlockType.COMMAND, 
                text: '🔥 强制重载', 
                func: '__forceReload__' 
            });
            
            // 确保 ID 一致
            info.id = TARGET_EXTENSION_ID;
            return info;
        }

        __loading__() {
            console.warn('正在热重载，请稍候...');
        }

        __updateMethods(newTarget) {
            const proto = Object.getPrototypeOf(newTarget);
            Object.getOwnPropertyNames(proto).forEach(k => {
                if (k !== 'constructor' && k !== 'getInfo') this[k] = newTarget[k].bind(newTarget);
            });
            this.target = newTarget;
        }

        __forceReload__() { this.checkUpdate(true); }

        start() { this.tryWebSocket(); }

        tryWebSocket() {
            console.log('[HotLoader] 尝试建立 WebSocket 连接...');
            this.ws = new WebSocket(WS_URL);
            this.ws.onopen = () => {
                console.log('[HotLoader] WebSocket 连接成功');
                this.checkUpdate(true);
            };
            this.ws.onmessage = (event) => {
                try {
                    const msg = JSON.parse(event.data);
                    if (msg.type === 'change') this.checkUpdate(true);
                } catch (e) {}
            };
            this.ws.onclose = () => {
                setTimeout(() => this.tryWebSocket(), 2000);
            };
        }

        async checkUpdate(force = false) {
            try {
                const vRes = await fetch(HTTP_URL + '/version');
                const vData = await vRes.json();
                
                if (vData.hash !== this.lastHash || force) {
                    this.lastHash = vData.hash;
                    
                    // ============================================
                    // 进入 Loading 状态 (销毁旧积木)
                    // ============================================
                    if (Scratch.vm) {
                        this.isLoading = true;
                        Scratch.vm.extensionManager.refreshBlocks();
                        // 稍微给一点时间让 UI 渲染出 "⏳ 正在拉取..."
                        await new Promise(r => setTimeout(r, 50));
                    }

                    // ============================================
                    //拉取并执行新代码
                    // ============================================
                    const cRes = await fetch(HTTP_URL + '/code.js?t=' + Date.now());
                    const code = await cRes.text();
                    
                    const oldReg = Scratch.extensions.register;
                    let captured = null;
                    Scratch.extensions.register = (inst) => { captured = inst; };
                    
                    try { window.eval(code); } catch(e) { console.error("扩展执行错误:", e); }
                    
                    Scratch.extensions.register = oldReg;
                    
                    if (captured) {
                        this.__updateMethods(captured);
                    }

                    // ============================================
                    // 恢复正常状态 (重建新积木)
                    // ============================================
                    if (Scratch.vm) {
                        this.isLoading = false;
                        Scratch.vm.extensionManager.refreshBlocks();
                        console.log('[HotLoader] 热重载完成 (Loading Swap)');
                    }
                }
            } catch(e) {
                console.error(e);
                // 如果出错，也要记得切回正常状态，否则一直卡在 loading
                this.isLoading = false; 
                if (Scratch.vm) Scratch.vm.extensionManager.refreshBlocks();
            }
        }
    }
    
    const proxy = new HotProxy();
    try { Scratch.extensions.register(proxy); } catch(e) { console.error(e); }
    proxy.start();
})();`;
        fs.writeFileSync('scripts/loader.js', loaderTemplate);

        // --- 5. 写入 scripts/server.js (保持 URL 直连逻辑) ---
        const serverScript = `
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const open = require('open');
const readline = require('readline');
const { WebSocketServer } = require('ws');
const http = require('http');
const pkg = require('../package.json');

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

// 用户代码
app.get('/code.js', (req, res) => { 
    res.setHeader('Cache-Control', 'no-store'); 
    res.sendFile(EXT_FILE); 
});

// 加载器入口 (Turbowarp 访问此 URL)
app.get('/extension.js', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', 'application/javascript');
    
    let loaderCode = fs.readFileSync(LOADER_FILE, 'utf-8');
    loaderCode = loaderCode.replace('{{EXTENSION_ID}}', pkg.extensionConfig.id);
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
        if (size < 1024) sizeStr = size + ' B';
        else sizeStr = (size / 1024).toFixed(2) + ' KB';
    } catch(e) {}

    wss.clients.forEach(client => {
        if (client.readyState === 1) { 
            client.send(msg);
            count++;
        }
    });

    const time = new Date().toLocaleTimeString();
    console.log(\`\\n\\x1b[42m\\x1b[30m [UPDATE] \\x1b[0m \\x1b[32m\${time}\\x1b[0m\`);
    console.log(\`   文件: \${path.basename(filename)} 大小: \${sizeStr}\`);
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
    console.log(\`\\x1b[36m
  ===========================================
   Extension Hot Reloader Server
  ===========================================
\\x1b[0m\`);
    console.log(\`\\x1b[32mHTTP: http://127.0.0.1:\${PORT}\\x1b[0m\`);
    console.log(\`\\x1b[35mWS:   ws://127.0.0.1:\${PORT}\\x1b[0m\`);

    const autoOpenUrl = \`https://turbowarp.org/editor?extension=http://localhost:\${PORT}/extension.js\`;

    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });
    console.log("");
    console.log("将会自动打开: " + autoOpenUrl);
    
    rl.question('是否打开 TurboWarp 网页版? (Y/n) ', (answer) => {
        if (answer.trim().toLowerCase() !== 'n') {
            open(autoOpenUrl);
        }
        rl.close();
    });
});`;
        fs.writeFileSync('scripts/server.js', serverScript);

        // --- 6. 写入 scripts/build.js ---
        const buildScript = `
const fs = require('fs');
const path = require('path');
const pkg = require('../package.json');
const SRC = path.join(__dirname, '../src/extension.js');
const DIST_DIR = path.join(__dirname, '../dist');
const DIST_FILE = path.join(DIST_DIR, \`\${pkg.extensionConfig.id}.js\`);
if (!fs.existsSync(DIST_DIR)) fs.mkdirSync(DIST_DIR);
console.log("\\x1b[36m📦 Building...\\x1b[0m");
fs.writeFileSync(DIST_FILE, fs.readFileSync(SRC));
console.log(\`\\x1b[32m✅ Build Success: dist/\${pkg.extensionConfig.id}.js\\x1b[0m\`);`;
        fs.writeFileSync('scripts/build.js', buildScript);

        // --- 7. Yarn Install ---
        console.log("\n🧶 \x1b[33m正在安装依赖...\x1b[0m");
        try {
            execSync('yarn install', { stdio: 'inherit', shell: true });
        } catch (e) {
            console.error("❌ 依赖安装失败");
            process.exit(1);
        }

        console.log("\n✅ 升级完成！启动中...");

        rl.close();
        try {
            execSync('yarn start', { stdio: 'inherit', shell: true });
        } catch (e) { }
    });
});