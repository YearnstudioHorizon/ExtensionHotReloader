const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { execSync } = require('child_process');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

console.log("\x1b[36m%s\x1b[0m", "扩展开发服务器");

rl.question('📦 请输入扩展 ID (例如 my-super-ext): ', (extId) => {
    rl.question('🏷️  请输入扩展名称 (例如 My Super Ext): ', (extName) => {

        // --- 1. 创建目录结构 ---
        console.log("\n📂 正在构建目录...");
        const dirs = ['src', 'scripts', 'dist'];
        dirs.forEach(d => {
            if (!fs.existsSync(d)) fs.mkdirSync(d);
        });

        // --- 2. 写入 package.json (新增 ws 依赖) ---
        const packageJson = {
            "name": extId,
            "version": "2.0.0",
            "description": "TurboWarp Extension Dev Server (WebSocket + HTTP Fallback)",
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
                "ws": "^8.13.0"  // <--- 新增依赖
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
                        opcode: 'hello',
                        blockType: Scratch.BlockType.COMMAND,
                        text: 'Hello WebSocket!',
                        func: 'hello'
                    }
                ]
            };
        }
        hello() {
            alert('当前扩展正在通过 ' + (window._socketMode || 'HTTP') + ' 模式运行');
        }
    }
    Scratch.extensions.register(new MyExtension());
})(Scratch);`;
        fs.writeFileSync('src/extension.js', extensionTemplate);

        // --- 4. 写入 scripts/loader.js (支持 WS + HTTP 降级) ---
        const loaderTemplate = `(function() {
    'use strict';
    const TARGET_EXTENSION_ID = '{{EXTENSION_ID}}'; 
    const SERVER_PORT = 3000;
    const HTTP_URL = 'http://127.0.0.1:' + SERVER_PORT;
    const WS_URL = 'ws://127.0.0.1:' + SERVER_PORT;
    
    const Scratch = window.Scratch;
    if (!Scratch || !Scratch.extensions.unsandboxed) throw new Error("Need Unsandboxed Mode");

    class HotProxy {
        constructor() {
            this.target = { getInfo: () => ({ id: TARGET_EXTENSION_ID, name: '连接中...', blocks: [] }) };
            this.lastHash = '';
            this.pollingInterval = null;
            this.ws = null;
            window._socketMode = '初始化';
        }

        getInfo() {
            const info = this.target.getInfo();
            if (!info.blocks) info.blocks = [];
            info.blocks.push('---');
            info.blocks.push({ opcode: '__forceReload__', blockType: Scratch.BlockType.COMMAND, text: '🔁 强制重载', func: '__forceReload__' });
            info.id = TARGET_EXTENSION_ID;
            return info;
        }

        __updateMethods(newTarget) {
            const proto = Object.getPrototypeOf(newTarget);
            Object.getOwnPropertyNames(proto).forEach(k => {
                if (k !== 'constructor' && k !== 'getInfo') this[k] = newTarget[k].bind(newTarget);
            });
            this.target = newTarget;
        }

        __forceReload__() { this.checkUpdate(true); }

        // --- 启动入口 ---
        start() {
            this.tryWebSocket();
        }

        // --- 模式 1: WebSocket ---
        tryWebSocket() {
            console.log('⚡ [HotLoader] 尝试建立 WebSocket 连接...');
            this.ws = new WebSocket(WS_URL);

            this.ws.onopen = () => {
                console.log('[HotLoader] WebSocket 已连接！进入实时推送模式。');
                window._socketMode = 'WebSocket';
                this.stopPolling(); // 确保轮询关闭
                this.checkUpdate(true); // 连接成功后立即检查一次
            };

            this.ws.onmessage = (event) => {
                try {
                    const msg = JSON.parse(event.data);
                    if (msg.type === 'change') {
                        console.log('[HotLoader] 收到服务器推送变更，正在更新...');
                        this.checkUpdate(true); // 强制更新
                    }
                } catch (e) { console.error(e); }
            };

            this.ws.onclose = () => {
                console.warn('[HotLoader] WebSocket 断开。回退到 HTTP 轮询模式。');
                window._socketMode = 'HTTP (Fallback)';
                this.startPolling();
            };

            this.ws.onerror = (e) => {
                // error 通常会紧接着触发 close，逻辑在 close 处理
                console.warn('⚠️ [HotLoader] WebSocket 错误。');
            };
        }

        // --- 模式 2: HTTP 轮询 (降级方案) ---
        startPolling() {
            if (this.pollingInterval) return;
            console.log('[HotLoader] 已启动 HTTP 轮询 (1s/次)');
            // 立即查一次
            this.checkUpdate();
            this.pollingInterval = setInterval(() => this.checkUpdate(), 1000);
        }

        stopPolling() {
            if (this.pollingInterval) {
                clearInterval(this.pollingInterval);
                this.pollingInterval = null;
                console.log('[HotLoader] HTTP 轮询已停止');
            }
        }

        // --- 核心更新逻辑 ---
        async checkUpdate(force = false) {
            try {
                const vRes = await fetch(HTTP_URL + '/version');
                const vData = await vRes.json();
                
                if (vData.hash !== this.lastHash || force) {
                    this.lastHash = vData.hash;
                    
                    const cRes = await fetch(HTTP_URL + '/code.js?t=' + Date.now());
                    const code = await cRes.text();
                    
                    const oldReg = Scratch.extensions.register;
                    let captured = null;
                    Scratch.extensions.register = (inst) => { captured = inst; };
                    
                    try { window.eval(code); } catch(e) { console.error("扩展代码执行错误:", e); }
                    
                    Scratch.extensions.register = oldReg;
                    
                    if (captured) {
                        this.__updateMethods(captured);
                        if (Scratch.vm) Scratch.vm.extensionManager.refreshBlocks();
                        console.log('[HotReload] 扩展已热更新 @ ' + new Date().toLocaleTimeString());
                    }
                }
            } catch(e) {
                console.warn('[HotLoader] 无法连接开发服务器 (HTTP)', e);
            }
        }
    }
    
    const proxy = new HotProxy();
    // 注册代理
    try { Scratch.extensions.register(proxy); } catch(e) { console.error(e); }
    // 启动连接
    proxy.start();
})();`;
        fs.writeFileSync('scripts/loader.js', loaderTemplate);

        // --- 5. 写入 scripts/server.js (集成 WebSocket Server + File Watcher) ---
        const serverScript = `
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const open = require('open');
const clipboardy = require('clipboardy');
const readline = require('readline');
const { WebSocketServer } = require('ws'); // 引入 WS
const http = require('http');
const pkg = require('../package.json');

