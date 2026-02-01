const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { execSync } = require('child_process');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

console.log("\x1b[36m%s\x1b[0m", "🛠️  扩展热重载开发服务器 - 初始化向导");

rl.question('📦 请输入扩展 ID (例如 my-yearn-ext): ', (extId) => {
    rl.question('🏷️  请输入扩展名称 (例如 My Super Ext): ', (extName) => {

        // --- 1. 创建目录结构 ---
        console.log("\n📂 正在构建目录...");
        const dirs = ['src', 'scripts', 'dist'];
        dirs.forEach(d => {
            if (!fs.existsSync(d)) fs.mkdirSync(d);
        });

        // --- 2. 写入 package.json ---
        const packageJson = {
            "name": extId,
            "version": "1.0.0",
            "description": "TurboWarp Extension Hot Reload Server",
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
                "clipboardy": "^2.3.0"
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
                        text: 'Hello Yarn!',
                        func: 'hello'
                    }
                ]
            };
        }
        hello() {
            alert('扩展热重载开发服务器工作正常！');
        }
    }
    Scratch.extensions.register(new MyExtension());
})(Scratch);`;
        fs.writeFileSync('src/extension.js', extensionTemplate);

        // --- 4. 写入 scripts/loader.js (Loader) ---
        const loaderTemplate = `(function() {
    'use strict';
    const TARGET_EXTENSION_ID = '{{EXTENSION_ID}}'; 
    const SERVER_URL = 'http://127.0.0.1:3000';
    const Scratch = window.Scratch;
    if (!Scratch || !Scratch.extensions.unsandboxed) throw new Error("Need Unsandboxed Mode");

    class HotProxy {
        constructor() {
            this.target = { getInfo: () => ({ id: TARGET_EXTENSION_ID, name: '🔥 连接中...', blocks: [] }) };
            this.lastHash = '';
        }
        getInfo() {
            const info = this.target.getInfo();
            if (!info.blocks) info.blocks = [];
            info.blocks.push('---');
            info.blocks.push({ opcode: '__forceReload__', blockType: Scratch.BlockType.COMMAND, text: '🔥 强制重载', func: '__forceReload__' });
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
        startPolling() {
            setInterval(() => this.checkUpdate(), 1000);
            this.checkUpdate(true);
        }
        async checkUpdate(force = false) {
            try {
                const vRes = await fetch(SERVER_URL + '/version');
                const vData = await vRes.json();
                if (vData.hash !== this.lastHash || force) {
                    this.lastHash = vData.hash;
                    const cRes = await fetch(SERVER_URL + '/code.js?t=' + Date.now());
                    const code = await cRes.text();
                    const oldReg = Scratch.extensions.register;
                    let captured = null;
                    Scratch.extensions.register = (inst) => { captured = inst; };
                    try { window.eval(code); } catch(e) { console.error(e); }
                    Scratch.extensions.register = oldReg;
                    if (captured) {
                        this.__updateMethods(captured);
                        if (Scratch.vm) Scratch.vm.extensionManager.refreshBlocks();
                        console.log('🔥 [HotReload] 扩展已更新');
                    }
                }
            } catch(e) {}
        }
    }
    const proxy = new HotProxy();
    proxy.startPolling();
    try { Scratch.extensions.register(proxy); } catch(e) { console.error(e); }
})();`;
        fs.writeFileSync('scripts/loader.js', loaderTemplate);

        // --- 5. 写入 scripts/server.js (关键修改：增加询问逻辑) ---
        const serverScript = `
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const open = require('open');
const clipboardy = require('clipboardy');
const readline = require('readline'); // 引入 readline
const pkg = require('../package.json');

const app = express();
app.use(cors());
const PORT = 3000;
const EXT_FILE = path.join(__dirname, '../src/extension.js');
const LOADER_FILE = path.join(__dirname, 'loader.js');

const getHash = () => {
    if (!fs.existsSync(EXT_FILE)) return '';
    const content = fs.readFileSync(EXT_FILE);
    return crypto.createHash('md5').update(content).digest('hex');
};

app.get('/version', (req, res) => { res.json({ hash: getHash() }); });
app.get('/code.js', (req, res) => { res.setHeader('Cache-Control', 'no-store'); res.sendFile(EXT_FILE); });

app.listen(PORT, async () => {
    // 1. 清屏并打印新 Banner
    console.clear();
    console.log(\`\\x1b[36m
  ===============================
   扩展热重载开发服务器
   Extension Hot Reload Server
  ===============================
\\x1b[0m\`);
    console.log(\`\\x1b[32m✅ 服务运行中: http://127.0.0.1:\${PORT}\\x1b[0m\`);

    // 2. 复制 Loader 代码
    let loaderCode = fs.readFileSync(LOADER_FILE, 'utf-8');
    loaderCode = loaderCode.replace('{{EXTENSION_ID}}', pkg.extensionConfig.id);
    try {
        await clipboardy.write(loaderCode);
        console.log("\\x1b[33m📋 [已复制] Loader 代码在剪贴板中，请去 TurboWarp 粘贴加载。\\x1b[0m");
    } catch (e) { console.error("无法写入剪贴板，请手动复制 scripts/loader.js"); }

    // 3. 询问是否打开浏览器
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    console.log(""); // 空一行
    rl.question('❓ 是否打开 TurboWarp 网页版? (Y/n) ', (answer) => {
        const shouldOpen = answer.trim().toLowerCase() !== 'n'; // 默认 Yes
        if (shouldOpen) {
            console.log("🌍 正在打开浏览...");
            open('https://turbowarp.org/editor');
        } else {
            console.log("👌 已跳过打开浏览器。保持服务运行中...");
        }
        rl.close(); // 关闭输入流，让 Node 进程继续挂起监听端口
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
console.log("\\x1b[36m📦 正在构建...\\x1b[0m");
fs.writeFileSync(DIST_FILE, fs.readFileSync(SRC));
console.log(\`\\x1b[32m✅ 构建完成: dist/\${pkg.extensionConfig.id}.js\\x1b[0m\`);`;
        fs.writeFileSync('scripts/build.js', buildScript);

        // --- 7. 自动执行 Yarn Install ---
        console.log("\n🧶 \x1b[33m正在安装依赖 (yarn install)...\x1b[0m");
        try {
            execSync('yarn install', { stdio: 'inherit', shell: true });
        } catch (e) {
            console.error("❌ 依赖安装失败");
            process.exit(1);
        }

        console.log("\n✅ 初始化完成！正在启动服务器...");

        // --- 8. 自动启动服务器 ---
        rl.close();
        try {
            // 使用 inherit 让子进程的输入输出直接对接当前终端，从而支持询问交互
            execSync('yarn start', { stdio: 'inherit', shell: true });
        } catch (e) {
            // 退出是正常的
        }
    });
});