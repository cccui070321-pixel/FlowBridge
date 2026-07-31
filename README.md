# FlowBridge

> Make Multiple Computers Feel Like One.

FlowBridge 是面向 AI 创作者的跨设备工作流助手。这个仓库包含可运行的 Windows 优先 MVP：安全 Electron 桌面壳、React 工作台、文本与 Prompt 历史、文件传输状态机、设备管理、隐私开关，以及可部署到 Supabase 的数据模型和行级权限策略。

## 当前版本

V0.1 提供两种运行方式：

- **演示空间（开箱即用）**：完整交互、数据本地持久化、系统剪贴板与文件选择器通过安全 IPC 工作；用于产品评审与界面验收。
- **Supabase 模式（需项目配置）**：邮箱 Magic Link、设备表、私有 Storage、Realtime 事件与 RLS 数据隔离的基础设施已包含在仓库中。首版不会在没有真实项目密钥和双机环境时伪称已完成云端验收。

## 本地运行

要求：Node.js 22+、npm 10+、Windows 10 22H2 或 Windows 11。

```powershell
npm install
npm run dev
```

只预览浏览器界面：

```powershell
npm run dev:web
```

## 验证与构建

```powershell
npm run lint
npm run test
npm run build
npm run dist:win
```

最后一条在 `release/` 生成 NSIS 安装包。

## 启用 Supabase

1. 新建 Supabase 项目。
2. 执行 [初始迁移](supabase/migrations/202607300001_initial.sql)。
3. 复制 `.env.example` 为 `.env.local`，填写项目 URL 与 anon key。
4. 在 Supabase Auth 中启用邮箱 Magic Link，并配置允许的重定向地址。
5. 重启应用；欢迎页会启用“发送登录链接”。

匿名密钥可以出现在桌面客户端，真正的安全边界是迁移中启用的 RLS；`service_role` 密钥绝不能写入客户端或提交到仓库。

## 已实现的产品规则

- 默认手动发送，自动同步与自动写入系统剪贴板均默认关闭。
- 文本限制 1MB，文件限制 500MB、单批 20 个。
- 内容哈希去重；远端写入接口与发送动作分离，避免循环回传。
- 文件传输拥有等待、上传、完成、失败、取消、过期状态，并保留校验值字段。
- Prompt 支持搜索、收藏、标签、派生版本与 30 天软删除模型。
- 当前设备不可作为发送目标；设备支持在线、离线、重命名与撤销语义。
- Electron 使用 `contextIsolation: true`、`nodeIntegration: false`、sandbox 与白名单 IPC。
- 通知与列表默认不展示完整敏感正文；支持暂停同步、清空历史、深浅色和减少动态效果。

## 当前边界

- 演示空间中的“传输”用于验证完整交互与状态机，不会把文件上传到外部服务。
- 真实跨设备 Realtime、Storage 上传/下载、令牌撤销和安装包签名必须在已配置的 Supabase 项目和两台 Windows 实机上验收。
- 断点续传、macOS、公网发布、自动更新、系统级全局快捷键不属于 V0.1 已验证范围。

详细产品范围见 [PRD](docs/FlowBridge_PRD_V1.0.md)。
