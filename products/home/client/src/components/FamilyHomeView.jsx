// 家属端（晚晴伴）：状态大卡 + 通知中心 + SOS 确认 + 演示控制。
import { useState } from 'react'
import useHomeState from '../hooks/useHomeState'

const CHECKIN_STATUS = {
  done: '问安完成 ✓',
  in_progress: '正在问安…',
  no_answer: '问安无应答 ⚠️',
}

export default function FamilyHomeView() {
  const { state, activities, connected } = useHomeState()
  const [busy, setBusy] = useState(false)
  if (!state) {
    return <div className="family-loading">正在连接晚晴伴…</div>
  }

  const sos = state.sos
  const sosActive = sos?.status === 'active'
  const today = state.checkin.today
  const elder = state.elder

  const ackSos = async () => {
    setBusy(true)
    try {
      await fetch('/api/home/commands', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'sos_manage', arguments: { action: 'ack', byName: elder.contacts[0]?.name || '家属' } }),
      })
    } finally {
      setBusy(false)
    }
  }

  const simulateCheckin = async () => {
    setBusy(true)
    try {
      // 演示控制：立刻发起一次问安（真实环境由定时调度触发）。
      await fetch('/api/home/simulate-checkin', { method: 'POST' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="family-view home-family">
      <header className="family-topbar">
        <span className="family-brand">
          <span className="brand-mark">晴</span>
          晚晴伴
        </span>
        <span className={`family-role ${connected ? '' : 'offline'}`}>
          {connected ? '已连接家庭网关' : '连接中…'}
        </span>
      </header>

      {sosActive && (
        <div className="family-sos-banner">
          <strong>⚠️ {elder.name} 紧急求助：{sos.reason}</strong>
          <span>已通知：{sos.notified.map(entry => entry.contact.name).join('、')}</span>
          {!sos.notified.some(entry => entry.ackAt) && (
            <button type="button" disabled={busy} onClick={ackSos}>
              我看到了，马上处理
            </button>
          )}
          {sos.notified.some(entry => entry.ackAt) && (
            <em>已确认 · 老人端已显示“家人正在赶来”</em>
          )}
        </div>
      )}

      <section className={`family-status-card ${sosActive || today.status === 'no_answer' ? 'attention' : 'safe'}`}>
        <div className="status-main">
          <span className="status-heart">{sosActive || today.status === 'no_answer' ? '🔴' : '♥'}</span>
          <div>
            <div className="status-name">{elder.name} <span className="status-age">{elder.age}岁</span></div>
            <div className="status-line">
              {sosActive ? '紧急求助处理中' : `此刻平安 · 最近对话 ${new Date(elder.lastVoiceAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`}
            </div>
          </div>
        </div>
        <ul className="status-facts">
          <li>☀️ {CHECKIN_STATUS[today.status] || today.status}：{today.mood || '—'}{today.notes ? ` · ${today.notes}` : ''}</li>
          <li>💊 今日提醒：{state.reminders.filter(item => item.confirmedAt).length}/{state.reminders.length} 已确认</li>
          <li>📞 紧急联系人：{elder.contacts.map(contact => `${contact.relation}${contact.name}`).join('、')}</li>
        </ul>
      </section>

      <section className="family-quick">
        <button type="button" className="quick-call" disabled={busy}>
          📞 跟{elder.address || '妈妈'}说说话
        </button>
        <button type="button" className="quick-checkin" disabled={busy} onClick={simulateCheckin}>
          ☀️ 演示：现在发起一次问安
        </button>
      </section>

      <section className="family-notifications">
        <h2>通知</h2>
        <div className="notification-list">
          {state.notifications.slice(0, 12).map(notification => (
            <div key={notification.id} className={`notification-item level-${notification.level}`}>
              <span className="notification-time">{notification.at.slice(5, 16).replace('T', ' ')}</span>
              <span className="notification-text">
                <strong>{notification.title}</strong>
                {notification.text ? ` — ${notification.text}` : ''}
              </span>
            </div>
          ))}
          {!state.notifications.length && <div className="notification-empty">暂时没有通知</div>}
        </div>
      </section>

      <footer className="family-footer">
        语音在家庭网关本地处理，只有摘要状态同步到这里。
      </footer>
    </div>
  )
}
