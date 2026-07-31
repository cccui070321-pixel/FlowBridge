# FlowBridge V0.1 进度

## 开工回执

- 目标：交付可运行、可评审、可继续接入真实云端的 Windows 优先 Electron MVP。
- 顺序：安全壳与领域规则 → 核心交互 → Supabase 基础设施 → 自动化验证 → Git 发布。
- 最大风险：当前没有 Supabase 项目凭据与真实双机环境，不能把本地演示冒充真实跨设备验收。

## 已完成

- [x] PRD 范围、P0/P1 与非目标核验
- [x] Electron 安全主进程与 preload 白名单
- [x] React 工作台、剪贴板、文件、Prompt、设备、设置页面
- [x] 本地持久化、去重、敏感提示、限制与文件状态机
- [x] Supabase schema、私有 Storage、RLS、Realtime 事件与 heartbeat RPC
- [x] 单元测试、CI、构建与安装配置

## 待完成

- [x] 依赖安装；lint 0 错误；5/5 单测通过；typecheck 与生产 build 通过
- [x] 欢迎页、工作台、文本发送、文件传输页真实浏览器回归，控制台 0 warning / error
- [x] 生产依赖 `npm audit --omit=dev`：0 漏洞
- [x] Windows NSIS 安装包生成：111,257,319 字节，SHA256 `8720C10DA7763F015F24EF4AB54F0A931B6667F1AC9BFDCF1B6C4A6175F8FE31`
- [x] FlowBridge SVG/PNG 品牌图标与确定性生成脚本
- [x] 初始化 Git、提交并推送到公开 GitHub 仓库
