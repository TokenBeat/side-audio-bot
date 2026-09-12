// 家属端：子女的"安心"落点。状态大卡 + 通知列表。
import { useMemo } from 'react'
import useCareState from '../hooks/useCareState'

export default function FamilyView({ roomId }) {
  const { state, activities } = useCareState()
  const room = useMemo(() => (
    state?.rooms?.find(item => item.id === roomId)
      || state?.rooms?.find(item => item.id === '301')
      || state?.rooms?.[0]
  ), [state, roomId])

  const myTickets = useMemo(() => (
    (state?.callTickets || []).filter(ticket => ticket.roomId === room?.id)
  ), [state, room])

  const medicationToday = useMemo(() => {
    if (!room || !state) return null
    const plan = state.medications?.[room.id]
    if (!plan) return null
    const today = new Date().toISOString().slice(0, 10)
    return {
      items: plan.items,
      confirmed: plan.confirmations.filter(item => item.date === today),
    }
  }, [state, room])

  const isSafe = room?.state === 'safe'

  if (!state) {
    return <div className="family-loading">正在连接晚晴·照护…</div>
  }

  return (
    <div className="family-view">
      <header className="family-topbar">
        <span className="family-brand">晚晴<span className="dot">·</span>照护</span>
        <span className="family-role">家属端 · {room?.id} 房</span>
      </header>

      <section className={`family-status-card ${isSafe ? 'safe' : 'attention'}`}>
        <div className="status-main">
          <span className="status-heart">{isSafe ? '♥' : '🔴'}</span>
          <div>
            <div className="status-name">{room?.resident?.name} <span className="status-age">{room?.resident?.age}岁</span></div>
            <div className="status-line">
              {isSafe ? '此刻平安' : room?.state === 'calling' ? '正在呼叫护理员，已受理' : '有待处理的提醒'}
            </div>
          </div>
        </div>
        <ul className="status-facts">
          <li>💊 用药：{medicationToday?.confirmed.length
            ? `今日已确认 ${medicationToday.confirmed.map(item => `${item.name} ${item.at.slice(11, 16)}`).join('、')}`
            : `今日待确认：${medicationToday?.items.map(item => `${item.time} ${item.name}`).join('、') || '无计划'}`}</li>
          <li>🕐 最近呼叫：{myTickets[0]
            ? `${new Date(myTickets[0].createdAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })} ${myTickets[0].intent}（${myTickets[0].status === 'done' ? '已完成' : myTickets[0].status === 'accepted' ? '处理中' : '待受理'}）`
            : '今天还没有呼叫'}</li>
          <li>📢 当班：{(state.duty?.staff || []).filter(person => person.onDuty).map(person => person.name).join('、') || '—'}</li>
        </ul>
      </section>

      <section className="family-notifications">
        <h2>动态</h2>
        <div className="notification-list">
          {activities.slice(0, 12).map((activity, index) => (
            <div key={`${activity.at}-${index}`} className="notification-item">
              <span className="notification-time">{activity.at.slice(11, 16)}</span>
              <span className="notification-text">{activity.message}</span>
            </div>
          ))}
          {!activities.length && <div className="notification-empty">暂时没有新动态</div>}
        </div>
      </section>

      <footer className="family-footer">
        语音在本机构内网本地处理，只有摘要状态同步到这里。
      </footer>
    </div>
  )
}
