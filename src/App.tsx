import { useCallback, useEffect, useRef, useState, type DragEvent, type ReactNode } from 'react'
import {
  AlertTriangle, ArchiveRestore, ArrowRight, Bell, Check, CheckCircle2, ChevronDown,
  Clipboard, CloudOff, Copy, Cpu, Download, File, FileText, FolderClock, Heart, History, Laptop, Link2,
  LoaderCircle, LockKeyhole, LogOut, Menu, Monitor, Moon, MoreHorizontal, Palette, Pause, Play, Plus, RefreshCcw,
  Search, Send, Settings as SettingsIcon, ShieldCheck, Sparkles, Star, Sun, Trash2, UploadCloud, Wifi, WifiOff, X,
  Zap,
} from 'lucide-react'
import { byteLength, classifyContent, contentHash, formatBytes, isSensitiveContent, relativeTime, validateFiles, validateText } from './lib/domain'
import { isCloudConfigured, sendCloudClipboard, signInWithPassword, signOutCloud, signUpWithPassword, startWorkspaceSync } from './services/supabase'
import { useFlowStore } from './store/useFlowStore'
import type { Activity, Device, Prompt, Transfer } from './types'

type Page = 'dashboard' | 'clipboard' | 'files' | 'prompts' | 'devices' | 'settings'
type Toast = { id: number; message: string; tone: 'success' | 'warning' | 'error' }

const pageTitles: Record<Page, { title: string; subtitle: string }> = {
  dashboard: { title: '工作台', subtitle: '从这里继续你的跨设备工作流' },
  clipboard: { title: '剪贴板', subtitle: '已发送的文本、Prompt 与链接' },
  files: { title: '文件传输', subtitle: '查看上传、接收与文件有效期' },
  prompts: { title: 'Prompt Library', subtitle: '把每次灵感沉淀成可复用资产' },
  devices: { title: '设备管理', subtitle: '可信设备、在线状态与访问权限' },
  settings: { title: '设置', subtitle: '同步、通知、外观与隐私' },
}

