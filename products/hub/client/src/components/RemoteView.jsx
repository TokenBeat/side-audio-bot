// 远程控制视图：手机尺寸的紧凑控制页。
// 与现场中控调用同一套服务端 API（远程部署时经家庭网关远程访问，协议不变）。
import { useState } from 'react'
import useHubState from '../hooks/useHubState'
import DevicePanel from './DevicePanel'
import { sceneApi, motionApi } from '../api'
import { speak, warmUpSpeech } from '../audio/announceSpeech'
import { SceneIcon, Moon } from '../ui/icons'

export default function RemoteView() {
  const { state, connected } = useHubState()
  const [selectedRoom, setSelectedRoom] = useState('living')
  const [busy, setBusy] = useState(false)

  const activateScene = async scene => {
    setBusy(true)
    try {
      await sceneApi(scene.id || scene)
      speak(`好，已为你切换到${scene.name || ''}场景`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="remote-view">
      <header className="remote-topbar">
        <span className="family-brand">
          <span className="brand-mark">晴</span>
          晚晴·家
        </span>
        <span className={`family-role ${connected ? '' : 'offline'}`}>
          <span className={`dock-dot ${connected ? 'ok' : 'wait'}`} />
          {connected ? '已连接家庭网关' : '连接中…'}
        </span>
      </header>

      <div className="remote-scene-row">
        {(state?.scenes || []).map(scene => (
          <button
            key={scene.id}
            type="button"
            className={`scene-chip compact ${state?.activeScene === scene.id ? 'active' : ''}`}
            disabled={busy}
            onClick={() => activateScene(scene)}
          >
            <span className="scene-icon"><SceneIcon scene={scene} size={17} strokeWidth={2} /></span>
            {scene.name}
          </button>
        ))}
      </div>

      <div className="remote-room-tabs">
        {(state?.rooms || []).map(room => (
          <button
            key={room.id}
            type="button"
            className={`room-tab ${selectedRoom === room.id ? 'active' : ''}`}
            onClick={() => setSelectedRoom(room.id)}
          >
            {room.name}
          </button>
        ))}
      </div>

      <DevicePanel state={state} selectedRoom={selectedRoom} />

      <div className="remote-demo">
        <button type="button" onClick={() => {
          warmUpSpeech()
          motionApi('卧室', { forceNight: true }).then(result => {
            speak(result?.announced || '夜灯已为你点亮')
          }).catch(() => {})
        }}><Moon size={15} /> 模拟起夜</button>
        <span>远程与现场操控同源；真实部署经家庭网关远程访问（设备凭证 + Tailscale）。</span>
      </div>
    </div>
  )
}
