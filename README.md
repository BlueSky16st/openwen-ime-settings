# OpenWen Settings

OpenWen Settings 是 OpenWen 输入法的设置应用。这里维护设置界面、设置 JSON 契约和本机读写逻辑，不包含输入核心、词库和平台输入法前端。

设置界面分为三页：

- **输入**：输入方案、候选数量、翻页键、默认输入状态和快捷键行为。
- **外观**：浅色或深色模式、候选窗背景颜色、候选文字大小和实时预览。
- **本地学习**：个性化学习开关和本地学习数据清除。

目前可以构建 Apple Silicon Mac 使用的 App，最低系统版本为 macOS 26.0。Windows 目标名已经保留，Windows 构建尚未实现。

## 仓库结构

```text
.
├── src/                    # React 设置界面、页面和设置模型
├── src-tauri/              # Tauri 入口、本机读写、诊断和平台后端
├── schema/                 # 对外使用的设置 JSON Schema
└── tools/build/            # macOS 构建和目标检查工具
```

`src-tauri/gen/schemas/` 是 Tauri capability 使用的 Schema，不是构建缓存。

## 环境要求

需要安装：

- Node.js 24 LTS。
- pnpm 10.15.1。
- Rust 1.85 或更高版本。
- 完整 Xcode、Apple Clang 和 macOS 26.0 或更高版本的 SDK。
- Rust 目标 `aarch64-apple-darwin`。

安装依赖：

```sh
pnpm install --frozen-lockfile
```

## 开发

启动前端页面：

```sh
pnpm dev
```

启动 Tauri 应用：

```sh
pnpm tauri dev
```

常用检查命令：

| 命令 | 用途 |
| --- | --- |
| `pnpm test` | 运行 React 界面和设置模型测试 |
| `pnpm typecheck` | 检查 TypeScript 类型 |
| `pnpm build` | 编译前端 |
| `pnpm test:rust` | 运行 Rust 设置、诊断和平台后端测试 |
| `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check` | 检查 Rust 格式 |

## 构建 macOS App

生成 Release 构建产物：

```sh
pnpm build:artifact -- --target aarch64-apple-darwin
```

默认输出目录：

```text
dist/aarch64-apple-darwin/release
```

目录中包含：

- `OpenWen Settings.app`
- `share/openwen/settings/openwen-ime-settings.schema.json`
- `openwen-ime-settings-manifest.json`

指定其他输出目录：

```sh
pnpm build:artifact -- \
  --target aarch64-apple-darwin \
  --output /absolute/path/to/release
```

如果 Tauri App 已经单独构建，可以通过 `--artifact` 指定现有 `.app`，只执行安装和完整性检查：

```sh
pnpm build:artifact -- \
  --target aarch64-apple-darwin \
  --artifact /absolute/path/to/OpenWen\ Settings.app \
  --output /absolute/path/to/release
```

Debug 编译使用：

```sh
pnpm tauri build --debug --no-bundle --ci \
  --target aarch64-apple-darwin
```

## 检查构建结果

检查默认目录：

```sh
pnpm verify:target -- --target aarch64-apple-darwin
```

检查其他目录：

```sh
pnpm verify:target -- \
  --target aarch64-apple-darwin \
  --artifact /absolute/path/to/release
```

检查内容包括 App 名称、Bundle ID、可执行文件、macOS 版本、设置 Schema、文件哈希和隐私边界。

## 与平台仓的边界

Settings 构建产物只包含设置 App 和设置 Schema。输入核心、librime、Rime 资源和用户词库不进入本仓构建结果。

`openwen-core-control` 由 Mac 或 Windows 平台仓在打包时提供。Settings 通过固定接口调用它，不依赖 Foundation 或平台仓源码。

## 隐私

- 设置保存在本机，不上传用户输入内容。
- 诊断只返回固定状态和脱敏错误码。
- 本地学习数据由输入核心保存；Settings 只发送清除请求。
- 日志和构建结果不得包含输入串、候选历史、上下文文本或本机私有路径。

## 许可证

OpenWen Settings 自有代码使用 [MIT License](LICENSE)。npm 和 Rust 第三方依赖按各自许可证使用，具体版本记录在 `pnpm-lock.yaml` 和 `src-tauri/Cargo.lock`。
