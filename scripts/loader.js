(function() {
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
            this.isLoading = false;
        }

        getInfo() {
            if (this.isLoading) {
                return {
                    id: TARGET_EXTENSION_ID,
                    name: '正在热重载...',
                    color1: '#FF5500',
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

            const info = this.target.getInfo();
            if (!info.blocks) info.blocks = [];

            info.blocks.push('---');
            info.blocks.push({
                opcode: '__forceReload__',
                blockType: Scratch.BlockType.COMMAND,
                text: '🔥 强制重载',
                func: '__forceReload__'
            });

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

                    if (Scratch.vm) {
                        this.isLoading = true;
                        Scratch.vm.extensionManager.refreshBlocks();
                        await new Promise(r => setTimeout(r, 50));
                    }

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

                    if (Scratch.vm) {
                        this.isLoading = false;
                        Scratch.vm.extensionManager.refreshBlocks();
                        console.log('[HotLoader] 热重载完成');
                    }
                }
            } catch(e) {
                console.error(e);
                this.isLoading = false;
                if (Scratch.vm) Scratch.vm.extensionManager.refreshBlocks();
            }
        }
    }

    const proxy = new HotProxy();
    try { Scratch.extensions.register(proxy); } catch(e) { console.error(e); }
    proxy.start();
})();
