// 晚晴·家中控屏：户型图主视觉 + 设备面板 + 场景 Dock + 语音。
// 布局对标座舱：设备框 + 左主视觉 + 右控制列 + 底部 Dock。
import { useEffect, useMemo, useRef, useState } from 'react'
import useVoiceSession from '../hooks/useVoiceSession'
import { speak, warmUpSpeech } from '../audio/announceSpeech'
import useHubState from '../hooks/useHubState'
import FloorPlan3D from './FloorPlan3D'
import DevicePanel from './DevicePanel'
import { sceneApi, motionApi, doorApi } from '../api'
import { SceneIcon } from '../ui/icons'
import {
  Cloud, ArrowUpRight, Mic, MicOff, AudioLines, TriangleAlert,
  Radio, Lock, LockOpen, ScrollText, Moon, DoorOpen, Hand, CloudSun,
} from '../ui/icons'

const ORB_STATE_LABEL = {
  idle: '点一下，跟我说话',
  listening: '在听呢，请讲',
  thinking: '想一想…',
  speaking: '我在说',
  error: '语音异常，请重试',
}


// 环境与能耗卡：三天天气、24h 温湿度曲线、今日用电与实时功率。
function EnvEnergyCard({ state }) {
  const history = state?.sensorHistory || []
  const energy = state?.energy
  const forecast = state?.weather?.forecast || []
  return (
    <div className="info-card env-energy-card">
      <div className="info-card-head"><CloudSun className="icon-inline" size={17} /> 环境与能耗</div>
      <div className="forecast-row">
        {forecast.map(item => (
          <div key={item.day} className="forecast-cell">
            <span className="forecast-day">{item.day}</span>
            <span className="forecast-summary">{item.summary}</span>
            <span className="forecast-range">{item.low}° ~ {item.high}°</span>
          </div>
        ))}
        {!forecast.length && <span className="forecast-day soft">天气预报加载中…</span>}
      </div>
      <SensorCurve history={history} />
      <div className="energy-row">
        <span className="energy-main">今日 <strong>{energy?.todayKwh ?? '—'}</strong> 度</span>
        <span className="energy-now">当前 <strong>{energy?.powerNowWatts ?? '—'}</strong> 瓦</span>
        <span className="energy-q">空气 {state?.weather?.airQuality || '—'}</span>
      </div>
      <EnergyBars history={energy?.history || []} />
    </div>
  )
}

