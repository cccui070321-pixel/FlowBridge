# FlowBridge

> Make Multiple Computers Feel Like One.

FlowBridge 是面向 AI 创作者的跨设备工作流助手。仓库包含可运行的 Windows 桌面应用：安全 Electron 桌面壳、React 工作台、双向文本与真实文件传输、个人空间、云端存储、设备管理，以及由 Supabase RLS 隔离的数据后端。

## 当前版本

V0.4.0「稳定连接」提供两种运行方式：

- **演示空间**：完整交互、本地持久化和安全 IPC，用于开发与界面验收。
- **Supabase 模式**：邮箱登录、自动重连与补拉、双向文本、持久化分片传输队列、后台自动接收、SHA-256 校验、头像与壁纸、程序内更新、存储配额、RBAC 与审计日志。

V0.4.0 保持 `com.flowbridge.desktop` 应用标识以及 `flowbridge-v0.2` 本地数据键。当前用户最后手动安装一次 V0.4.0，后续稳定版本可在程序的“设置 → 软件更新”中完成更新。

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
2. 按顺序执行 [初始迁移](supabase/migrations/202607300001_initial.sql)、[V0.3 平台迁移](supabase/migrations/202608020001_v03_platform.sql) 与 [V0.4 可靠性迁移](supabase/migrations/202608040001_v04_reliability.sql)。已有 V0.3 项目只执行最后一个文件。
3. 复制 `.env.example` 为 `.env.local`，填写项目 URL 与 Publishable key。
4. 重启应用；首次使用时创建同步账号。如项目开启邮箱确认，请先点击确认邮件，再在两台电脑使用同一邮箱和密码登录。
5. 两台电脑分别设置不同设备名，等待彼此出现在设备列表中，然后选择目标设备发送文本或文件。

Publishable key 可以出现在桌面客户端，真正的安全边界是迁移中启用的 RLS；Secret key 与 `service_role` 密钥绝不能写入客户端或提交到仓库。

## 已实现的产品规则

- 默认手动发送，自动同步与自动写入系统剪贴板均默认关闭。
- 文本限制 1MB，文件限制 500MB、单批 20 个。
- 内容哈希去重；远端写入接口与发送动作分离，避免循环回传。
- 文件通过 Supabase 私有 Storage 分片上传；主进程持久化队列支持重启续传、分片重试、500MB 限制、SHA-256、接收确认和同名文件保护。
- Realtime 用于加速通知，30 秒补拉与自动重连负责兜底；睡眠唤醒和网络恢复后会主动修复连接。
- 关闭窗口可缩到系统托盘继续接收；接收目录设置后可自动保存目标为本机的文件。
- 用户可上传头像和壁纸，图片在本机裁切、缩放并清除元数据后再上传。
- GitHub Release 提供稳定通道更新；安装前会等待正在进行的传输结束。
- Prompt 支持搜索、收藏、标签、派生版本与 30 天软删除模型。
- 当前设备不可作为发送目标；设备支持在线、离线、重命名与撤销语义。
- Electron 使用 `contextIsolation: true`、`nodeIntegration: false`、sandbox 与白名单 IPC。
- 用户可调整主题、强调色、字体大小、界面密度、首页卡片、导航顺序、通知与默认下载目录。
- 管理员通过安全 RPC 管理账号状态、角色、设备和存储配额，所有敏感操作记录原因与审计日志。

## 当前边界

- V0.4.0 仍以 Windows 为主；macOS、局域网直连、端到端加密与系统级全局快捷键不在本版范围。
- 文件内容存放在私有 Supabase Storage；客户端只包含 Publishable key，不能包含 Secret 或 `service_role` 密钥。
- 管理后台默认不可见，需要在数据库中把首个可信账号设为 `super_admin`。

详细产品范围见 [PRD V3.0](docs/FlowBridge_PRD_V3.0.md)，版本变更见 [V0.4.0 发布说明](docs/FlowBridge_v0.4.0_RELEASE_NOTES.md)。
