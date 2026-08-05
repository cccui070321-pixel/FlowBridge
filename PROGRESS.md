# FlowBridge V0.3 进度

## 目标

- 在原 V0.2 软件上覆盖升级，不改变应用标识与本地数据键。
- 完成 PRD V2.0 的界面重构、真实文件、个人主页、设置、存储和管理后台。

## 已完成

- [x] Apple 风格原则下的浅色优先界面、统一留白与 ≥12px 可读字号
- [x] 首页、剪贴板、文件、Prompt、存储、设备、个人主页、设置、管理后台
- [x] 主题、强调色、字体、密度、首页卡片、导航顺序与通知自定义
- [x] Supabase 私有 Storage、TUS 可恢复上传、SHA-256 流式校验、接收与另存为
- [x] Profiles、Preferences、Quota、Storage Index、RBAC、账号状态与 Audit Log 迁移
- [x] V0.2 本地数据自动迁移到 V0.3，保留原 appId 与安装目录
- [x] 类型检查、lint（0 error）、5/5 单元测试、生产构建通过
- [x] 1280×720 浅色/深色视觉回归：0 横向溢出、0 小于 12px 文本、0 控制台错误
- [x] Windows NSIS 安装包：`FlowBridge-0.3.0-Setup.exe`，112,058,581 字节，SHA-256 `9C56FC03081F317D1DFB4873A321B8AC4B6290247F310C3C407FD54C988A3B26`

## 发布前

- [ ] 在生产 Supabase 执行 `202608020001_v03_platform.sql`
- [ ] 把首个可信账号设为 `super_admin` 并实测管理后台
- [ ] 两台 Windows 实测文本、文件上传、接收、校验与覆盖安装
- [ ] 推送功能分支、合并并创建 GitHub v0.3.0 Release
