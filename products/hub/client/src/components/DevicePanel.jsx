// 设备控制面板：选中房间的设备列表，开关/滑杆直接控制（现场与远程同一 API）。
import { deviceControlApi } from '../api'

export default function DevicePanel({ state, selectedRoom, onMutate }) {
  const devices = Object.entries(state?.devices || {})
    .filter(([, device]) => device.room === selectedRoom)
  const room = state?.rooms?.find(item => item.id === selectedRoom)

  const mutate = (deviceId, arguments_) => {
    onMutate?.()
    deviceControlApi(deviceId, arguments_).catch(() => {})
  }

  return (
    <div className="device-panel">
      <div className="panel-head">
        <span className="panel-title">{room?.name || '全屋'}</span>
        <span className="panel-sub">{devices.length} 个设备</span>
      </div>
      {devices.map(([id, device]) => {
        const on = device.on !== false && device.on != null ? device.on : null
        return (
          <div key={id} className={`device-row ${on === false ? 'off' : ''}`}>
            <div className="device-info">
              <span className="device-icon">
                {device.kind === 'light' || device.kind === 'nightlight'
                  ? '💡'
                  : device.kind === 'ac' ? '❄️' : device.kind === 'curtain' ? '🪟' : '📺'}
              </span>
              <div>
                <div className="device-name">{device.name}</div>
                <div className="device-state">
                  {device.kind === 'light' && on
                    ? `亮度 ${device.brightness}% · ${device.colorTemp || ''}`
                    : device.kind === 'ac' && on
                      ? `${device.mode} · ${device.temp}°`
                      : device.kind === 'curtain'
                        ? `开合 ${device.position}%`
                        : on ? '开启' : '关闭'}
                </div>
              </div>
            </div>
            <div className="device-controls">
              {device.kind === 'ac' && on !== false && (
                <div className="stepper">
                  <button type="button" onClick={() => mutate(id, { action: 'set', temp: (device.temp || 26) - 1 })}>−</button>
                  <span className="stepper-value">{device.temp}°</span>
                  <button type="button" onClick={() => mutate(id, { action: 'set', temp: (device.temp || 26) + 1 })}>＋</button>
                </div>
              )}
              {(device.kind === 'light' || device.kind === 'nightlight') && on && (
                <input
                  type="range"
                  min={5}
                  max={100}
                  value={device.brightness || 50}
                  className="brightness-slider"
                  aria-label={`${device.name}亮度`}
                  onChange={event => mutate(id, { action: 'set', brightness: Number(event.target.value) })}
                />
              )}
              {device.kind === 'curtain' ? (
                <button
                  type="button"
                  className="toggle-pill"
                  onClick={() => mutate(id, { action: 'set', direction: device.position > 50 ? '关' : '开' })}
                >
                  {device.position > 50 ? '打开中' : '已关闭'} ⌄
                </button>
              ) : (
                <button
                  type="button"
                  className={`switch ${on ? 'on' : ''}`}
                  aria-label={`${device.name}开关`}
                  onClick={() => mutate(id, { action: on ? 'set' : 'toggle', on: !on })}
                >
                  <span className="knob" />
                </button>
              )}
            </div>
          </div>
        )
      })}
      {!devices.length && <div className="panel-empty">这个房间还没有设备</div>}
    </div>
  )
}
