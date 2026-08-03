import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'
import {
  Activity, AlertCircle, Archive, Bell, Check, ChevronDown, Clipboard, Cloud, Copy, Download,
  File, FileArchive, FileText, FolderOpen, Gauge, HardDrive, Heart, Home, Image, Laptop,
  LayoutDashboard, LogOut, Menu, Monitor, MoreHorizontal, Palette, Pause, Play, Plus, RefreshCw,
  Save, Search, Send, Settings as SettingsIcon, Shield, SlidersHorizontal, Sparkles, Trash2,
  Upload, User, Users, Video, X,
} from 'lucide-react'
import { formatBytes, relativeTime, validateFiles, validateText } from './lib/domain'
import {
  adminRevokeDevices, adminSetAccountStatus, adminSetStorageQuota, adminSetUserRole,
  createFileDownload, deleteCloudStorageItem, getCloudSession, isCloudConfigured, loadAccountSnapshot,
  loadAdminData, markTransferCompleted, saveCloudStorageItem, sendCloudClipboard, signInWithPassword,
  signOutCloud, signUpWithPassword, startWorkspaceSync, updateCloudPreferences, updateCloudProfile,
  uploadCloudFile,
} from './services/supabase'
import { useFlowStore } from './store/useFlowStore'
import type { AdminUserSummary, Device, Settings, StorageCategory, Transfer, UserRole } from './types'

type Page = 'home' | 'clipboard' | 'files' | 'prompts' | 'storage' | 'devices' | 'profile' | 'settings' | 'admin'

const pageMeta: Record<Page, { title: string; subtitle: string }> = {
  home: { title: '首页', subtitle: '今天的跨设备工作，从这里继续' },
  clipboard: { title: '剪贴板', subtitle: '跨设备发送、查找并保留重要内容' },
  files: { title: '文件传输', subtitle: '可恢复上传、进度追踪与完整性校验' },
  prompts: { title: 'Prompt Library', subtitle: '整理灵感、版本与常用提示词' },
  storage: { title: '云端存储', subtitle: '查看空间用量与文件保留策略' },
  devices: { title: '设备', subtitle: '管理已登录的电脑与默认接收端' },
  profile: { title: '个人主页', subtitle: '你的账号资料与使用概览' },
  settings: { title: '设置', subtitle: '按你的习惯调整界面、同步与通知' },
  admin: { title: '管理后台', subtitle: '用户、配额、权限与审计记录' },
}

const coreNav: Array<{ id: Page; label: string; icon: typeof Home }> = [
  { id: 'home', label: '首页', icon: Home },
  { id: 'clipboard', label: '剪贴板', icon: Clipboard },
  { id: 'files', label: '文件传输', icon: FolderOpen },
  { id: 'prompts', label: 'Prompt Library', icon: Sparkles },
  { id: 'storage', label: '云端存储', icon: HardDrive },
  { id: 'devices', label: '设备', icon: Laptop },
]

const formatDate = (value: string) => new Intl.DateTimeFormat('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value))
const initials = (value: string) => (value.trim().slice(0, 2) || 'FB').toUpperCase()

function Brand() {
  return <div className="brand"><span className="brand-mark"><span /></span><strong>FlowBridge</strong><span className="version-chip">v0.3.2</span></div>
}

function EmptyState({ icon, title, detail, action }: { icon: ReactNode; title: string; detail: string; action?: ReactNode }) {
  return <div className="empty-state"><div className="empty-icon">{icon}</div><h3>{title}</h3><p>{detail}</p>{action}</div>
}

function StatusDot({ online }: { online: boolean }) {
  return <span className={`status-dot ${online ? 'online' : ''}`} aria-label={online ? '在线' : '离线'} />
}

function DevicePicker({ devices, value, onChange }: { devices: Device[]; value: string; onChange: (id: string) => void }) {
  const peers = devices.filter((device) => !device.isCurrent)
  return <label className="device-picker"><Monitor size={18} /><select value={value} onChange={(event) => onChange(event.target.value)} aria-label="目标设备"><option value="">选择目标设备</option>{peers.map((device) => <option key={device.id} value={device.id}>{device.name} · {device.status === 'online' ? '在线' : '离线'}</option>)}</select><ChevronDown size={16} /></label>
}

function AuthScreen({ onDone }: { onDone: (email: string, deviceName: string) => void }) {
  const [mode, setMode] = useState<'sign-in' | 'sign-up'>('sign-in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [deviceName, setDeviceName] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => { void window.flowbridge?.getDeviceInfo().then((info) => setDeviceName(info.hostname)) }, [])
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true); setMessage('')
    try {
      const session = mode === 'sign-in' ? await signInWithPassword(email.trim(), password) : await signUpWithPassword(email.trim(), password)
      if (!session) setMessage('验证邮件已发送。确认邮箱后回到这里登录即可。')
      else onDone(email.trim(), deviceName.trim() || '这台电脑')
    } catch (error) { setMessage(error instanceof Error ? error.message : '操作失败，请稍后重试') }
    finally { setBusy(false) }
  }
  return <main className="auth-shell">
    <section className="auth-intro"><Brand /><div><span className="eyebrow">FLOW WITHOUT FRICTION</span><h1>两台电脑，<br />像一台一样工作。</h1><p>剪贴板、文件与灵感安全地在设备间流动。v0.3 现在拥有真实文件传输、个人空间和更清晰的界面。</p></div><div className="auth-feature"><Cloud size={20} /><span><strong>端到端工作流</strong><small>私有云存储 · SHA-256 校验 · 权限隔离</small></span></div></section>
    <section className="auth-panel"><form className="auth-card" onSubmit={submit}><span className="eyebrow">欢迎使用</span><h2>{mode === 'sign-in' ? '登录 FlowBridge' : '创建你的空间'}</h2><p className="muted">在两台 Windows 电脑上登录同一账号即可同步。</p>
      <label>邮箱<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@example.com" required /></label>
      <label>密码<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={6} placeholder="至少 6 位" required /></label>
      <label>这台设备的名称<input value={deviceName} onChange={(event) => setDeviceName(event.target.value)} placeholder="例如：办公室电脑" maxLength={80} required /></label>
      {message && <div className="inline-message"><AlertCircle size={17} />{message}</div>}
      <button className="primary-button wide" disabled={busy}>{busy ? <RefreshCw className="spin" size={18} /> : mode === 'sign-in' ? '登录' : '注册'}</button>
      <button className="text-button" type="button" onClick={() => { setMode(mode === 'sign-in' ? 'sign-up' : 'sign-in'); setMessage('') }}>{mode === 'sign-in' ? '没有账号？立即注册' : '已有账号？返回登录'}</button>
    </form></section>
  </main>
}

