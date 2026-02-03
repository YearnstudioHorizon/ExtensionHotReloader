# TurboWarp Extension Hot Reload Dev Server

[![TurboWarp](https://img.shields.io/badge/Platform-TurboWarp-ff4c4c?style=flat-square)](https://turbowarp.org)  
[![Yarn](https://img.shields.io/badge/Package_Manager-Yarn-2C8EBB?style=flat-square)](https://yarnpkg.com)

This is a scaffold and development server designed for TurboWarp extension development. It addresses TurboWarp's security policy that forces URL-loaded extensions into sandboxed mode, enabling **local development, unsandboxed execution, and real-time hot reloading** for a seamless developer experience.

## Features

- **Real-time Hot Reloading**: Modifications to files in the `src` directory are automatically reflected in TurboWarp without requiring a page refresh.
- **Unsandboxed Execution**: Extensions run in the main thread with full access to `window` and the DOM.
- **Automated Workflow**: On startup, the loader code is automatically copied to the clipboard, and the user is interactively prompted to open the browser.
- **Yarn-Optimized**: Minimalist dependency management tailored for the Yarn package manager.

## Quick Start

### 1. Initialize the Project
Run the initialization script in your development directory:

```bash
node init.js
```

Follow the prompts to enter an **extension ID** and **extension name**. The script will create the necessary directory structure and install dependencies.

### 2. Start the Development Server
From the project root, run:

```bash
yarn start
```

### 3. Load the Extension in TurboWarp

1. After startup, the terminal will indicate that the loader code has been copied to the clipboard.
2. You will be prompted whether to open the TurboWarp Editor automatically—respond with `Y` to confirm.
3. If the editor is already open, follow these steps manually:
   - Click the extension icon in the bottom-left corner of TurboWarp.
   - Select **Custom Extension**.
   - Switch to the **Text** tab.
   - Paste (Ctrl+V) the loader code and click **Load**.

> **Note**: Ensure you select "Run unsandboxed" when loading the extension.

You can now begin implementing your extension logic in `src/extension.js`. Every time you save the file, TurboWarp will automatically synchronize the changes.

## Commands

| Command        | Description |
|----------------|-------------|
| `yarn start`   | Starts the development server on port 3000, watches for file changes, and enables hot reloading. |
| `yarn build`   | Bundles the extension into the `dist/` directory for publishing. |
| `yarn clean`   | Removes the contents of the `dist/` directory. |

## Project Structure

```
.
├── src/
│   └── extension.js       # Implement your extension logic here
├── scripts/               # Core utility scripts (typically no modification needed)
│   ├── server.js          # Development server implementation
│   ├── loader.js          # Hot-reload proxy/loader template
│   └── build.js           # Build and packaging script
├── dist/                  # Output directory for built artifacts (for distribution)
├── init.js                # Project initialization script
└── package.json
```

## How It Works

Due to TurboWarp’s security model, extensions loaded from URLs are forced into a Web Worker (sandboxed environment). This tool circumvents that restriction as follows:

1. **Privileged Loading**: A loader (proxy extension) is injected via the "text input" method. Because the code is manually pasted, TurboWarp grants it **unsandboxed privileges**.
2. **Live Monitoring**: Once loaded, the loader establishes a WebSocket connection (or falls back to HTTP polling) to listen for source code changes from the local development server.
3. **Dynamic Evaluation**: Upon detecting a change, the loader fetches the updated source and executes it via `eval()` within the privileged context. To ensure visual updates of existing blocks, the loader employs an A-B-A opcode mutation strategy.
4. **Fallback Mechanism**: If the WebSocket connection fails, the loader seamlessly switches to HTTP polling to maintain development continuity.
5. **Browser Automation**: The development server optionally launches the TurboWarp editor and preloads the extension upon startup.

> **What is the A-B-A opcode mutation strategy?**

It involves pushing two rapid extension updates:
- The first update appends a timestamp suffix to each block’s opcode, forcing TurboWarp to re-render the blocks.
- The second update restores the original opcodes, ensuring compatibility with blocks already present in saved projects.

## Troubleshooting

**Q: Why aren’t my blocks updating?**  
A: Verify that there are no errors in the terminal output. Also ensure that the `id` field in `src/extension.js` matches `extensionConfig.id` in `package.json`.

**Q: Why don’t existing blocks in saved projects reflect the latest changes?**  
A: This is a known limitation. As a workaround, save your project, then reload it to see the updated blocks.

## Postscript

This project was generated with assistance from Gemini.

The motivation arose because the developer of [fs-context](https://github.com/Rundll86/fs-context) repeatedly declined to implement hot reloading despite multiple requests. I therefore built this tool myself using Gemini (with thanks to the original author for correcting typographical errors).

(This article has utilized AI translation and manual calibration.Translation standards and translations contributed by developer [shunianssy](https://github.com/shunianssy).)
