// 户型平面图：客厅/卧室/厨房，设备状态实时点亮。
// 点击房间选中，右侧面板显示该房间设备。灯光亮度=光晕强度，窗帘=开口示意。
const ROOM_LAYOUT = {
  living: { x: 24, y: 60, w: 300, h: 250, label: '客厅' },
  bedroom: { x: 344, y: 60, w: 220, h: 190, label: '卧室' },
  kitchen: { x: 344, y: 262, w: 220, h: 148, label: '厨房' },
}

function devicesInRoom(devices, roomId) {
  return Object.entries(devices || {})
    .filter(([, device]) => device.room === roomId)
}

export default function FloorPlan({ state, selected, onSelect }) {
  const devices = state?.devices || {}
  const activeScene = state?.scenes?.find(scene => scene.id === state?.activeScene)

  return (
    <div className="floorplan-wrap">
      <svg viewBox="0 0 590 440" className="floorplan-svg">
        <defs>
          <radialGradient id="glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#ffca7a" stopOpacity="0.85" />
            <stop offset="100%" stopColor="#ffca7a" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="roomFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.92" />
            <stop offset="100%" stopColor="#f7efe2" stopOpacity="0.92" />
          </linearGradient>
        </defs>

        {Object.entries(ROOM_LAYOUT).map(([roomId, layout]) => {
          const roomDevices = devicesInRoom(devices, roomId)
          const lightsOn = roomDevices.filter(([, device]) => (
            (device.kind === 'light' || device.kind === 'nightlight') && device.on
          ))
          const selectedClass = selected === roomId ? 'selected' : ''
          return (
            <g
              key={roomId}
              className={`room-rect ${selectedClass}`}
              onClick={() => onSelect(roomId)}
              role="button"
              aria-label={`${layout.label}，${roomDevices.length} 个设备`}
            >
              <rect
                x={layout.x}
                y={layout.y}
                width={layout.w}
                height={layout.h}
                rx={18}
                fill="url(#roomFill)"
                stroke={selected === roomId ? 'var(--brand)' : 'rgba(51, 41, 31, 0.14)'}
                strokeWidth={selected === roomId ? 3 : 1.5}
              />
              {/* 灯光光晕：亮度越高级越大 */}
              {lightsOn.map(([id, device]) => {
                const cx = layout.x + 34 + (id === 'nightlight' ? 20 : 0)
                const cy = layout.y + 34
                const radius = 30 + (device.brightness || 40) * 0.5
                return (
                  <circle
                    key={`${id}-glow`}
                    cx={cx}
                    cy={cy}
                    r={radius}
                    fill="url(#glow)"
                    opacity={0.25 + (device.brightness || 40) / 180}
                  />
                )
              })}
              <text x={layout.x + 20} y={layout.y + 38} className="room-label">
                {layout.label}
              </text>
              <text x={layout.x + 20} y={layout.y + 60} className="room-sub">
                {activeScene && roomId === 'living' ? `🌙 ${activeScene.name}` : ''}
              </text>
              {/* 设备状态点 */}
              {roomDevices.map(([id, device], index) => {
                const cx = layout.x + 34 + (index % 4) * 46
                const cy = layout.y + layout.h - 44
                const icon = device.kind === 'light' || device.kind === 'nightlight'
                  ? '💡'
                  : device.kind === 'ac'
                    ? '❄️'
                    : device.kind === 'curtain'
                      ? '🪟'
                      : device.kind === 'media' ? '📺' : '🔌'
                const on = device.on !== false
                return (
                  <g key={id} className={`device-dot ${on ? 'on' : 'off'}`}>
                    <circle cx={cx} cy={cy} r={17} />
                    <text x={cx} y={cy + 6}>{icon}</text>
                  </g>
                )
              })}
            </g>
          )
        })}

        {/* 传感标记 */}
        <g className="sensor-mark">
          <circle cx={540} cy={30} r={6} className={state?.sensors?.doorWindow === '全部关闭' ? 'ok' : 'alert'} />
          <text x={540} y={52} className="sensor-text">门窗</text>
        </g>
      </svg>
    </div>
  )
}