function SensorCurve({ history }) {
  if (history.length < 2) return <div className="curve-empty">环境曲线采样中…</div>
  const width = 400
  const height = 74
  const temps = history.map(item => item.temp)
  const hums = history.map(item => item.humidity)
  const tMin = Math.min(...temps) - 0.6
  const tMax = Math.max(...temps) + 0.6
  const hMin = 30
  const hMax = 70
  const toPath = (values, min, max) => values.map((value, index) => {
    const x = (index / (values.length - 1)) * width
    const y = height - ((value - min) / (max - min)) * height
    return `${index ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')
  return (
    <div className="sensor-curve">
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-label="24 小时温湿度曲线">
        <path d={toPath(temps, tMin, tMax)} className="curve-temp" fill="none" strokeWidth={2.4} />
        <path d={toPath(hums, hMin, hMax)} className="curve-hum" fill="none" strokeWidth={2} strokeDasharray="5 4" />
      </svg>
      <span className="curve-legend"><i className="dot temp" />温度 <i className="dot hum" />湿度（24 小时）</span>
    </div>
  )
}

function EnergyBars({ history }) {
  if (!history.length) return null
  const values = history.slice(-24)
  const max = Math.max(...values.map(entry => entry.kwh))
  return (
    <div className="energy-bars" aria-label="24 小时用电分布">
      {values.map((item, index) => (
        <i key={item.at} style={{ height: `${Math.max(8, (item.kwh / max) * 100)}%`, animationDelay: `${index * 28}ms` }} />
      ))}
    </div>
  )
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

  // —— 语音确认：设备状态一变，中控开口说结果（语音控制闭环的"回复"）——
  const prevDevicesRef = useRef(null)
  const spokenDeltaRef = useRef('')
  useEffect(() => {
    if (!state?.devices) return
    const previous = prevDevicesRef.current
    prevDevicesRef.current = state.devices
    if (!previous || muted) return
    const names = []
    for (const [deviceId, device] of Object.entries(state.devices)) {
      const before = previous[deviceId]
      if (!before) continue
      if (before.kind === 'light' && before.on !== device.on) {
        names.push(`${device.name}${device.on ? '打开了' : '关了'}`)
      } else if (before.kind === 'ac' && (before.on !== device.on || before.temp !== device.temp)) {
        names.push(device.on ? `${device.name}已${device.mode || ''}${device.temp}度` : `${device.name}关了`)
      } else if (before.kind === 'curtain' && before.position !== device.position) {
        names.push(`${device.name}${device.position >= 50 ? '打开了' : '拉上了'}`)
      } else if (before.kind === 'tv' && before.on !== device.on) {
        names.push(`${device.name}${device.on ? '打开了' : '关了'}`)
      }
    }
    if (!names.length) return
    const key = names.join('|')
    if (spokenDeltaRef.current === key) return
    spokenDeltaRef.current = key
    speak(`好的，${names.slice(0, 2).join('，')}。`)
  }, [state?.devices, muted])

  const activeScene = useMemo(() => (
    state?.scenes?.find(scene => scene.id === state?.activeScene)
  ), [state])
  const openAlerts = (state?.alerts || []).slice(0, 3)
  const lastLine = transcript[transcript.length - 1]

  const toggleVoice = () => {
    warmUpSpeech()
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
          <span className="frame-weather"><Cloud className="icon-inline" size={17} /> {state?.weather?.summary || '多云'}</span>
          <span className="frame-link">
            <a href="/remote" target="_blank" rel="noreferrer">远程控制 <ArrowUpRight className="icon-inline" size={14} /></a>
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
              <FloorPlan3D
                state={state}
                selected={selectedRoom}
                onSelect={setSelectedRoom}
                height={330}
              />
              <div className="scene-row">
                {(state?.scenes || []).map(scene => (
                  <button
                    key={scene.id}
                    type="button"
                    className={`scene-chip ${state?.activeScene === scene.id ? 'active' : ''}`}
                    onClick={() => activateScene(scene)}
                  >
                    <span className="scene-icon"><SceneIcon scene={scene} size={18} strokeWidth={2} /></span>
                    {scene.name}
                  </button>
                ))}
              </div>
            </div>

            <div
              className={`voice-line glass ${muted ? '' : 'listening'}`}
              onClick={toggleVoice}
              role="button"
              tabIndex={0}
              aria-label={muted ? '开始语音控制' : '语音控制中，点击暂停'}
            >
              <button
                type="button"
                className={`dock-btn mic small ${muted ? '' : 'live'}`}
                onClick={event => { event.stopPropagation(); toggleVoice() }}
                aria-label="语音开关"
              >
                {muted ? <MicOff size={22} /> : <Mic size={22} />}
                <span>{muted ? '语音' : '在听'}</span>
              </button>
              <div className="voice-transcript">
                {lastLine ? (
                  <p className={`line line-${lastLine.role}`}>
                    {lastLine.role === 'user' ? '您' : '晚晴'}：{lastLine.content}
                  </p>
                ) : (
                  <p className={`line ${muted && !session.error ? 'soft' : 'live-hint'}`}>
                    {session.error
                      ? <span className="line-error"><TriangleAlert className="icon-inline" size={15} /> {session.error}（若浏览器拒绝过麦克风：点地址栏左侧的锁形图标重新允许）</span>
                      : muted
                        ? <span className="line-hint"><Hand className="icon-inline" size={15} /> 点这里开始语音控制 · 试试："打开客厅灯" "我睡了" "空调调到26度" "起夜模式"</span>
                        : ORB_STATE_LABEL[orbState] || '在听呢，请讲'}
                  </p>
                )}
              </div>
              <div className="voice-orb-mini">
                <span className={`wave-bars ${orbState === 'listening' || orbState === 'speaking' ? 'live' : ''}`} aria-hidden="true">
                  <i /><i /><i /><i /><i />
                </span>
                <span className={`mini-orb ${orbState}`} style={{
                  transform: `scale(${1 + (orbState === 'listening' ? session.inputLevel : orbState === 'speaking' ? session.outputLevel : 0) * 0.4})`,
                }} />
              </div>
            </div>
          </section>

          <aside className="hub-right">
            <DevicePanel state={state} selectedRoom={selectedRoom} />

            <div className="info-card sensors-card">
              <div className="info-card-head"><Radio className="icon-inline" size={17} /> 传感与联动</div>
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
                  <span className="sensor-value sensor-icon">{state?.sensors?.doorWindow === '全部关闭' ? <Lock size={22} /> : <LockOpen size={22} />}</span>
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
                }}><Moon size={15} /> 模拟起夜（联动夜灯）</button>
                <button type="button" onClick={() => doorApi('大门', '被打开')}><DoorOpen size={15} /> 模拟开门</button>
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
              <div className="info-card-head"><ScrollText className="icon-inline" size={17} /> 动态</div>
              {activities.slice(0, 4).map((activity, index) => (
                <div key={`${activity.at}-${index}`} className="schedule-row">
                  <span className="schedule-time">{activity.at.slice(11, 16)}</span>
                  <span className="schedule-title">{activity.message}</span>
                </div>
              ))}
              {!activities.length && <div className="schedule-row soft"><span className="schedule-title soft">设备就绪，等一句话。</span></div>}
            </div>

            <EnvEnergyCard state={state} />
          </aside>
        </div>

        <footer className="dock hub-dock">
          <span className={`dock-note ${connected ? '' : 'connecting'}`}>
            <span className={`dock-dot ${connected ? 'ok' : 'wait'}`} />
            {connected ? '全屋在线' : '连接中…'}
            {activeScene ? ` · 当前场景：${activeScene.name}` : ''}
          </span>
          <span className="dock-note right">现场中控 · 远程同源（/remote）</span>
        </footer>
      </div>
    </div>
  )
}
