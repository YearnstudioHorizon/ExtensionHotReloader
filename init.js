'use strict';
const fs = require('fs');
const readline = require('readline');

if (fs.existsSync('extension.config.json')) {
    process.exit(0);
}

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

console.log("\x1b[36m扩展开发服务器 - 初始化\x1b[0m\n");

rl.question('请输入扩展 ID (例如 my-ext): ', (extId) => {
    rl.question('请输入扩展名称 (例如 My Ext): ', (extName) => {
        extId = extId.trim();
        extName = extName.trim();

        // 创建目录
        console.log("\n📂 正在创建目录...");
        ['src', 'dist'].forEach(d => {
            if (!fs.existsSync(d)) fs.mkdirSync(d);
        });

        // 写入 extension.config.json
        const config = { id: extId, name: extName };
        fs.writeFileSync('extension.config.json', JSON.stringify(config, null, 2));

        // 写入 src/extension.js 模板
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

        console.log("\n\x1b[32m初始化完成\x1b[0m");
        rl.close();
    });
});
