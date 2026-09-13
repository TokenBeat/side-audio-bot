// 晚晴·家中控屏：户型图主视觉 + 设备面板 + 场景 Dock + 语音。
// 布局对标座舱：设备框 + 左主视觉 + 右控制列 + 底部 Dock。
import { useEffect, useMemo, useState } from 'react'
import useVoiceSession from '../hooks/useVoiceSession'
import useHubState from '../hooks/useHubState'
import FloorPlan from './FloorPlan'
import DevicePanel from './DevicePanel'
import { sceneApi, motionApi, doorApi } from '../api'
import { speak, warmUpSpeech } from '../audio/announceSpeech'

const ORB_STATE_LABEL = {
  idle: '点一下，跟我说话',
  listening: '在听呢，请讲',
  thinking: '想一想…',
  speaking: '我在说',
  error: '语音异常，请重试',
}

export default function HubPanel() {
  const { state, activities, connected } = useHubState()
  const [now, setNow] = useState(() => new Date())
  const [selectedRoom, setSelectedRoom] = useState('living')
  const [muted, setMuted] = useState(true)
  const [transcript, setTranscript] = useState([])

  const session = useVoiceSession({
    muted,
    clientId: 'hub-panel',
    clientLabel: '晚晴家中控',
    onVoiceMessage: message => {
      if (!message.content && !message.final) return
      setTranscript(current => {
        if (message.delta && message.responseId && current.length) {
          const last = current[current.length - 1]
          if (last.role === message.role && last.responseId === message.responseId) {
            const merged = [...current]
            merged[merged.length - 1] = { ...last, content: message.content }
            return merged
          }
        }
        return [...current, {
          role: message.role,
          content: message.content,
          responseId: message.responseId,
          at: Date.now(),
        }]
      })
    },
  })

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30_000)
    return () => clearInterval(timer)
  }, [])

  const activeScene = useMemo(() => (
    state?.scenes?.find(scene => scene.id === state?.activeScene)
  ), [state])
  const openAlerts = (state?.alerts || []).slice(0, 3)
  const lastLine = transcript[transcript.length - 1]

  const toggleVoice = () => {
    if (muted) {
      if (session.activateVoice()) setMuted(false)
    } else {
      setMuted(true)
      session.deactivateVoice()
    }
  }

  const activateScene = scene => {
    warmUpSpeech()
    const sceneName = scene?.name || String(scene || '')
    sceneApi(scene.id || scene).then(result => {
      speak(`好，已为你切换到${result?.name || sceneName}场景`)
    }).catch(() => {})
  }

  const orbState = session.voiceState

  return (
    <div className="terminal-stage">
      <div className="terminal-frame">
        <header className="frame-topbar">
          <span className="frame-brand">
            <span className="brand-mark">晴</span>
            晚晴·家
          </span>
          <span className="frame-weather">☁️ {state?.weather?.summary || '多云'}</span>
          <span className="frame-link">
            <a href="/remote" target="_blank" rel="noreferrer">远程控制 ↗</a>
          </span>
          <span className="frame-clock">{now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</span>
          <span className="frame-date">{now.toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' })}</span>
        </header>

        <div className="terminal-columns hub-columns">
          <section className="hub-left">
            <div className="floorplan-card glass">
              <div className="floorplan-head">
                <span className="panel-title">我的家</span>
                <span className="panel-sub">
                  室内 {state?.sensors?.indoorTemp ?? '—'}° · 湿度 {state?.sensors?.humidity ?? '—'}% · 门窗{state?.sensors?.doorWindow || '—'}
                </span>
              </div>
              <FloorPlan
                state={state}
                selected={selectedRoom}
                onSelect={setSelectedRoom}
              />
              <div className="scene-row">
                {(state?.scenes || []).map(scene => (
                  <button
                    key={scene.id}
                    type="button"
                    className={`scene-chip ${state?.activeScene === scene.id ? 'active' : ''}`}
                    onClick={() => activateScene(scene)}
                  >
                    <span className="scene-icon">{scene.icon}</span>
                    {scene.name}
                  </button>
                ))}
              </div>
            </div>

            <div className="voice-line glass">
              <button
                type="button"
                className={`dock-btn mic small ${muted ? '' : 'live'}`}
                onClick={toggleVoice}
                aria-label="语音开关"
              >
                {muted ? '🎙️' : '🗣️'}
                <span>{muted ? '语音' : '在听'}</span>
              </button>
              <div className="voice-transcript">
                {lastLine ? (
                  <p className={`line line-${lastLine.role}`}>
                    {lastLine.role === 'user' ? '您' : '晚晴'}：{lastLine.content}
                  </p>
                ) : (
                  <p className="line soft">
                    {muted ? '点左边说话：开个灯 / 我睡了 / 空调调到26度 / 起夜' : ORB_STATE_LABEL[orbState] || '在听呢'}
                  </p>
                )}
              </div>
              <div className="voice-orb-mini">
                <span className={`mini-orb ${orbState}`} style={{
                  transform: `scale(${1 + (orbState === 'listening' ? session.inputLevel : orbState === 'speaking' ? session.outputLevel : 0) * 0.4})`,
                }} />
              </div>
            </div>
          </section>

          <aside className="hub-right">
            <DevicePanel state={state} selectedRoom={selectedRoom} />

            <div className="info-card sensors-card">
              <div className="info-card-head">📡 传感与联动</div>
              <div className="sensor-grid">
                <div className="sensor-cell">
                  <span className="sensor-value">{state?.sensors?.indoorTemp ?? '—'}°</span>
                  <span className="sensor-label">室温</span>
                </div>
                <div className="sensor-cell">
                  <span className="sensor-value">{state?.sensors?.humidity ?? '—'}%</span>
                  <span className="sensor-label">湿度</span>
                </div>
                <div className="sensor-cell">
                  <span className="sensor-value">{state?.sensors?.doorWindow === '全部关闭' ? '🔒' : '🔓'}</span>
                  <span className="sensor-label">门窗</span>
                </div>
                <div className="sensor-cell">
                  <span className="sensor-value">{state?.sensors?.lastMotion?.room || '—'}</span>
                  <span className="sensor-label">最近活动</span>
                </div>
              </div>
              <div className="demo-controls">
                <button type="button" onClick={() => {
                  warmUpSpeech()
                  motionApi('卧室', { forceNight: true }).then(result => {
                    speak(result?.announced || '夜灯已为你点亮')
                  }).catch(() => {})
                }}>🌙 模拟起夜（联动夜灯）</button>
                <button type="button" onClick={() => doorApi('大门', '被打开')}>🚪 模拟开门</button>
              </div>
              {openAlerts.length > 0 && (
                <div className="alert-list">
                  {openAlerts.map(alert => (
                    <div key={alert.id} className={`alert-item level-${alert.level}`}>
                      <strong>{alert.title}</strong>
                      {alert.text ? ` — ${alert.text}` : ''}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="info-card activity-card">
              <div className="info-card-head">📜 动态</div>
              {activities.slice(0, 4).map((activity, index) => (
                <div key={`${activity.at}-${index}`} className="schedule-row">
                  <span className="schedule-time">{activity.at.slice(11, 16)}</span>
                  <span className="schedule-title">{activity.message}</span>
                </div>
              ))}
              {!activities.length && <div className="schedule-row soft"><span className="schedule-title soft">设备就绪，等一句话。</span></div>}
            </div>
          </aside>
        </div>

        <footer className="dock hub-dock">
          <span className="dock-note">
            {connected ? '● 全屋在线' : '○ 连接中'}
            {activeScene ? ` · 当前场景：${activeScene.icon} ${activeScene.name}` : ''}
          </span>
          <span className="dock-note right">现场中控 · 远程同源（/remote）</span>
        </footer>
      </div>
    </div>
  )
}