export function App() {
  const onboarded = useFlowStore((state) => state.onboarded)
  const settings = useFlowStore((state) => state.settings)
  const updateTransfer = useFlowStore((state) => state.updateTransfer)
  const transfers = useFlowStore((state) => state.transfers)
  const setCloudDevices = useFlowStore((state) => state.setCloudDevices)
  const setCloudClipboard = useFlowStore((state) => state.setCloudClipboard)
  const recordCloudClipboard = useFlowStore((state) => state.recordCloudClipboard)
  const [page, setPage] = useState<Page>('dashboard')
  const [toasts, setToasts] = useState<Toast[]>([])
  const runningTransfers = useRef(new Set<string>())

  const notify = useCallback((message: string, tone: Toast['tone'] = 'success') => {
    const id = Date.now() + Math.random()
    setToasts((current) => [...current, { id, message, tone }])
    window.setTimeout(() => setToasts((current) => current.filter((toast) => toast.id !== id)), 3600)
  }, [])

  useEffect(() => {
    const root = document.documentElement
    const resolved = settings.theme === 'system'
      ? (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark')
      : settings.theme
    root.dataset.theme = resolved
    root.dataset.motion = settings.reduceMotion ? 'reduced' : 'full'
  }, [settings.theme, settings.reduceMotion])

  useEffect(() => {
    if (!onboarded || !isCloudConfigured) return
    const currentDevice = useFlowStore.getState().devices.find((device) => device.isCurrent)
    if (!currentDevice) return
    let stopSync: (() => void) | undefined
    let cancelled = false
    void startWorkspaceSync({
      deviceName: currentDevice.name,
      onDevices: setCloudDevices,
      onInitialClipboard: setCloudClipboard,
      onIncomingClipboard: (item) => {
        recordCloudClipboard(item, true)
        const currentSettings = useFlowStore.getState().settings
        if (currentSettings.autoWriteClipboard) void window.flowbridge?.writeClipboard(item.content)
        if (currentSettings.textNotifications) notify('收到来自另一台设备的新文本')
      },
      onError: (message) => notify(`云端同步异常：${message}`, 'error'),
    }).then((cleanup) => {
      if (cancelled) cleanup()
      else { stopSync = cleanup; notify('云端同步已连接') }
    }).catch((error) => notify(error instanceof Error ? error.message : '连接云端失败', 'error'))
    return () => { cancelled = true; stopSync?.() }
  }, [notify, onboarded, recordCloudClipboard, setCloudClipboard, setCloudDevices])

  useEffect(() => {
    transfers.filter((transfer) => transfer.status === 'queued').forEach((transfer) => {
      if (runningTransfers.current.has(transfer.id)) return
      runningTransfers.current.add(transfer.id)
      updateTransfer(transfer.id, { status: 'uploading', progress: 4 })
      let progress = 4
      const interval = window.setInterval(() => {
        progress = Math.min(100, progress + Math.max(4, Math.round(Math.random() * 17)))
        if (progress >= 100) {
          window.clearInterval(interval)
          const checksum = `${contentHash(`${transfer.fileName}:${transfer.fileSize}`)}${contentHash(transfer.createdAt)}`
          updateTransfer(transfer.id, { status: 'completed', progress: 100, checksum })
          runningTransfers.current.delete(transfer.id)
        } else updateTransfer(transfer.id, { progress })
      }, 420)
    })
  }, [transfers, updateTransfer])

  if (!onboarded) return <Onboarding notify={notify} />

  return (
    <div className="app-shell">
      <Sidebar page={page} onNavigate={setPage} />
      <main className="main-panel">
        <Topbar page={page} onNavigate={setPage} />
        <div className="page-scroll">
          {page === 'dashboard' && <Dashboard onNavigate={setPage} notify={notify} />}
          {page === 'clipboard' && <ClipboardPage notify={notify} />}
          {page === 'files' && <TransfersPage notify={notify} />}
          {page === 'prompts' && <PromptsPage notify={notify} />}
          {page === 'devices' && <DevicesPage notify={notify} />}
          {page === 'settings' && <SettingsPage notify={notify} />}
        </div>
      </main>
      <div className="toast-stack" aria-live="polite">
        {toasts.map((toast) => <div key={toast.id} className={`toast ${toast.tone}`}><CheckCircle2 size={17} />{toast.message}</div>)}
      </div>
    </div>
  )
}

function Onboarding({ notify }: { notify: (message: string, tone?: Toast['tone']) => void }) {
  const complete = useFlowStore((state) => state.completeOnboarding)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [deviceName, setDeviceName] = useState('这台电脑')
  const [busy, setBusy] = useState<'login' | 'signup' | null>(null)

  useEffect(() => {
    void window.flowbridge?.getDeviceInfo().then((info) => setDeviceName(info.hostname)).catch(() => undefined)
  }, [])

  const handleAuth = async (mode: 'login' | 'signup') => {
    if (!/^\S+@\S+\.\S+$/.test(email)) return notify('请输入有效邮箱', 'error')
    if (password.length < 8) return notify('密码至少需要 8 位', 'error')
    setBusy(mode)
    try {
      const session = mode === 'login'
        ? await signInWithPassword(email, password)
        : await signUpWithPassword(email, password)
      if (!session) return notify('验证邮件已发送。请先在邮箱中确认，再回来点击登录', 'warning')
      complete(email, deviceName)
      notify(mode === 'login' ? '登录成功，正在连接设备' : '账号已创建，正在连接设备')
    } catch (error) {
      notify(error instanceof Error ? error.message : '登录失败', 'error')
    } finally { setBusy(null) }
  }

  return (
    <div className="onboarding">
      <section className="welcome-visual">
        <div className="brand brand-large"><BrandMark /><span>FlowBridge</span></div>
        <div className="welcome-copy">
          <span className="eyebrow"><Sparkles size={15} /> AI 跨设备工作流助手</span>
          <h1>让多台电脑，<br /><em>像一台一样工作。</em></h1>
          <p>Prompt、素材与生成结果自然流动。少一点中转，多一点连续创作。</p>
        </div>
        <div className="device-bridge" aria-hidden="true">
          <div className="bridge-device left"><Monitor /><span>工作电脑</span><i /></div>
          <div className="bridge-line"><span /><span /><span /></div>
          <div className="bridge-device right"><Cpu /><span>AI 工作站</span><i /></div>
        </div>
        <div className="trust-row"><ShieldCheck size={17} /><span>默认手动发送</span><span>·</span><LockKeyhole size={17} /><span>私有传输</span></div>
      </section>
      <section className="onboarding-form-wrap">
        <div className="onboarding-form">
          <div className="mobile-brand"><BrandMark />FlowBridge</div>
          <span className="step-label">开始使用</span>
          <h2>连接你的工作空间</h2>
          <p>同一邮箱登录的设备会出现在彼此的设备列表中。</p>
          <label>邮箱地址<input value={email} onChange={(event) => setEmail(event.target.value)} type="email" placeholder="you@example.com" /></label>
          <label>登录密码<input value={password} onChange={(event) => setPassword(event.target.value)} type="password" minLength={8} placeholder="至少 8 位；两台电脑使用同一密码" /></label>
          <label>这台设备的名称<input value={deviceName} onChange={(event) => setDeviceName(event.target.value)} maxLength={40} /></label>
          <button className="primary-button" onClick={() => void handleAuth('login')} disabled={Boolean(busy) || !isCloudConfigured}>
            {busy === 'login' ? <LoaderCircle className="spin" size={18} /> : <Send size={18} />}
            {isCloudConfigured ? '登录并连接设备' : '云端尚未配置'}
          </button>
          {isCloudConfigured && <button className="secondary-button demo-button" onClick={() => void handleAuth('signup')} disabled={Boolean(busy)}>{busy === 'signup' ? <LoaderCircle className="spin" size={18} /> : <Plus size={18} />}首次使用，创建同步账号</button>}
          <div className="divider"><span>或</span></div>
          <button className="secondary-button demo-button" onClick={() => complete(email, deviceName)}><Zap size={18} />进入可交互演示空间<ArrowRight size={17} /></button>
          <div className="demo-note"><CloudOff size={16} /><span>演示数据仅保存在本机。配置 <code>.env.local</code> 后可连接 Supabase。</span></div>
          <p className="legal">继续即表示你了解：FlowBridge 只读取你主动授权的内容，并可随时暂停同步。</p>
        </div>
      </section>
    </div>
  )
}

function BrandMark() {
  return <span className="brand-mark"><span /><span /></span>
}

const navItems: Array<{ id: Page; label: string; icon: typeof Monitor }> = [
  { id: 'dashboard', label: '工作台', icon: Monitor },
  { id: 'clipboard', label: '剪贴板', icon: Clipboard },
  { id: 'files', label: '文件传输', icon: FolderClock },
  { id: 'prompts', label: 'Prompt Library', icon: Sparkles },
]

function Sidebar({ page, onNavigate }: { page: Page; onNavigate: (page: Page) => void }) {
  const accountEmail = useFlowStore((state) => state.accountEmail)
  const devices = useFlowStore((state) => state.devices)
  const online = devices.filter((device) => device.status === 'online').length
  return (
    <aside className="sidebar">
      <div className="brand"><BrandMark /><span>FlowBridge</span><small>BETA</small></div>
      <div className="workspace-switch"><span className="workspace-avatar">F</span><div><strong>我的创作空间</strong><span>{online} 台设备在线</span></div><ChevronDown size={16} /></div>
      <nav>
        <span className="nav-label">工作空间</span>
        {navItems.map((item) => <button key={item.id} className={page === item.id ? 'active' : ''} onClick={() => onNavigate(item.id)}><item.icon size={18} />{item.label}{item.id === 'files' && <b>1</b>}</button>)}
        <span className="nav-label nav-label-spaced">管理</span>
        <button className={page === 'devices' ? 'active' : ''} onClick={() => onNavigate('devices')}><Laptop size={18} />设备管理<span className="online-pill">{online}</span></button>
        <button className={page === 'settings' ? 'active' : ''} onClick={() => onNavigate('settings')}><SettingsIcon size={18} />设置</button>
      </nav>
      <div className="sidebar-foot">
        <div className="connection-status"><span className={isCloudConfigured ? 'dot online' : 'dot demo'} />{isCloudConfigured ? '云端已连接' : '本地演示模式'}<span>v0.1</span></div>
        <div className="user-row"><span className="user-avatar">{accountEmail.slice(0, 1).toUpperCase() || 'F'}</span><div><strong>{accountEmail || 'FlowBridge Creator'}</strong><span>个人空间</span></div><MoreHorizontal size={17} /></div>
      </div>
    </aside>
  )
}

function Topbar({ page, onNavigate }: { page: Page; onNavigate: (page: Page) => void }) {
  const settings = useFlowStore((state) => state.settings)
  const updateSettings = useFlowStore((state) => state.updateSettings)
  const [searchOpen, setSearchOpen] = useState(false)
  return (
    <header className="topbar">
      <button className="icon-button menu-button"><Menu size={19} /></button>
      <div><h1>{pageTitles[page].title}</h1><p>{pageTitles[page].subtitle}</p></div>
      <div className="topbar-actions">
        <div className={`global-search ${searchOpen ? 'open' : ''}`}><Search size={17} /><input placeholder="搜索 Prompt、文件或文本" onFocus={() => setSearchOpen(true)} onBlur={() => setSearchOpen(false)} /><kbd>⌘ K</kbd></div>
        <button className="icon-button" aria-label="切换主题" onClick={() => updateSettings({ theme: settings.theme === 'dark' ? 'light' : 'dark' })}>{settings.theme === 'dark' ? <Sun size={19} /> : <Moon size={19} />}</button>
        <button className="icon-button notification-button" aria-label="通知"><Bell size={19} /><i /></button>
        <button className={`sync-toggle ${settings.syncPaused ? 'paused' : ''}`} onClick={() => updateSettings({ syncPaused: !settings.syncPaused })}>{settings.syncPaused ? <><Play size={16} />恢复同步</> : <><Pause size={16} />暂停同步</>}</button>
        <button className="avatar-button" onClick={() => onNavigate('settings')}>FC</button>
      </div>
    </header>
  )
}

function Dashboard({ onNavigate, notify }: { onNavigate: (page: Page) => void; notify: (message: string, tone?: Toast['tone']) => void }) {
  const devices = useFlowStore((state) => state.devices)
  const activities = useFlowStore((state) => state.activities)
  const transfers = useFlowStore((state) => state.transfers)
  const prompts = useFlowStore((state) => state.prompts)
  const current = devices.find((device) => device.isCurrent)!
  const onlineTargets = devices.filter((device) => !device.isCurrent && device.status === 'online')
  return (
    <div className="content dashboard-page">
      <section className="hero-card">
        <div className="hero-glow" />
        <div className="hero-copy"><span className="eyebrow"><span className="live-dot" />桥接正常</span><h2>早上好，创作者。</h2><p>{onlineTargets.length ? `${onlineTargets.length} 台设备正等你继续工作。` : '在另一台电脑登录后，即可开始跨设备同步。'}</p></div>
        <div className="hero-route"><DeviceOrb device={current} /><div className="flow-line"><span className="flow-packet"><Send size={12} /></span></div>{onlineTargets[0] ? <DeviceOrb device={onlineTargets[0]} /> : <button className="add-device-orb" onClick={() => onNavigate('devices')}><Plus /><span>添加设备</span></button>}</div>
        <div className="hero-stat"><strong>18</strong><span>今日已桥接</span></div>
      </section>
      <section className="section-block">
        <div className="section-title"><div><h3>你的设备</h3><p>选择目标设备，内容会安全地送到那里</p></div><button className="text-button" onClick={() => onNavigate('devices')}>管理设备<ArrowRight size={15} /></button></div>
        <div className="device-grid">{devices.map((device) => <DeviceCard key={device.id} device={device} notify={notify} />)}<button className="device-card add-card" onClick={() => onNavigate('devices')}><span><Plus /></span><strong>连接新设备</strong><small>在另一台电脑登录同一账号</small></button></div>
      </section>
      <QuickSend notify={notify} onOpenFiles={() => onNavigate('files')} />
      <div className="dashboard-columns">
        <section className="panel recent-panel">
          <div className="panel-title"><div><h3>最近活动</h3><p>你的工作流，一目了然</p></div><button className="icon-button"><MoreHorizontal size={18} /></button></div>
          <div className="activity-list">{activities.slice(0, 5).map((activity) => <ActivityRow key={activity.id} activity={activity} />)}</div>
          <button className="panel-footer-button" onClick={() => onNavigate('clipboard')}>查看全部活动<ArrowRight size={15} /></button>
        </section>
        <section className="panel continuity-panel">
          <div className="panel-title"><div><h3>继续工作</h3><p>从最近的上下文接着开始</p></div><Sparkles size={19} /></div>
          <div className="continuity-card"><div className="continuity-icon"><FileText /></div><div><span>最近 Prompt</span><strong>{prompts[0]?.title ?? '还没有 Prompt'}</strong><p>{prompts[0]?.content.slice(0, 62)}…</p></div><button onClick={() => onNavigate('prompts')}><ArrowRight /></button></div>
          <div className="mini-stats"><div><strong>{prompts.filter((prompt) => !prompt.deletedAt).length}</strong><span>Prompt</span></div><div><strong>{transfers.length}</strong><span>传输</span></div><div><strong>2</strong><span>设备</span></div></div>
        </section>
      </div>
    </div>
  )
}

function DeviceOrb({ device }: { device: Device }) {
  return <div className="device-orb"><span className="orb-icon">{device.isCurrent ? <Laptop /> : <Monitor />}</span><strong>{device.name}</strong><small>{device.isCurrent ? '当前设备' : '在线'}</small></div>
}

function DeviceCard({ device, notify }: { device: Device; notify: (message: string, tone?: Toast['tone']) => void }) {
  const selectTarget = useFlowStore((state) => state.selectTarget)
  const selected = useFlowStore((state) => state.selectedTargetId === device.id)
  return (
    <button className={`device-card ${device.isCurrent ? 'current' : ''} ${selected ? 'selected' : ''}`} onClick={() => { if (!device.isCurrent) { selectTarget(device.id); notify(`目标设备已切换为 ${device.name}`) } }}>
      <div className="device-card-top"><span className="device-icon">{device.isCurrent ? <Laptop size={22} /> : <Monitor size={22} />}</span><span className={`status-badge ${device.status}`}>{device.status === 'online' ? <Wifi size={12} /> : <WifiOff size={12} />}{device.isCurrent ? '当前设备' : device.status === 'online' ? '在线' : '离线'}</span><MoreHorizontal size={17} /></div>
      <strong>{device.name}</strong><small>Windows 11 · {device.isCurrent ? '正在使用' : relativeTime(device.lastSeenAt)}</small>
      {!device.isCurrent && <div className="device-actions"><span><Send size={14} />发送内容</span>{selected && <CheckCircle2 size={16} />}</div>}
    </button>
  )
}

function QuickSend({ notify, onOpenFiles }: { notify: (message: string, tone?: Toast['tone']) => void; onOpenFiles: () => void }) {
  const devices = useFlowStore((state) => state.devices)
  const selectedTargetId = useFlowStore((state) => state.selectedTargetId)
  const selectTarget = useFlowStore((state) => state.selectTarget)
  const sendText = useFlowStore((state) => state.sendText)
  const recordCloudClipboard = useFlowStore((state) => state.recordCloudClipboard)
  const savePrompt = useFlowStore((state) => state.savePrompt)
  const createTransfers = useFlowStore((state) => state.createTransfers)
  const [text, setText] = useState('')
  const [sendingText, setSendingText] = useState(false)
  const [isDragging, setDragging] = useState(false)
  const target = devices.find((device) => device.id === selectedTargetId)
  const error = text ? validateText(text) : null
  const sensitive = text ? isSensitiveContent(text) : false

  const send = async () => {
    const validation = validateText(text)
    if (validation) return notify(validation, 'error')
    if (sensitive && !window.confirm('内容可能包含验证码、密码或密钥。仍要发送吗？')) return
    if (!target) return notify('请选择目标设备', 'warning')
    if (isCloudConfigured) {
      const currentDevice = devices.find((device) => device.isCurrent)
      if (!currentDevice) return notify('当前设备尚未完成注册', 'error')
      setSendingText(true)
      try {
        const item = await sendCloudClipboard({ sourceDeviceId: currentDevice.id, targetDeviceId: target.id, content: text })
        recordCloudClipboard(item, false)
        notify(`${item.contentType === 'prompt' ? 'Prompt' : '文本'}已发送至 ${target.name}`)
        setText('')
      } catch (error) {
        notify(error instanceof Error ? error.message : '发送失败', 'error')
      } finally { setSendingText(false) }
      return
    }
    const result = sendText(text)
    if (!result.ok) return notify(result.message, 'warning')
    notify(`${result.item.contentType === 'prompt' ? 'Prompt' : '文本'}已发送至 ${target.name}`)
    setText('')
  }

  const addFiles = (files: Array<{ name: string; size: number; type?: string; path?: string }>) => {
    const validation = validateFiles(files)
    if (validation) return notify(validation, 'error')
    if (isCloudConfigured) return notify('联网版当前先支持真实文本互传；文件上传将在下一阶段接入', 'warning')
    const created = createTransfers(files)
    if (!created.length) return notify('同步已暂停或目标设备无效', 'warning')
    notify(`${created.length} 个文件已开始传输`)
    onOpenFiles()
  }

  const pickFiles = async () => {
    if (window.flowbridge) addFiles(await window.flowbridge.pickFiles())
    else document.getElementById('quick-file-input')?.click()
  }

  const drop = (event: DragEvent) => {
    event.preventDefault(); setDragging(false)
    addFiles(Array.from(event.dataTransfer.files))
  }

  return (
    <section className="section-block quick-section">
      <div className="section-title"><div><h3>快速发送</h3><p>把正在做的事，自然地带到另一台电脑</p></div><div className="target-select"><span>发送至</span><select value={selectedTargetId} onChange={(event) => selectTarget(event.target.value)}>{devices.filter((device) => !device.isCurrent).map((device) => <option key={device.id} value={device.id}>{device.name}{device.status === 'offline' ? '（离线）' : ''}</option>)}</select></div></div>
      <div className="quick-grid">
        <div className="composer-card">
          <div className="composer-head"><span><Clipboard size={17} />发送文本</span><span>{formatBytes(byteLength(text))} / 1 MB</span></div>
          <textarea value={text} onChange={(event) => setText(event.target.value)} placeholder="粘贴 Prompt、链接或任何要继续使用的文本…" />
          {sensitive && <div className="inline-warning"><AlertTriangle size={15} />可能包含敏感内容，发送前请确认。</div>}
          <div className="composer-actions"><div><button className="icon-button" onClick={async () => setText(window.flowbridge ? await window.flowbridge.readClipboard() : await navigator.clipboard.readText())} title="从剪贴板粘贴"><Clipboard size={17} /></button>{classifyContent(text) === 'prompt' && text && <span className="prompt-detected"><Sparkles size={13} />识别为 Prompt</span>}</div><div><button className="secondary-button compact" disabled={!text || Boolean(error) || sendingText} onClick={() => { savePrompt(text); notify('已保存到 Prompt Library') }}><Star size={15} />保存</button><button className="primary-button compact" disabled={!text || Boolean(error) || sendingText} onClick={() => void send()}>{sendingText ? <LoaderCircle className="spin" size={15} /> : <Send size={15} />}{sendingText ? '发送中' : '发送'}</button></div></div>
        </div>
        <div className={`drop-card ${isDragging ? 'dragging' : ''}`} onDragOver={(event) => { event.preventDefault(); setDragging(true) }} onDragLeave={() => setDragging(false)} onDrop={drop} onClick={pickFiles} role="button" tabIndex={0}>
          <input id="quick-file-input" hidden type="file" multiple onChange={(event) => addFiles(Array.from(event.target.files ?? []))} />
          <span className="drop-icon"><UploadCloud /></span><strong>拖拽文件到这里</strong><p>或点击选择文件</p><small>单文件最大 500MB · 最多 20 个</small>
        </div>
      </div>
    </section>
  )
}

function ActivityRow({ activity }: { activity: Activity }) {
  const icon = activity.type === 'clipboard' ? <Clipboard /> : activity.type === 'file' ? <File /> : activity.type === 'prompt' ? <Sparkles /> : <Laptop />
  return <div className="activity-row"><span className={`activity-icon ${activity.type}`}>{icon}</span><div><strong>{activity.title}</strong><span>{activity.detail}</span></div><span className={`activity-status ${activity.status}`}>{activity.status === 'success' ? '已完成' : activity.status === 'failed' ? '失败' : activity.status === 'pending' ? '进行中' : '动态'}</span><time>{relativeTime(activity.createdAt)}</time></div>
}

function ClipboardPage({ notify }: { notify: (message: string, tone?: Toast['tone']) => void }) {
  const items = useFlowStore((state) => state.clipboardItems)
  const devices = useFlowStore((state) => state.devices)
  const toggleFavorite = useFlowStore((state) => state.toggleClipboardFavorite)
  const deleteItem = useFlowStore((state) => state.deleteClipboard)
  const savePrompt = useFlowStore((state) => state.savePrompt)
  const clear = useFlowStore((state) => state.clearClipboard)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<'all' | 'text' | 'prompt' | 'url'>('all')
  const filtered = items.filter((item) => (filter === 'all' || item.contentType === filter) && item.content.toLowerCase().includes(query.toLowerCase()))
  const deviceName = (id: string) => devices.find((device) => device.id === id)?.name ?? '未知设备'
  const copy = async (content: string) => { if (window.flowbridge) await window.flowbridge.writeClipboard(content); else await navigator.clipboard.writeText(content); notify('已复制到系统剪贴板') }
  return (
    <div className="content page-content">
      <div className="toolbar"><div className="filter-search"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索剪贴板内容" /></div><div className="segmented">{(['all', 'text', 'prompt', 'url'] as const).map((value) => <button key={value} className={filter === value ? 'active' : ''} onClick={() => setFilter(value)}>{value === 'all' ? '全部' : value === 'text' ? '文本' : value === 'prompt' ? 'Prompt' : '链接'}</button>)}</div><button className="danger-ghost" onClick={() => { if (window.confirm('清空未收藏的剪贴板历史？已收藏内容会保留。')) { clear(); notify('历史已清理') } }}><Trash2 size={16} />清空</button></div>
      <div className="list-summary"><span>共 {filtered.length} 条记录</span><span><LockKeyhole size={14} />列表只显示摘要，完整内容按需查看</span></div>
      <div className="clipboard-list">{filtered.map((item) => <article key={item.id} className="clipboard-item"><div className={`type-icon ${item.contentType}`}>{item.contentType === 'url' ? <Link2 /> : item.contentType === 'prompt' ? <Sparkles /> : <Clipboard />}</div><div className="clipboard-body"><div className="item-meta"><span className={`type-label ${item.contentType}`}>{item.contentType === 'prompt' ? 'PROMPT' : item.contentType === 'url' ? 'URL' : '文本'}</span><span>{deviceName(item.sourceDeviceId)} → {deviceName(item.targetDeviceId)}</span><time>{relativeTime(item.createdAt)}</time></div><p>{item.content}</p></div><div className="row-actions"><button className={item.isFavorite ? 'favorite active' : 'favorite'} onClick={() => toggleFavorite(item.id)}><Heart size={17} fill={item.isFavorite ? 'currentColor' : 'none'} /></button>{item.contentType !== 'prompt' && <button onClick={() => { savePrompt(item.content); notify('已保存为 Prompt') }} title="保存为 Prompt"><Sparkles size={17} /></button>}<button onClick={() => void copy(item.content)} title="复制"><Copy size={17} /></button><button onClick={() => deleteItem(item.id)} title="删除"><Trash2 size={17} /></button></div></article>)}</div>
      {!filtered.length && <EmptyState icon={<Clipboard />} title="没有匹配的内容" text="发送或接收的文本会出现在这里。" />}
    </div>
  )
}

function TransfersPage({ notify }: { notify: (message: string, tone?: Toast['tone']) => void }) {
  const transfers = useFlowStore((state) => state.transfers)
  const devices = useFlowStore((state) => state.devices)
  const createTransfers = useFlowStore((state) => state.createTransfers)
  const retry = useFlowStore((state) => state.retryTransfer)
  const cancel = useFlowStore((state) => state.cancelTransfer)
  const clear = useFlowStore((state) => state.clearTransfers)
  const [dragging, setDragging] = useState(false)
  const [filter, setFilter] = useState<'all' | 'active' | 'completed' | 'failed'>('all')
  const filtered = transfers.filter((transfer) => filter === 'all' || (filter === 'active' ? ['queued', 'uploading', 'waiting'].includes(transfer.status) : transfer.status === filter))
  const addFiles = (files: Array<{ name: string; size: number; type?: string; path?: string }>) => {
    const error = validateFiles(files)
    if (error) return notify(error, 'error')
    const created = createTransfers(files)
    if (created.length) notify(`${created.length} 个文件已加入队列`)
    else notify('请选择有效目标设备并恢复同步', 'warning')
  }
  const targetName = (id: string) => devices.find((device) => device.id === id)?.name ?? '未知设备'
  return (
    <div className="content page-content">
      <div className={`wide-drop-zone ${dragging ? 'dragging' : ''}`} onDragOver={(event) => { event.preventDefault(); setDragging(true) }} onDragLeave={() => setDragging(false)} onDrop={(event) => { event.preventDefault(); setDragging(false); addFiles(Array.from(event.dataTransfer.files)) }} onClick={() => document.getElementById('transfer-file-input')?.click()}><input id="transfer-file-input" hidden multiple type="file" onChange={(event) => addFiles(Array.from(event.target.files ?? []))} /><span><UploadCloud /></span><div><strong>把文件拖到这里，发送到当前目标设备</strong><p>图片、视频、PDF、Office 与设计文件 · 500MB 以内</p></div><button className="secondary-button compact">选择文件</button></div>
      <div className="toolbar"><div className="segmented">{(['all', 'active', 'completed', 'failed'] as const).map((value) => <button key={value} className={filter === value ? 'active' : ''} onClick={() => setFilter(value)}>{value === 'all' ? '全部' : value === 'active' ? '进行中' : value === 'completed' ? '已完成' : '失败'}</button>)}</div><button className="danger-ghost" onClick={() => { if (window.confirm('清空全部传输记录？这不会删除本地文件。')) clear() }}><Trash2 size={16} />清空记录</button></div>
      <div className="transfer-table"><div className="table-head"><span>文件</span><span>目标设备</span><span>状态</span><span>大小 / 有效期</span><span /></div>{filtered.map((transfer) => <TransferRow key={transfer.id} transfer={transfer} targetName={targetName(transfer.targetDeviceId)} retry={() => retry(transfer.id)} cancel={() => cancel(transfer.id)} notify={notify} />)}</div>
      {!filtered.length && <EmptyState icon={<FolderClock />} title="这里还没有传输" text="拖入文件，第一条传输会立即出现在这里。" />}
    </div>
  )
}

function TransferRow({ transfer, targetName, retry, cancel, notify }: { transfer: Transfer; targetName: string; retry: () => void; cancel: () => void; notify: (message: string, tone?: Toast['tone']) => void }) {
  const active = ['queued', 'uploading', 'waiting'].includes(transfer.status)
  const statusLabel: Record<Transfer['status'], string> = { queued: '等待上传', uploading: '上传中', waiting: '等待接收', completed: '已完成', failed: '失败', cancelled: '已取消', expired: '已过期' }
  return <div className="transfer-row"><div className="file-cell"><span className="file-type-icon"><FileText /></span><div><strong>{transfer.fileName}</strong><span>{transfer.mimeType}</span>{active && <div className="progress"><i style={{ width: `${transfer.progress}%` }} /></div>}</div></div><div className="target-cell"><Monitor size={16} />{targetName}</div><div><span className={`transfer-badge ${transfer.status}`}>{active && <LoaderCircle className="spin" size={13} />}{transfer.status === 'completed' && <Check size={13} />}{statusLabel[transfer.status]}</span>{active && <small className="progress-text">{transfer.progress}%</small>}</div><div className="size-cell"><strong>{formatBytes(transfer.fileSize)}</strong><span>{transfer.status === 'completed' ? `剩余 ${Math.max(0, Math.ceil((new Date(transfer.expiresAt).getTime() - Date.now()) / 86_400_000))} 天` : relativeTime(transfer.createdAt)}</span></div><div className="row-actions">{transfer.status === 'failed' && <button onClick={retry} title="重试"><RefreshCcw size={17} /></button>}{active && <button onClick={cancel} title="取消"><X size={17} /></button>}{transfer.status === 'completed' && <button onClick={() => notify(`校验值：${transfer.checksum}`)} title="查看校验"><ShieldCheck size={17} /></button>}<button><MoreHorizontal size={17} /></button></div></div>
}

function PromptsPage({ notify }: { notify: (message: string, tone?: Toast['tone']) => void }) {
  const prompts = useFlowStore((state) => state.prompts)
  const savePrompt = useFlowStore((state) => state.savePrompt)
  const toggleFavorite = useFlowStore((state) => state.togglePromptFavorite)
  const deletePrompt = useFlowStore((state) => state.deletePrompt)
  const restorePrompt = useFlowStore((state) => state.restorePrompt)
  const [query, setQuery] = useState('')
  const [favoritesOnly, setFavoritesOnly] = useState(false)
  const [showTrash, setShowTrash] = useState(false)
  const [editorOpen, setEditorOpen] = useState(false)
  const [draft, setDraft] = useState('')
  const filtered = prompts.filter((prompt) => Boolean(prompt.deletedAt) === showTrash && (!favoritesOnly || prompt.isFavorite) && `${prompt.title} ${prompt.content} ${prompt.tags.join(' ')}`.toLowerCase().includes(query.toLowerCase()))
  return (
    <div className="content page-content">
      <div className="library-hero"><div><span className="eyebrow"><Sparkles size={14} />PROMPT LIBRARY</span><h2>让好 Prompt 被再次找到。</h2><p>搜索、收藏、创建版本。跨设备发送过的灵感，不再消失在聊天记录里。</p></div><button className="primary-button compact" onClick={() => setEditorOpen(true)}><Plus size={16} />新建 Prompt</button></div>
      {editorOpen && <div className="inline-editor"><div><strong>新建 Prompt</strong><button className="icon-button" onClick={() => setEditorOpen(false)}><X size={17} /></button></div><textarea autoFocus value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="输入完整 Prompt…" /><button className="primary-button compact" disabled={!draft.trim()} onClick={() => { savePrompt(draft); setDraft(''); setEditorOpen(false); notify('Prompt 已保存') }}>保存到 Library</button></div>}
      <div className="toolbar"><div className="filter-search"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索标题、正文或标签" /></div><button className={`filter-button ${favoritesOnly ? 'active' : ''}`} onClick={() => setFavoritesOnly(!favoritesOnly)}><Heart size={16} />只看收藏</button><button className={`filter-button ${showTrash ? 'active' : ''}`} onClick={() => setShowTrash(!showTrash)}><Trash2 size={16} />回收站</button></div>
      <div className="prompt-grid">{filtered.map((prompt) => <PromptCard key={prompt.id} prompt={prompt} notify={notify} toggleFavorite={() => toggleFavorite(prompt.id)} deletePrompt={() => deletePrompt(prompt.id)} restore={() => restorePrompt(prompt.id)} createVersion={() => { savePrompt(prompt.content, `${prompt.title} · 新版本`, prompt.id); notify('已创建独立新版本') }} />)}</div>
      {!filtered.length && <EmptyState icon={<Sparkles />} title={showTrash ? '回收站是空的' : '没有匹配的 Prompt'} text="新建一条，或从剪贴板历史保存为 Prompt。" />}
    </div>
  )
}

function PromptCard({ prompt, notify, toggleFavorite, deletePrompt, restore, createVersion }: { prompt: Prompt; notify: (message: string, tone?: Toast['tone']) => void; toggleFavorite: () => void; deletePrompt: () => void; restore: () => void; createVersion: () => void }) {
  const copy = async () => { if (window.flowbridge) await window.flowbridge.writeClipboard(prompt.content); else await navigator.clipboard.writeText(prompt.content); notify('Prompt 已复制') }
  return <article className="prompt-card"><div className="prompt-card-top"><span className="spark-badge"><Sparkles size={15} /></span><button className={prompt.isFavorite ? 'favorite active' : 'favorite'} onClick={toggleFavorite}><Heart size={17} fill={prompt.isFavorite ? 'currentColor' : 'none'} /></button></div><h3>{prompt.title}</h3><p>{prompt.content}</p><div className="tag-row">{prompt.tags.map((tag) => <span key={tag}>#{tag}</span>)}{prompt.modelName && <span>{prompt.modelName}</span>}</div><div className="prompt-meta"><span>{relativeTime(prompt.updatedAt)}</span>{prompt.parentPromptId && <span><History size={13} />派生版本</span>}</div><div className="prompt-actions">{prompt.deletedAt ? <button onClick={restore}><ArchiveRestore size={16} />恢复</button> : <><button onClick={() => void copy()}><Copy size={16} />复制</button><button onClick={createVersion}><History size={16} />新版本</button><button className="danger" onClick={deletePrompt}><Trash2 size={16} /></button></>}</div></article>
}

function DevicesPage({ notify }: { notify: (message: string, tone?: Toast['tone']) => void }) {
  const devices = useFlowStore((state) => state.devices)
  const rename = useFlowStore((state) => state.renameDevice)
  const remove = useFlowStore((state) => state.removeDevice)
  return <div className="content page-content"><div className="security-banner"><span><ShieldCheck /></span><div><strong>你的可信设备</strong><p>只有同一账号下且未被撤销的设备可以收发内容。移除后访问会立即失效。</p></div><span className="security-score"><Check size={15} />安全状态良好</span></div><div className="device-management-grid">{devices.map((device) => <article key={device.id} className="managed-device"><div className="managed-visual"><span>{device.isCurrent ? <Laptop /> : <Monitor />}</span><i className={device.status} /></div><div><span className={`status-badge ${device.status}`}>{device.isCurrent ? '当前设备' : device.status === 'online' ? '在线' : '离线'}</span><h3>{device.name}</h3><p>Windows 11 · {device.isCurrent ? '本机安全存储' : `最后在线 ${relativeTime(device.lastSeenAt)}`}</p><small>设备 ID · {device.id.slice(-8)}</small></div><div className="managed-actions"><button onClick={() => { const name = window.prompt('新的设备名称', device.name); if (name) { rename(device.id, name); notify('设备名称已更新') } }}>重命名</button>{!device.isCurrent && <button className="danger" onClick={() => { if (window.confirm(`移除 ${device.name}？该设备将无法继续收发内容。`)) { remove(device.id); notify('设备已移除') } }}>移除</button>}</div></article>)}<button className="managed-device connect-device"><span><Plus /></span><h3>连接另一台电脑</h3><p>安装 FlowBridge，并使用同一邮箱登录。</p><button className="secondary-button compact" onClick={() => notify('安装包会在 release 目录生成', 'warning')}>查看安装方式</button></button></div><div className="device-limit"><span>{devices.length} / 5 台设备</span><div><i style={{ width: `${devices.length / 5 * 100}%` }} /></div><small>MVP 默认最多绑定 5 台可信设备</small></div></div>
}

function SettingsPage({ notify }: { notify: (message: string, tone?: Toast['tone']) => void }) {
  const settings = useFlowStore((state) => state.settings)
  const update = useFlowStore((state) => state.updateSettings)
  const clearClipboard = useFlowStore((state) => state.clearClipboard)
  const clearTransfers = useFlowStore((state) => state.clearTransfers)
  const resetDemo = useFlowStore((state) => state.resetDemo)
  return <div className="content settings-layout"><aside className="settings-nav"><button className="active"><Zap />同步</button><button><Download />文件</button><button><Bell />通知</button><button><Palette />外观</button><button><ShieldCheck />安全与隐私</button></aside><div className="settings-main"><SettingsGroup icon={<Zap />} title="同步设置" text="决定什么内容可以离开这台电脑。"><SettingToggle title="剪贴板监听" text="只读取纯文本变化；关闭时不会读取任何新内容。" checked={settings.clipboardListening} onChange={(value) => update({ clipboardListening: value })} /><SettingToggle title="自动同步" text="默认关闭。开启后，新复制的文本自动发送至默认设备。" checked={settings.autoSync} onChange={(value) => { if (value && !window.confirm('自动同步可能发送密码、验证码或公司敏感信息。确认开启？')) return; update({ autoSync: value, clipboardListening: value || settings.clipboardListening }) }} /><SettingToggle title="接收后自动写入系统剪贴板" text="默认只进入 FlowBridge 历史，由你手动复制。" checked={settings.autoWriteClipboard} onChange={(value) => update({ autoWriteClipboard: value })} /></SettingsGroup><SettingsGroup icon={<Bell />} title="通知" text="通知默认不展示完整正文。"><SettingToggle title="文本通知" text="收到新文本时提醒。" checked={settings.textNotifications} onChange={(value) => update({ textNotifications: value })} /><SettingToggle title="文件通知" text="传输完成或失败时提醒。" checked={settings.fileNotifications} onChange={(value) => update({ fileNotifications: value })} /><SettingToggle title="通知内容预览" text="可能在锁屏上暴露文本摘要，不建议开启。" checked={settings.previewNotifications} onChange={(value) => update({ previewNotifications: value })} /></SettingsGroup><SettingsGroup icon={<Palette />} title="外观" text="保持清晰、克制，也尊重系统偏好。"><div className="theme-picker">{(['system', 'light', 'dark'] as const).map((theme) => <button key={theme} className={settings.theme === theme ? 'active' : ''} onClick={() => update({ theme })}>{theme === 'system' ? <Monitor /> : theme === 'light' ? <Sun /> : <Moon />}<span>{theme === 'system' ? '跟随系统' : theme === 'light' ? '浅色' : '深色'}</span>{settings.theme === theme && <Check />}</button>)}</div><SettingToggle title="减少动态效果" text="关闭流动、呼吸与页面过渡动画。" checked={settings.reduceMotion} onChange={(value) => update({ reduceMotion: value })} /></SettingsGroup><SettingsGroup icon={<ShieldCheck />} title="数据与隐私" text="清理操作不会影响已收藏的 Prompt。"><div className="danger-actions"><button onClick={() => { if (window.confirm('清空未收藏的剪贴板历史？')) { clearClipboard(); notify('剪贴板历史已清理') } }}><Trash2 />清空剪贴板历史</button><button onClick={() => { if (window.confirm('清空全部传输记录？')) { clearTransfers(); notify('传输记录已清理') } }}><Trash2 />清空传输记录</button><button onClick={() => { if (window.confirm('退出登录并清除这台电脑上的本地状态？')) { void signOutCloud().finally(resetDemo) } }}><LogOut />退出登录</button></div></SettingsGroup></div></div>
}

function SettingsGroup({ icon, title, text, children }: { icon: ReactNode; title: string; text: string; children: ReactNode }) {
  return <section className="settings-group"><div className="settings-group-head"><span>{icon}</span><div><h3>{title}</h3><p>{text}</p></div></div><div className="settings-options">{children}</div></section>
}

function SettingToggle({ title, text, checked, onChange }: { title: string; text: string; checked: boolean; onChange: (value: boolean) => void }) {
  return <label className="setting-row"><div><strong>{title}</strong><span>{text}</span></div><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} /><i /></label>
}

function EmptyState({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return <div className="empty-state"><span>{icon}</span><h3>{title}</h3><p>{text}</p></div>
}