export function App() {
  const store = useFlowStore()
  const [page, setPage] = useState<Page>(() => (localStorage.getItem('flowbridge-last-page') as Page) || 'home')
  const [authReady, setAuthReady] = useState(!isCloudConfigured)
  const [notice, setNotice] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null)
  const [query, setQuery] = useState('')
  const [mobileNav, setMobileNav] = useState(false)
  const currentDevice = store.devices.find((device) => device.isCurrent)
  const currentDeviceId = currentDevice?.id
  const currentDeviceName = currentDevice?.name
  const {
    onboarded, completeOnboarding, setCloudStatus, setProfile, setRole, setQuota, setStorageItems,
    setCloudTransfers, updateSettings, setCloudDevices, setCloudClipboard, recordCloudClipboard,
    upsertTransfer,
  } = store
  const autoWriteClipboard = store.settings.autoWriteClipboard

  const showNotice = useCallback((text: string, type: 'success' | 'error' | 'info' = 'success') => setNotice({ text, type }), [])
  useEffect(() => { if (!notice) return; const timer = window.setTimeout(() => setNotice(null), 4200); return () => window.clearTimeout(timer) }, [notice])
  useEffect(() => {
    if (!isCloudConfigured) return
    void getCloudSession().then((session) => {
      if (session && !onboarded) completeOnboarding(session.user.email ?? '', currentDeviceName ?? '这台电脑')
    }).catch(() => undefined).finally(() => setAuthReady(true))
  }, [completeOnboarding, currentDeviceName, onboarded])
  useEffect(() => {
    const root = document.documentElement
    root.dataset.theme = store.settings.theme
    root.dataset.density = store.settings.density
    root.dataset.accent = store.settings.accent
    root.style.setProperty('--font-scale', String(store.settings.fontScale))
    root.classList.toggle('reduce-motion', store.settings.reduceMotion)
  }, [store.settings.theme, store.settings.density, store.settings.accent, store.settings.fontScale, store.settings.reduceMotion])
  useEffect(() => { if (store.settings.rememberLastPage) localStorage.setItem('flowbridge-last-page', page) }, [page, store.settings.rememberLastPage])

  useEffect(() => {
    if (!onboarded || !isCloudConfigured || !currentDeviceId) return
    let stop: undefined | (() => void)
    let cancelled = false
    setCloudStatus('connecting')
    void (async () => {
      try {
        const snapshot = await loadAccountSnapshot()
        if (cancelled) return
        setProfile(snapshot.profile); setRole(snapshot.role); setQuota(snapshot.quota)
        setStorageItems(snapshot.storageItems); setCloudTransfers(snapshot.transfers)
        updateSettings(snapshot.settings)
      } catch (error) {
        showNotice(`新版云端数据尚未就绪：${error instanceof Error ? error.message : '加载失败'}`, 'error')
      }
      try {
        stop = await startWorkspaceSync({
          deviceName: currentDeviceName ?? '这台电脑',
          onDevices: setCloudDevices,
          onInitialClipboard: setCloudClipboard,
          onIncomingClipboard: (item) => {
            recordCloudClipboard(item, true)
            if (autoWriteClipboard) void window.flowbridge?.writeClipboard(item.content)
          },
          onTransfers: setCloudTransfers,
          onIncomingTransfer: (item) => { upsertTransfer(item); showNotice(`收到文件：${item.fileName}`, 'info') },
          onError: (message) => showNotice(message, 'error'),
        })
        if (!cancelled) setCloudStatus('connected')
      } catch (error) { setCloudStatus('error'); showNotice(error instanceof Error ? error.message : '云端连接失败', 'error') }
    })()
    return () => { cancelled = true; stop?.() }
  }, [autoWriteClipboard, currentDeviceId, currentDeviceName, onboarded, recordCloudClipboard, setCloudClipboard, setCloudDevices, setCloudStatus, setCloudTransfers, setProfile, setQuota, setRole, setStorageItems, showNotice, updateSettings, upsertTransfer])

  if (!authReady) return <div className="boot-screen"><Brand /><RefreshCw className="spin" /></div>
  if (isCloudConfigured && !store.onboarded) return <AuthScreen onDone={store.completeOnboarding} />

  const navigate = (next: Page) => { setPage(next); setMobileNav(false); setQuery('') }
  const displayName = store.profile?.displayName || store.accountEmail.split('@')[0] || 'FlowBridge 用户'
  const nav = coreNav.filter((item) => store.settings.sidebarOrder.includes(item.id)).sort((a, b) => store.settings.sidebarOrder.indexOf(a.id) - store.settings.sidebarOrder.indexOf(b.id))
  return <div className="app-shell">
    <aside className={`sidebar ${mobileNav ? 'open' : ''}`}><div className="sidebar-top"><Brand /><button className="icon-button close-mobile" onClick={() => setMobileNav(false)}><X /></button></div>
      <button className="workspace-switch"><span className="avatar small">{initials(displayName)}</span><span><strong>{store.workspaceName}</strong><small>{store.devices.filter((device) => device.status === 'online').length} 台设备在线</small></span><ChevronDown size={16} /></button>
      <nav aria-label="主导航"><span className="nav-label">工作空间</span>{nav.map((item) => <button key={item.id} className={page === item.id ? 'active' : ''} onClick={() => navigate(item.id)}><item.icon size={20} /><span>{item.label}</span>{item.id === 'files' && store.transfers.filter((transfer) => transfer.targetDeviceId === currentDevice?.id && transfer.status === 'waiting').length > 0 && <b className="count-badge">{store.transfers.filter((transfer) => transfer.targetDeviceId === currentDevice?.id && transfer.status === 'waiting').length}</b>}</button>)}
        <span className="nav-label manage">账户</span><button className={page === 'profile' ? 'active' : ''} onClick={() => navigate('profile')}><User size={20} /><span>个人主页</span></button><button className={page === 'settings' ? 'active' : ''} onClick={() => navigate('settings')}><SettingsIcon size={20} /><span>设置</span></button>{store.role !== 'user' && <button className={page === 'admin' ? 'active' : ''} onClick={() => navigate('admin')}><Shield size={20} /><span>管理后台</span></button>}
      </nav>
      <div className="sidebar-footer"><div className="cloud-state"><StatusDot online={store.cloudStatus === 'connected' || !isCloudConfigured} /><span>{isCloudConfigured ? ({ idle: '等待连接', connecting: '正在连接', connected: '云端已连接', error: '连接异常' }[store.cloudStatus]) : '本地演示模式'}</span></div><button className="profile-row" onClick={() => navigate('profile')}><span className="avatar">{initials(displayName)}</span><span><strong>{displayName}</strong><small>{store.accountEmail || '本地账号'}</small></span><MoreHorizontal size={18} /></button></div>
    </aside>
    {mobileNav && <button className="sidebar-scrim" onClick={() => setMobileNav(false)} aria-label="关闭菜单" />}
    <main className="main-area"><header className="topbar"><button className="icon-button mobile-menu" onClick={() => setMobileNav(true)}><Menu /></button><div className="page-title"><h1>{pageMeta[page].title}</h1><p>{pageMeta[page].subtitle}</p></div><label className="global-search"><Search size={19} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索当前页面" /><kbd>Ctrl K</kbd></label><button className="icon-button"><Bell size={20} /></button><button className={`sync-button ${store.settings.syncPaused ? 'paused' : ''}`} onClick={() => store.updateSettings({ syncPaused: !store.settings.syncPaused })}>{store.settings.syncPaused ? <><Play size={17} />恢复同步</> : <><Pause size={17} />暂停同步</>}</button></header>
      <div className="page-content">
        {page === 'home' && <HomePage query={query} navigate={navigate} showNotice={showNotice} />}
        {page === 'clipboard' && <ClipboardPage query={query} showNotice={showNotice} />}
        {page === 'files' && <FilesPage query={query} showNotice={showNotice} />}
        {page === 'prompts' && <PromptsPage query={query} showNotice={showNotice} />}
        {page === 'storage' && <StoragePage query={query} showNotice={showNotice} />}
        {page === 'devices' && <DevicesPage query={query} showNotice={showNotice} />}
        {page === 'profile' && <ProfilePage showNotice={showNotice} onLogout={async () => { await signOutCloud(); store.resetDemo() }} />}
        {page === 'settings' && <SettingsPage showNotice={showNotice} />}
        {page === 'admin' && store.role !== 'user' && <AdminPage query={query} showNotice={showNotice} />}
      </div>
    </main>
    {notice && <div className={`toast ${notice.type}`}>{notice.type === 'success' ? <Check /> : <AlertCircle />}<span>{notice.text}</span><button onClick={() => setNotice(null)}><X /></button></div>}
  </div>
}

