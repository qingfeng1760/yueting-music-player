# 悦听 · 本地音乐播放器（网页版，安卓风格）

一个只在自己电脑浏览器中运行的本地音乐 App。无需联网、无需登录、无需安装，所有数据保存在浏览器本地。

## 如何启动

需要通过本地静态服务器打开（ES Module 不支持 file:// 直开），任选其一：

```bash
# 方式一：Node
npx http-server -p 8080

# 方式二：Python
python -m http.server 8080
```

然后浏览器（推荐 Edge / Chrome）打开 <http://localhost:8080>。

## 使用须知

- 音乐文件导入后**复制**进浏览器数据库（IndexedDB），重启浏览器不丢。
- 请固定用同一台电脑的同一浏览器打开；不要用无痕模式，数据会被隔离。
- 「数据与设置」里可导出 JSON 备份（歌单/收藏/历史/设置，不含音频本体）。

## 运行测试

```bash
npm install        # 安装开发测试依赖（fake-indexeddb，仅测试用）
npm test           # Node 单元测试（存储层/队列/推荐/歌单/历史/统计备份/搜索/配色/边界）
```

浏览器端测试页（需先启动本地服务器）：

| 页面 | 作用 |
|---|---|
| `/tests.html` | 存储层与推荐逻辑自检，跑在真实 IndexedDB 上（独立数据库 `yueting-selftest`） |
| `/uitest.html` | 界面自检：用 iframe 驱动真实 App 做布局与交互断言（独立数据库 `yueting-uitest`） |

两个测试页都用独立数据库，不会影响你的音乐数据。

`js/dev/` 下是**开发辅助模块**，只在被显式注入或访问测试页时生效，正常使用不会加载：

```js
// 在页面控制台执行（需先注入 /js/dev/seed.js）
await window.__seed();            // 生成 6 首合成歌曲（假音频）
await window.__seedTone('测试音'); // 生成一段真实可播放的 WAV
await window.__wipe();            // 清空全部本地数据
```

## 打包成 Windows 桌面应用（Tauri，可选）

已配置 Tauri v2，可打包成不依赖浏览器的独立 exe。

**一次性前置条件**：
1. Rust 工具链：`winget install Rustlang.Rustup`（或用国内镜像安装，见 `scripts/` 注释；建议在 `~/.cargo/config.toml` 配置 crates.io 镜像加速）
2. MSVC 生成工具：`winget install Microsoft.VisualStudio.2022.BuildTools`（需含「C++ 桌面开发」与 Windows SDK）
3. WebView2 运行时：Windows 10/11 一般自带

**命令**：

```bash
npm run app:build     # 打包（自动先构建 dist/）
npm run app:dev       # 开发模式：桌面窗口连接 http://localhost:8123 调试
npm run build:dist    # 仅生成 dist/（打包用静态资源副本）
npm run icon          # 重新生成应用图标
```

**产物**：
- 绿色版：`src-tauri/target/release/yueting.exe`（约 8.7 MB，双击即用）
- 安装包：`src-tauri/target/release/bundle/nsis/悦听_1.0.0_x64-setup.exe`（约 1.9 MB，NSIS 向导安装）

**数据说明（重要）**：桌面版的数据存在自己的存储空间（来源 `http://tauri.localhost`），与浏览器版**相互独立**。从浏览器版迁移：先在浏览器里「数据与设置 → 导出备份」，在桌面版导入备份，再重新导入音乐文件夹（备份不含音频本体）。

**验证方式**：桌面版启动后，页面 JS 会通过 Tauri IPC 调用 `report` 命令，在主进程日志输出「[页面报告] 应用已就绪 @tauri.localhost」。`dist/index.html` 还注入了启动诊断：若加载或脚本出错，错误信息会显示在窗口标题上。

## 已知限制

- 音频格式以浏览器解码能力为准（Chrome/Edge 支持 mp3 / m4a / flac / ogg / wav）。
- 备份文件**不含音频本体**，换浏览器或重装后需重新导入音乐文件。
- 清空浏览器「站点数据 / Cookie 及网站数据」会连同音乐一起删除。
- 游戏娱乐模块当前为占位页，玩法待定。

## 文档

- [PRD.md](./PRD.md) —— 产品需求与验收标准
- [docs/页面结构与交互设计-v1.md](./docs/页面结构与交互设计-v1.md) —— 页面结构与交互设计
