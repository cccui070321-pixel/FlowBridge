# FlowBridge

> Make Multiple Computers Feel Like One.

FlowBridge 是面向 AI 创作者的跨设备工作流助手。这个仓库包含可运行的 Windows 优先 MVP：安全 Electron 桌面壳、React 工作台、文本与 Prompt 历史、文件传输状态机、设备管理、隐私开关，以及可部署到 Supabase 的数据模型和行级权限策略。

## 当前版本

V0.2 提供两种运行方式：

- **演示空间（开箱即用）**：完整交互、数据本地持久化、系统剪贴板与文件选择器通过安全 IPC 工作；用于产品评审与界面验收。
- **Supabase 模式（需项目配置）**：邮箱密码登录、真实设备注册与心跳、Realtime 双向文本传输、离线补收以及 RLS 数据隔离已经接通。真实文件上传仍在下一阶段实现。

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
3. 复制 `.env.example` 为 `.env.local`，填写项目 URL 与 Publishable key。
4. 重启应用；首次使用时创建同步账号。如项目开启邮箱确认，请先点击确认邮件，再在两台电脑使用同一邮箱和密码登录。
5. 两台电脑分别设置不同设备名，等待彼此出现在设备列表中，然后选择目标设备发送文本。

Publishable key 可以出现在桌面客户端，真正的安全边界是迁移中启用的 RLS；Secret key 与 `service_role` 密钥绝不能写入客户端或提交到仓库。

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

- Supabase 模式已经接入真实文本 Realtime；演示空间中的文件“传输”仍只用于验证交互与状态机，不会把文件上传到外部服务。
- Storage 上传/下载、令牌撤销和安装包代码签名仍需后续实现与验收。
- 断点续传、macOS、公网发布、自动更新、系统级全局快捷键不属于 V0.1 已验证范围。

详细产品范围见 [PRD](docs/FlowBridge_PRD_V1.0.md)。
