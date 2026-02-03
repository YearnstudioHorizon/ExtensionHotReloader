# 🧶 TurboWarp Extension Hot Reload Dev Server

[English](/README_En.md)

[![TurboWarp](https://img.shields.io/badge/Platform-TurboWarp-ff4c4c?style=flat-square)](https://turbowarp.org)
[![Yarn](https://img.shields.io/badge/Package_Manager-Yarn-2C8EBB?style=flat-square)](https://yarnpkg.com)

这是一个用于 TurboWarp 扩展开发的脚手架和开发服务器。它解决了 TurboWarp 强制 URL 加载扩展进入“沙箱模式”的问题，实现了**本地开发、非沙箱运行、实时热重载**的流畅体验。

## ✨ 特性

* **🔥 实时热重载**: 修改 `src` 目录下的代码并保存，TurboWarp 中的积木会自动更新，无需刷新页面。
* **⚡ 非沙箱环境**: 扩展运行在主线程，拥有完整的 `window` 和 DOM 访问权限。
* **📋 自动化流程**: 启动服务自动将加载器代码复制到剪贴板，并提供交互式询问是否打开浏览器。
* **🧶 Yarn 优先**: 针对 Yarn 包管理器优化的极简依赖管理。

## 🚀 快速开始

### 1. 初始化项目
在你的开发文件夹下运行初始化脚本：

```bash
node init.js
```

按照提示输入 **扩展ID** 和 **扩展名称**。脚本会自动创建目录、安装依赖。

### 2. 启动开发服务器
在项目根目录下运行：

```bash
yarn start
```

### 3. 在 TurboWarp 中加载
1. 启动后，终端会提示 Loader 代码已复制到剪贴板。

2. 在弹出的询问中选择是否打开 TurboWarp Editor。

3. 输入`Y`然后确认即可打开

#### 如果您已经打开了TurboWarp Editor
可以遵循如下步骤

1. 在 TurboWarp 中点击左下角的扩展图标。

2. 选择 **自定义扩展**。

3. 切换到 **文本** 选项卡。

4. 粘贴 (Ctrl+V) 代码并点击 加载 (Load)。

> ⚠️ 注意：请务必选择 "以非沙箱模式运行 (Run unsandboxed)"。

现在，你可以开始在 src/extension.js 中编写代码了！每次保存文件，TurboWarp 都会自动同步。

## 🛠️ 命令说明
| 命令 |	说明 |
| --- | --- |
| yarn start |	启动开发服务器 (Port 3000)，监听文件变更，支持热重载。 |
| yarn build |	将扩展打包导出到 dist/ 目录，生成最终的可发布文件。 |
| yarn clean |	清理 dist/ 目录。 |

## 📂 项目结构

```
.
├── src/
│   └── extension.js       # 📝 在这里编写你的扩展逻辑
├── scripts/               # ⚙️ 核心脚本 (一般无需修改)
│   ├── server.js          #    开发服务器逻辑
│   ├── loader.js          #    热重载代理/加载器模板
│   └── build.js           #    构建发布脚本
├── dist/                  # 📦 构建输出目录 (发布用)
├── init.js                # ✨ 项目初始化脚本
└── package.json
```

## 🧩 工作原理

由于 TurboWarp 的安全策略，直接从 URL 加载的扩展会被强制放入 Web Worker (沙箱) 中。
1. **特权加载**: 我们通过“文本加载”方式注入一个 **Loader (代理扩展)**。因为是手动粘贴的代码，TurboWarp 允许其获得 **非沙箱权限**。
2. **实时监听**: Loader 运行后会接收WebSocket消息或持续轮询本地服务器。
3. **动态注入**: 监听到源码变更后，Loader 拉取新代码，通过 `eval` 在当前特权上下文中执行，新代码通过A-B-A修改opcode的方式刷新积木外显。
4. **失败回退**：如果WebSocket连接失败，Loader 会自动切换到HTTP轮询模式，确保开发体验不中断。
5. **自动打开浏览器**: 启动服务器后会自动打开TurboWarp的编辑器并载入扩展。

> 什么是A-B-A修改opcode的方式？

简单来说是推送两次扩展更新，第一次更新是把积木的opcode改成原本opcode后增加一个时间字符串，这样会强制刷新积木。

第二次更新是把积木的opcode改成原本opcode，这样就可以实现原本作品存量积木的兼容。

## ⚠️ 常见问题

### Q: 为什么积木没有更新？ 
A: 请检查终端是否报错。确保 src/extension.js 中的 id 与 package.json 中的 extensionConfig.id 保持一致。

### Q：为什么更新后原本作品存量积木没有更新？
A：目前该问题没有解决，请保存作品后重新打开作品即可。

## 🧷 后记
> 此项目由Gemini生成

原因是[fs-context](https://github.com/Rundll86/fs-context)的扩展开发者在多次催促下仍然懒得做热重载, 我就借助Gemini自己做了一个(感谢原作者对于拼写的纠正)