type Notice = (text: string, type?: 'success' | 'error' | 'info') => void

function QuickSend({ showNotice, compact = false }: { showNotice: Notice; compact?: boolean }) {
  const { devices, selectedTargetId, selectTarget, sendText, recordCloudClipboard } = useFlowStore()
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const send = async () => {
    const validation = validateText(text); if (validation) return showNotice(validation, 'error')
    if (isCloudConfigured) {
      const source = devices.find((device) => device.isCurrent)
      if (!source || !selectedTargetId) return showNotice('请选择目标设备', 'error')
      setBusy(true)
      try { const item = await sendCloudClipboard({ sourceDeviceId: source.id, targetDeviceId: selectedTargetId, content: text }); recordCloudClipboard(item, false); setText(''); showNotice('已发送到另一台电脑') }
      catch (error) { showNotice(error instanceof Error ? error.message : '发送失败', 'error') }
      finally { setBusy(false) }
    } else {
      const result = sendText(text); if (!result.ok) return showNotice(result.message, 'error'); setText(''); showNotice('已发送')
    }
  }
  return <div className={`quick-send ${compact ? 'compact' : ''}`}><div className="quick-send-head"><div><span className="card-kicker">快速发送</span><h2>把内容送到另一台电脑</h2></div><DevicePicker devices={devices} value={selectedTargetId} onChange={selectTarget} /></div><textarea value={text} onChange={(event) => setText(event.target.value)} placeholder="输入文本、链接或 Prompt…" onKeyDown={(event) => { if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') void send() }} /><div className="composer-footer"><span>{text.length.toLocaleString()} 字 · Ctrl + Enter 发送</span><button className="primary-button" onClick={() => void send()} disabled={busy}>{busy ? <RefreshCw className="spin" size={17} /> : <Send size={17} />}发送</button></div></div>
}

function HomePage({ navigate, showNotice }: { query: string; navigate: (page: Page) => void; showNotice: Notice }) {
  const { devices, activities, transfers, quota, settings } = useFlowStore()
  const recent = activities.slice(0, 5)
  const percent = Math.min(100, quota.usedBytes / Math.max(quota.quotaBytes, 1) * 100)
  return <div className="home-grid">{settings.homeWidgets.includes('quick-send') && <section className="span-2"><QuickSend showNotice={showNotice} /></section>}
    {settings.homeWidgets.includes('devices') && <section className="panel"><div className="panel-heading"><div><span className="card-kicker">设备</span><h2>连接状态</h2></div><button className="link-button" onClick={() => navigate('devices')}>管理</button></div><div className="device-stack">{devices.slice(0, 4).map((device) => <div className="device-line" key={device.id}><span className="device-icon"><Laptop size={20} /></span><span><strong>{device.name}</strong><small>{device.isCurrent ? '当前设备' : relativeTime(device.lastSeenAt)}</small></span><StatusDot online={device.status === 'online'} /></div>)}</div></section>}
    {settings.homeWidgets.includes('storage') && <section className="panel storage-summary"><div className="panel-heading"><div><span className="card-kicker">云端空间</span><h2>{formatBytes(quota.usedBytes)} / {formatBytes(quota.quotaBytes)}</h2></div><HardDrive /></div><div className="meter"><span style={{ width: `${percent}%` }} /></div><p>还可使用 {formatBytes(Math.max(0, quota.quotaBytes - quota.usedBytes))}</p><button className="secondary-button" onClick={() => navigate('storage')}>查看存储</button></section>}
    {settings.homeWidgets.includes('recent') && <section className="panel span-2"><div className="panel-heading"><div><span className="card-kicker">最近活动</span><h2>继续上次的工作</h2></div><button className="link-button" onClick={() => navigate('clipboard')}>查看全部</button></div>{recent.length ? <div className="activity-list">{recent.map((item) => <div key={item.id}><span className={`activity-icon ${item.status}`}>{item.type === 'file' ? <File size={18} /> : item.type === 'clipboard' ? <Clipboard size={18} /> : <Activity size={18} />}</span><span><strong>{item.title}</strong><small>{item.detail}</small></span><time>{relativeTime(item.createdAt)}</time></div>)}</div> : <EmptyState icon={<Activity />} title="还没有活动" detail="发送一段文字或一个文件后，这里会出现记录。" />}</section>}
    <section className="panel"><div className="panel-heading"><div><span className="card-kicker">传输</span><h2>{transfers.filter((item) => ['queued', 'uploading', 'downloading', 'waiting'].includes(item.status)).length} 个进行中</h2></div><Gauge /></div><p className="muted">大文件支持断点续传，完成后自动进行 SHA-256 校验。</p><button className="secondary-button" onClick={() => navigate('files')}>打开文件传输</button></section>
  </div>
}

function ClipboardPage({ query, showNotice }: { query: string; showNotice: Notice }) {
  const { clipboardItems, devices, toggleClipboardFavorite, deleteClipboard, clearClipboard, savePrompt } = useFlowStore()
  const [filter, setFilter] = useState<'all' | 'text' | 'prompt' | 'url' | 'favorite'>('all')
  const items = clipboardItems.filter((item) => (filter === 'all' || (filter === 'favorite' ? item.isFavorite : item.contentType === filter)) && item.content.toLowerCase().includes(query.toLowerCase()))
  return <div className="stack"><QuickSend showNotice={showNotice} compact /><div className="toolbar"><div className="segmented">{(['all', 'text', 'prompt', 'url', 'favorite'] as const).map((value) => <button className={filter === value ? 'active' : ''} onClick={() => setFilter(value)} key={value}>{({ all: '全部', text: '文本', prompt: 'Prompt', url: '链接', favorite: '收藏' } as const)[value]}</button>)}</div><button className="danger-link" onClick={() => { if (confirm('清除所有未收藏的剪贴板记录？')) clearClipboard() }}><Trash2 size={17} />清理</button></div>
    <div className="content-list">{items.map((item) => { const source = devices.find((device) => device.id === item.sourceDeviceId); return <article className="content-card" key={item.id}><div className={`type-icon ${item.contentType}`}>{item.contentType === 'prompt' ? <Sparkles /> : item.contentType === 'url' ? <Cloud /> : <Clipboard />}</div><div className="content-body"><div className="content-meta"><span className="tag">{item.contentType === 'prompt' ? 'PROMPT' : item.contentType === 'url' ? '链接' : '文本'}</span><span>{source?.name ?? '未知设备'} · {formatDate(item.createdAt)}</span></div><p>{item.content}</p></div><div className="card-actions"><button title="收藏" className={item.isFavorite ? 'selected' : ''} onClick={() => toggleClipboardFavorite(item.id)}><Heart size={19} fill={item.isFavorite ? 'currentColor' : 'none'} /></button><button title="复制" onClick={() => { void navigator.clipboard.writeText(item.content); showNotice('已复制') }}><Copy size={19} /></button>{item.contentType === 'prompt' && <button title="存为 Prompt" onClick={() => { savePrompt(item.content); showNotice('已保存到 Prompt Library') }}><Save size={19} /></button>}<button title="删除" onClick={() => deleteClipboard(item.id)}><Trash2 size={19} /></button></div></article> })}{!items.length && <EmptyState icon={<Clipboard />} title="没有找到内容" detail="换一个筛选条件，或者先发送一段文字。" />}</div></div>
}

function FilesPage({ query, showNotice }: { query: string; showNotice: Notice }) {
  const store = useFlowStore()
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const transfers = store.transfers.filter((item) => item.fileName.toLowerCase().includes(query.toLowerCase()))
  const handleFiles = async (files: File[]) => {
    const problem = validateFiles(files); if (problem) return showNotice(problem, 'error')
    const source = store.devices.find((device) => device.isCurrent)
    if (!source || !store.selectedTargetId) return showNotice('请先选择目标设备', 'error')
    const optimistic = store.createTransfers(files)
    for (const [index, file] of files.entries()) {
      const local = optimistic[index]; if (!local) continue
      if (!isCloudConfigured) { store.updateTransfer(local.id, { status: 'completed', progress: 100, bytesTransferred: file.size, checksum: '本地演示校验' }); continue }
      try {
        store.updateTransfer(local.id, { status: 'uploading', progress: 0 })
        const result = await uploadCloudFile({ file, transferId: local.id, sourceDeviceId: source.id, targetDeviceId: store.selectedTargetId, onHashProgress: (progress) => store.updateTransfer(local.id, { progress: Math.min(10, Math.round(progress / 10)) }), onProgress: (progress, bytes) => store.updateTransfer(local.id, { status: 'uploading', progress, bytesTransferred: bytes }) })
        store.upsertTransfer(result.transfer); store.upsertStorageItem(result.storageItem); showNotice(`${file.name} 已上传，等待另一台电脑接收`)
      } catch (error) { store.updateTransfer(local.id, { status: 'failed', error: error instanceof Error ? error.message : '上传失败' }); showNotice(error instanceof Error ? error.message : '上传失败', 'error') }
    }
  }
  const download = async (item: Transfer) => {
    if (!item.storageKey) return showNotice('这个文件没有可用的云端地址', 'error')
    try { store.updateTransfer(item.id, { status: 'downloading' }); const plan = await createFileDownload(item.storageKey); const saved = await window.flowbridge?.downloadFile({ ...plan, checksum: plan.checksum ?? item.checksum, fileName: item.fileName, defaultDirectory: store.settings.downloadDirectory }); if (!saved) return store.updateTransfer(item.id, { status: 'waiting' }); await markTransferCompleted(item.id, item.targetDeviceId, item.sourceDeviceId); store.updateTransfer(item.id, { status: 'completed', progress: 100, bytesTransferred: item.fileSize, localPath: saved }); showNotice('文件已保存并通过传输确认') }
    catch (error) { store.updateTransfer(item.id, { status: 'failed', error: error instanceof Error ? error.message : '下载失败' }); showNotice(error instanceof Error ? error.message : '下载失败', 'error') }
  }
  return <div className="stack"><section className={`drop-zone ${dragging ? 'dragging' : ''}`} onDragOver={(event) => { event.preventDefault(); setDragging(true) }} onDragLeave={() => setDragging(false)} onDrop={(event) => { event.preventDefault(); setDragging(false); void handleFiles(Array.from(event.dataTransfer.files)) }}><input ref={inputRef} type="file" multiple hidden onChange={(event) => void handleFiles(Array.from(event.target.files ?? []))} /><span className="drop-icon"><Upload /></span><div><h2>拖放文件到这里</h2><p>单个文件最大 500 MB，支持断点续传与完整性校验。</p></div><DevicePicker devices={store.devices} value={store.selectedTargetId} onChange={store.selectTarget} /><button className="primary-button" onClick={() => inputRef.current?.click()}><Plus size={18} />选择文件</button></section>
    <section className="panel"><div className="panel-heading"><div><span className="card-kicker">传输记录</span><h2>{transfers.length} 个文件</h2></div><button className="link-button" onClick={store.clearTransfers}>清理已完成</button></div>{transfers.length ? <div className="transfer-list">{transfers.map((item) => <div className="transfer-row" key={item.id}><span className="file-icon"><FileText /></span><div className="transfer-main"><div><strong>{item.fileName}</strong><span>{formatBytes(item.fileSize)} · {formatDate(item.createdAt)}</span></div><div className="progress"><span style={{ width: `${item.progress}%` }} /></div><small>{transferLabel[item.status]}{item.error ? ` · ${item.error}` : ''}</small></div><span className={`status-pill ${item.status}`}>{transferLabel[item.status]}</span>{item.targetDeviceId === store.devices.find((device) => device.isCurrent)?.id && ['waiting', 'uploaded'].includes(item.status) && <button className="secondary-button" onClick={() => void download(item)}><Download size={17} />接收</button>}{item.localPath && <button className="icon-button" onClick={() => void window.flowbridge?.showItemInFolder(item.localPath!)}><FolderOpen size={18} /></button>}{item.status === 'failed' && <button className="icon-button" onClick={() => store.retryTransfer(item.id)}><RefreshCw size={18} /></button>}</div>)}</div> : <EmptyState icon={<FolderOpen />} title="还没有传输记录" detail="选择一个目标设备，然后拖入文件。" />}</section></div>
}

const transferLabel: Record<Transfer['status'], string> = { queued: '等待上传', uploading: '正在上传', uploaded: '上传完成', waiting: '等待接收', downloading: '正在下载', completed: '已完成', failed: '失败', cancelled: '已取消', expired: '已过期', checksum_failed: '校验失败' }

function PromptsPage({ query, showNotice }: { query: string; showNotice: Notice }) {
  const { prompts, savePrompt, updatePrompt, togglePromptFavorite, deletePrompt, restorePrompt } = useFlowStore()
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const visible = prompts.filter((prompt) => !prompt.deletedAt && `${prompt.title} ${prompt.content} ${prompt.tags.join(' ')}`.toLowerCase().includes(query.toLowerCase()))
  return <div className="stack"><div className="toolbar"><div><strong>{visible.length} 个 Prompt</strong><span className="muted"> 收藏、标签与版本会保存在当前设备</span></div><button className="primary-button" onClick={() => { const prompt = savePrompt('', '新 Prompt'); setEditing(prompt.id); setDraft('') }}><Plus size={18} />新建 Prompt</button></div><div className="prompt-grid">{visible.map((prompt) => <article className="prompt-card" key={prompt.id}><div className="prompt-card-head"><span className="spark"><Sparkles /></span><button className={prompt.isFavorite ? 'selected' : ''} onClick={() => togglePromptFavorite(prompt.id)}><Heart fill={prompt.isFavorite ? 'currentColor' : 'none'} /></button></div><input className="title-input" value={prompt.title} onChange={(event) => updatePrompt(prompt.id, { title: event.target.value })} />{editing === prompt.id ? <textarea autoFocus value={draft} onChange={(event) => setDraft(event.target.value)} /> : <p>{prompt.content || '点击编辑，写下你的 Prompt…'}</p>}<div className="tag-row">{prompt.tags.map((tag) => <span className="tag" key={tag}>{tag}</span>)}</div><footer><span>{prompt.modelName || '通用'} · {relativeTime(prompt.updatedAt)}</span><div>{editing === prompt.id ? <button onClick={() => { updatePrompt(prompt.id, { content: draft }); setEditing(null); showNotice('已保存') }}><Check /></button> : <button onClick={() => { setDraft(prompt.content); setEditing(prompt.id) }}><FileText /></button>}<button onClick={() => deletePrompt(prompt.id)}><Trash2 /></button></div></footer></article>)}</div>{!visible.length && <EmptyState icon={<Sparkles />} title="还没有 Prompt" detail="从剪贴板保存一条 Prompt，或创建一条新的。" action={<button className="primary-button" onClick={() => { const item = prompts.find((prompt) => prompt.deletedAt); if (item) restorePrompt(item.id) }}>恢复最近删除</button>} />}</div>
}

const categoryIcon: Record<StorageCategory, ReactNode> = { image: <Image />, video: <Video />, document: <FileText />, archive: <FileArchive />, other: <File /> }

function StoragePage({ query, showNotice }: { query: string; showNotice: Notice }) {
  const { storageItems, quota, setQuota, removeStorageItem, upsertStorageItem } = useFlowStore()
  const items = storageItems.filter((item) => item.originalName.toLowerCase().includes(query.toLowerCase()))
  const groups = useMemo(() => Object.entries(items.reduce<Record<string, number>>((sum, item) => ({ ...sum, [item.category]: (sum[item.category] ?? 0) + item.sizeBytes }), {})), [items])
  const remove = async (item: typeof storageItems[number]) => { if (!confirm(`从云端删除“${item.originalName}”？此操作无法撤销。`)) return; try { await deleteCloudStorageItem(item); removeStorageItem(item.id); setQuota({ ...quota, usedBytes: Math.max(0, quota.usedBytes - item.sizeBytes) }); showNotice('已从云端删除') } catch (error) { showNotice(error instanceof Error ? error.message : '删除失败', 'error') } }
  const keep = async (item: typeof storageItems[number]) => { try { await saveCloudStorageItem(item.id); upsertStorageItem({ ...item, retentionType: 'saved', expiresAt: undefined }); showNotice('已设为长期保留') } catch (error) { showNotice(error instanceof Error ? error.message : '保存失败', 'error') } }
  const percentage = Math.min(100, quota.usedBytes / Math.max(quota.quotaBytes, 1) * 100)
  return <div className="stack"><section className="storage-hero"><div><span className="card-kicker">存储空间</span><h2>{formatBytes(quota.usedBytes)} <small>/ {formatBytes(quota.quotaBytes)}</small></h2><div className="meter large"><span style={{ width: `${percentage}%` }} /></div><p>已使用 {percentage.toFixed(1)}%，剩余 {formatBytes(Math.max(0, quota.quotaBytes - quota.usedBytes))}</p></div><div className="storage-categories">{groups.map(([category, bytes]) => <div key={category}><span>{categoryIcon[category as StorageCategory]}</span><strong>{({ image: '图片', video: '视频', document: '文档', archive: '压缩包', other: '其他' } as Record<string, string>)[category]}</strong><small>{formatBytes(bytes)}</small></div>)}</div></section><section className="panel"><div className="panel-heading"><div><span className="card-kicker">云端文件</span><h2>{items.length} 个项目</h2></div></div>{items.length ? <div className="storage-list">{items.map((item) => <div key={item.id}><span className="file-icon">{categoryIcon[item.category]}</span><span><strong>{item.originalName}</strong><small>{formatBytes(item.sizeBytes)} · {item.retentionType === 'saved' ? '长期保留' : `临时文件${item.expiresAt ? ` · ${relativeTime(item.expiresAt).replace('前', '后过期')}` : ''}`}</small></span><span className="checksum">SHA-256 {item.sha256.slice(0, 10)}…</span>{item.retentionType === 'temporary' && <button className="secondary-button" onClick={() => void keep(item)}><Archive size={17} />保留</button>}<button className="icon-button danger" onClick={() => void remove(item)}><Trash2 size={18} /></button></div>)}</div> : <EmptyState icon={<HardDrive />} title="云端空间是空的" detail="成功发送文件后，它会出现在这里。" />}</section></div>
}

function DevicesPage({ query, showNotice }: { query: string; showNotice: Notice }) {
  const { devices, selectedTargetId, selectTarget, renameDevice, removeDevice, settings, updateSettings } = useFlowStore()
  const visible = devices.filter((device) => device.name.toLowerCase().includes(query.toLowerCase()))
  return <div className="device-grid">{visible.map((device) => <article className="device-card" key={device.id}><div className="device-visual"><Monitor /><StatusDot online={device.status === 'online'} /></div><div><div className="device-name"><input value={device.name} onChange={(event) => renameDevice(device.id, event.target.value)} /><span className="tag">{device.isCurrent ? '当前设备' : device.platform}</span></div><p>{device.status === 'online' ? '现在在线' : `上次在线：${relativeTime(device.lastSeenAt)}`}</p></div><div className="device-card-actions">{!device.isCurrent && <label><input type="radio" name="default-device" checked={(settings.defaultTargetDeviceId || selectedTargetId) === device.id} onChange={() => { selectTarget(device.id); updateSettings({ defaultTargetDeviceId: device.id }); if (isCloudConfigured) void updateCloudPreferences({ ...settings, defaultTargetDeviceId: device.id }).catch((error) => showNotice(error.message, 'error')) }} />默认接收设备</label>}{!device.isCurrent && <button className="danger-link" onClick={() => { if (confirm(`移除“${device.name}”？`)) removeDevice(device.id) }}><Trash2 size={17} />移除</button>}</div></article>)}{!visible.length && <EmptyState icon={<Laptop />} title="没有找到设备" detail="在另一台电脑登录同一账号后，它会自动出现。" />}</div>
}

function ProfilePage({ showNotice, onLogout }: { showNotice: Notice; onLogout: () => Promise<void> }) {
  const { profile, accountEmail, devices, clipboardItems, transfers, patchProfile } = useFlowStore()
  const [draft, setDraft] = useState({ displayName: profile?.displayName ?? accountEmail.split('@')[0], bio: profile?.bio ?? '', locale: profile?.locale ?? 'zh-CN', timezone: profile?.timezone ?? 'Asia/Shanghai' })
  const save = async () => { try { if (isCloudConfigured) await updateCloudProfile(draft); patchProfile({ ...draft, updatedAt: new Date().toISOString() }); showNotice('个人资料已保存') } catch (error) { showNotice(error instanceof Error ? error.message : '保存失败', 'error') } }
  return <div className="profile-layout"><section className="profile-card"><div className="avatar xl">{initials(draft.displayName)}</div><h2>{draft.displayName || 'FlowBridge 用户'}</h2><p>{profile?.email || accountEmail}</p><div className="profile-stats"><div><strong>{devices.length}</strong><span>设备</span></div><div><strong>{clipboardItems.length}</strong><span>剪贴板</span></div><div><strong>{transfers.filter((item) => item.status === 'completed').length}</strong><span>已传文件</span></div></div><button className="secondary-button danger-text" onClick={() => void onLogout()}><LogOut size={18} />退出登录</button></section><section className="panel profile-form"><div className="panel-heading"><div><span className="card-kicker">个人资料</span><h2>让这个空间更像你</h2></div></div><div className="form-grid"><label>显示名称<input value={draft.displayName} onChange={(event) => setDraft({ ...draft, displayName: event.target.value })} maxLength={80} /></label><label>语言<select value={draft.locale} onChange={(event) => setDraft({ ...draft, locale: event.target.value })}><option value="zh-CN">简体中文</option><option value="en-US">English</option></select></label><label className="full">个人简介<textarea value={draft.bio} onChange={(event) => setDraft({ ...draft, bio: event.target.value })} maxLength={280} placeholder="写一句关于你的工作方式…" /></label><label className="full">时区<select value={draft.timezone} onChange={(event) => setDraft({ ...draft, timezone: event.target.value })}><option value="Asia/Shanghai">中国标准时间（上海）</option><option value="Asia/Hong_Kong">香港时间</option><option value="Asia/Tokyo">日本标准时间</option><option value="America/Los_Angeles">太平洋时间</option></select></label></div><button className="primary-button" onClick={() => void save()}><Save size={18} />保存修改</button></section></div>
}

function SettingRow({ title, detail, children }: { title: string; detail: string; children: ReactNode }) { return <div className="setting-row"><div><strong>{title}</strong><p>{detail}</p></div><div>{children}</div></div> }
function Switch({ checked, onChange }: { checked: boolean; onChange: (value: boolean) => void }) { return <button className={`switch ${checked ? 'on' : ''}`} onClick={() => onChange(!checked)} role="switch" aria-checked={checked}><span /></button> }

function SettingsPage({ showNotice }: { showNotice: Notice }) {
  const { settings, updateSettings, devices } = useFlowStore()
  const apply = (patch: Partial<Settings>) => { const next = { ...settings, ...patch }; updateSettings(patch); if (isCloudConfigured) void updateCloudPreferences(next).catch((error) => showNotice(error.message, 'error')) }
  const moveNav = (id: string, direction: -1 | 1) => {
    const order = [...settings.sidebarOrder]
    const index = order.indexOf(id)
    const target = index + direction
    if (index < 0 || target < 0 || target >= order.length) return
    ;[order[index], order[target]] = [order[target], order[index]]
    apply({ sidebarOrder: order })
  }
  return <div className="settings-layout"><section className="settings-section"><div className="settings-heading"><Palette /><div><h2>外观</h2><p>更宽松、更清晰，也可以跟随系统。</p></div></div><SettingRow title="主题" detail="切换浅色、深色或跟随 Windows"><div className="segmented">{(['system', 'light', 'dark'] as const).map((value) => <button key={value} className={settings.theme === value ? 'active' : ''} onClick={() => apply({ theme: value })}>{value === 'system' ? '系统' : value === 'light' ? '浅色' : '深色'}</button>)}</div></SettingRow><SettingRow title="强调色" detail="用于按钮、进度和选中状态"><div className="color-options">{(['blue', 'indigo', 'teal', 'orange', 'rose', 'graphite'] as const).map((color) => <button key={color} className={`${color} ${settings.accent === color ? 'selected' : ''}`} onClick={() => apply({ accent: color })} aria-label={color} />)}</div></SettingRow><SettingRow title="文字大小" detail="正文不会低于可读尺寸"><select value={settings.fontScale} onChange={(event) => apply({ fontScale: Number(event.target.value) as Settings['fontScale'] })}><option value={0.9}>较小</option><option value={1}>标准</option><option value={1.1}>较大</option><option value={1.25}>特大</option></select></SettingRow><SettingRow title="界面密度" detail="舒适模式留出更多呼吸空间"><div className="segmented"><button className={settings.density === 'comfortable' ? 'active' : ''} onClick={() => apply({ density: 'comfortable' })}>舒适</button><button className={settings.density === 'compact' ? 'active' : ''} onClick={() => apply({ density: 'compact' })}>紧凑</button></div></SettingRow><SettingRow title="减少动态效果" detail="关闭非必要的过渡动画"><Switch checked={settings.reduceMotion} onChange={(value) => apply({ reduceMotion: value })} /></SettingRow></section>
    <section className="settings-section"><div className="settings-heading"><SlidersHorizontal /><div><h2>同步与文件</h2><p>决定内容如何在设备间流动。</p></div></div><SettingRow title="自动写入系统剪贴板" detail="收到文本后直接写入 Windows 剪贴板"><Switch checked={settings.autoWriteClipboard} onChange={(value) => apply({ autoWriteClipboard: value })} /></SettingRow><SettingRow title="默认目标设备" detail="快速发送时优先选择"><select value={settings.defaultTargetDeviceId ?? ''} onChange={(event) => apply({ defaultTargetDeviceId: event.target.value || undefined })}><option value="">每次询问</option>{devices.filter((device) => !device.isCurrent).map((device) => <option value={device.id} key={device.id}>{device.name}</option>)}</select></SettingRow><SettingRow title="下载目录" detail={settings.downloadDirectory || '每次下载时询问'}><button className="secondary-button" onClick={async () => { const directory = await window.flowbridge?.chooseDownloadDirectory(); if (directory) apply({ downloadDirectory: directory }) }}><FolderOpen size={17} />选择</button></SettingRow><SettingRow title="剪贴板保留时间" detail="收藏内容不受影响"><select value={settings.historyDays} onChange={(event) => apply({ historyDays: Number(event.target.value) })}><option value={7}>7 天</option><option value={30}>30 天</option><option value={90}>90 天</option></select></SettingRow></section>
    <section className="settings-section"><div className="settings-heading"><Bell /><div><h2>通知</h2><p>只保留对工作有帮助的提醒。</p></div></div><SettingRow title="文本到达" detail="另一台设备发来文本时通知"><Switch checked={settings.textNotifications} onChange={(value) => apply({ textNotifications: value })} /></SettingRow><SettingRow title="文件到达" detail="文件可接收或传输失败时通知"><Switch checked={settings.fileNotifications} onChange={(value) => apply({ fileNotifications: value })} /></SettingRow><SettingRow title="设备状态" detail="设备上线或离线时通知"><Switch checked={settings.deviceNotifications} onChange={(value) => apply({ deviceNotifications: value })} /></SettingRow><SettingRow title="通知中显示内容预览" detail="关闭可避免敏感内容出现在桌面"><Switch checked={settings.previewNotifications} onChange={(value) => apply({ previewNotifications: value })} /></SettingRow></section>
    <section className="settings-section"><div className="settings-heading"><LayoutDashboard /><div><h2>首页与导航</h2><p>选择首页卡片，并调整左侧导航顺序。</p></div></div>{[['quick-send', '快速发送'], ['devices', '设备状态'], ['recent', '最近活动'], ['storage', '存储空间']].map(([id, label]) => <SettingRow key={id} title={label} detail="可随时重新打开"><Switch checked={settings.homeWidgets.includes(id)} onChange={(value) => apply({ homeWidgets: value ? [...settings.homeWidgets, id] : settings.homeWidgets.filter((item) => item !== id) })} /></SettingRow>)}<div className="nav-order"><strong>导航顺序</strong>{settings.sidebarOrder.map((id, index) => { const item = coreNav.find((entry) => entry.id === id); if (!item) return null; return <div key={id}><span><item.icon size={18} />{item.label}</span><span><button className="secondary-button" disabled={index === 0} onClick={() => moveNav(id, -1)}>上移</button><button className="secondary-button" disabled={index === settings.sidebarOrder.length - 1} onClick={() => moveNav(id, 1)}>下移</button></span></div> })}</div></section>
  </div>
}

function AdminPage({ query, showNotice }: { query: string; showNotice: Notice }) {
  const { adminUsers, auditLogs, setAdminUsers, setAuditLogs, role } = useFlowStore()
  const [tab, setTab] = useState<'users' | 'audit'>('users')
  const [busy, setBusy] = useState(false)
  const refresh = useCallback(async () => { setBusy(true); try { const data = await loadAdminData(); setAdminUsers(data.users); setAuditLogs(data.logs) } catch (error) { showNotice(error instanceof Error ? error.message : '加载管理数据失败', 'error') } finally { setBusy(false) } }, [setAdminUsers, setAuditLogs, showNotice])
  useEffect(() => { void refresh() }, [refresh])
  const act = async (task: (reason: string) => Promise<void>) => { const reason = prompt('请填写操作原因（会写入审计日志）：'); if (!reason?.trim()) return; try { await task(reason.trim()); await refresh(); showNotice('管理操作已完成') } catch (error) { showNotice(error instanceof Error ? error.message : '操作失败', 'error') } }
  const users = adminUsers.filter((user) => `${user.email} ${user.displayName}`.toLowerCase().includes(query.toLowerCase()))
  return <div className="stack"><div className="toolbar"><div className="segmented"><button className={tab === 'users' ? 'active' : ''} onClick={() => setTab('users')}><Users size={17} />用户</button><button className={tab === 'audit' ? 'active' : ''} onClick={() => setTab('audit')}><Shield size={17} />审计日志</button></div><button className="secondary-button" onClick={() => void refresh()} disabled={busy}><RefreshCw className={busy ? 'spin' : ''} size={17} />刷新</button></div>{tab === 'users' ? <section className="panel table-panel"><table><thead><tr><th>用户</th><th>状态</th><th>权限</th><th>设备</th><th>存储</th><th>操作</th></tr></thead><tbody>{users.map((user) => <AdminUserRow key={user.userId} user={user} currentRole={role} act={act} />)}</tbody></table></section> : <section className="panel table-panel"><table><thead><tr><th>时间</th><th>操作</th><th>目标用户</th><th>原因</th><th>结果</th></tr></thead><tbody>{auditLogs.filter((log) => `${log.action} ${log.reason}`.toLowerCase().includes(query.toLowerCase())).map((log) => <tr key={log.id}><td>{formatDate(log.createdAt)}</td><td><code>{log.action}</code></td><td>{log.targetUserId?.slice(0, 8) ?? '—'}</td><td>{log.reason || '—'}</td><td><span className={`status-pill ${log.result}`}>{log.result === 'success' ? '成功' : '失败'}</span></td></tr>)}</tbody></table></section>}</div>
}

function AdminUserRow({ user, currentRole, act }: { user: AdminUserSummary; currentRole: UserRole; act: (task: (reason: string) => Promise<void>) => Promise<void> }) {
  return <tr><td><div className="table-user"><span className="avatar small">{initials(user.displayName || user.email)}</span><span><strong>{user.displayName || '未设置名称'}</strong><small>{user.email}</small></span></div></td><td><span className={`status-pill ${user.accountStatus}`}>{user.accountStatus === 'active' ? '正常' : user.accountStatus === 'suspended' ? '已停用' : '待删除'}</span></td><td><select value={user.role} disabled={currentRole !== 'super_admin'} onChange={(event) => void act((reason) => adminSetUserRole(user.userId, event.target.value as UserRole, reason))}><option value="user">用户</option><option value="admin">管理员</option><option value="super_admin">超级管理员</option></select></td><td>{user.deviceCount}</td><td><button className="link-button" onClick={() => { const value = prompt('输入新的配额（GB）：', String(Math.round(user.storageQuota / 1024 ** 3))); const gb = Number(value); if (gb > 0) void act((reason) => adminSetStorageQuota(user.userId, gb * 1024 ** 3, reason)) }}>{formatBytes(user.storageUsed)} / {formatBytes(user.storageQuota)}</button></td><td><div className="table-actions"><button className="icon-button" title="撤销所有设备" onClick={() => void act((reason) => adminRevokeDevices(user.userId, reason))}><Laptop size={17} /></button><button className="icon-button danger" title={user.accountStatus === 'active' ? '停用账号' : '恢复账号'} onClick={() => void act((reason) => adminSetAccountStatus(user.userId, user.accountStatus === 'active' ? 'suspended' : 'active', reason))}>{user.accountStatus === 'active' ? <Pause size={17} /> : <Play size={17} />}</button></div></td></tr>
}