const app = express();
app.use(cors());

// 创建 HTTP 服务器 (Express 只是处理请求的 handler)
const server = http.createServer(app);
// 创建 WS 服务器，挂载到同一个 HTTP 端口上
const wss = new WebSocketServer({ server });

const PORT = 3000;
const EXT_FILE = path.join(__dirname, '../src/extension.js');
const LOADER_FILE = path.join(__dirname, 'loader.js');

const getHash = () => {
    if (!fs.existsSync(EXT_FILE)) return '';
    const content = fs.readFileSync(EXT_FILE);
    return crypto.createHash('md5').update(content).digest('hex');
};

// --- HTTP 路由 ---
app.get('/version', (req, res) => { res.json({ hash: getHash() }); });
app.get('/code.js', (req, res) => { res.setHeader('Cache-Control', 'no-store'); res.sendFile(EXT_FILE); });

// --- WebSocket 广播逻辑 ---
const broadcastChange = () => {
    const hash = getHash();
    const msg = JSON.stringify({ type: 'change', hash });
    let count = 0;
    wss.clients.forEach(client => {
        if (client.readyState === 1) { // OPEN
            client.send(msg);
            count++;
        }
    });
    if (count > 0) console.log(\`已向 \${count} 个客户端推送更新通知\`);
};

// --- 文件监听 (fs.watch) ---
let fsWait = false;
if (fs.existsSync(EXT_FILE)) {
    fs.watch(EXT_FILE, (event, filename) => {
        if (filename) {
            // 简单的防抖动 (Debounce)，防止编辑器保存时短时间触发多次
            if (fsWait) return;
            fsWait = setTimeout(() => {
                fsWait = false;
            }, 100);
            
            console.log(\`检测到文件变更: \${filename}\`);
            broadcastChange();
        }
    });
}

// --- 启动服务 ---
server.listen(PORT, async () => {
    console.clear();
    console.log(\`\\x1b[36m
  ===========================================
   Yearnstudio Dev Server (WS+HTTP Hybrid)
  ===========================================
\\x1b[0m\`);
    console.log(\`\\x1b[32m服务运行中: http://127.0.0.1:\${PORT}\\x1b[0m\`);
    console.log(\`\\x1b[35mWebSocket: ws://127.0.0.1:\${PORT}\\x1b[0m\`);

    let loaderCode = fs.readFileSync(LOADER_FILE, 'utf-8');
    loaderCode = loaderCode.replace('{{EXTENSION_ID}}', pkg.extensionConfig.id);
    try {
        await clipboardy.write(loaderCode);
        console.log("\\x1b[33m[已复制] Loader 代码在剪贴板中。\\x1b[0m");
    } catch (e) { console.error("无法写入剪贴板"); }

    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });
    console.log("");
    rl.question('是否打开 TurboWarp 网页版? (Y/n) ', (answer) => {
        if (answer.trim().toLowerCase() !== 'n') {
            open('https://turbowarp.org/editor');
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
        console.log("\n🧶 \x1b[33m正在安装依赖 (含 ws)...\x1b[0m");
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