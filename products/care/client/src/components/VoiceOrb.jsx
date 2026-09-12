// 语音状态呼吸圈：老人端最核心的状态可视化。
// 待机=柔光静止，聆听=呼吸圈扩散，思考=缓转光环，播报=波纹，异常=暖红。
export default function VoiceOrb({ state = 'idle', level = 0, onClick, size = 220 }) {
  const listening = state === 'listening'
  const speaking = state === 'speaking'
  const thinking = state === 'thinking'
  const error = state === 'error'

  const scale = listening || speaking
    ? 1 + Math.min(0.18, level * 0.28)
    : 1

  return (
    <button
      type="button"
      className={`voice-orb ${error ? 'is-error' : ''}`}
      style={{ width: size, height: size }}
      onClick={onClick}
      aria-label={listening ? '正在听您说话' : '点我说话'}
    >
      <span
        className={`voice-orb-halo ${listening ? 'is-listening' : ''} ${speaking ? 'is-speaking' : ''} ${thinking ? 'is-thinking' : ''}`}
      />
      <span
        className="voice-orb-core"
        style={{ transform: `scale(${scale})` }}
      />
      <span className="voice-orb-label">
        {error ? '语音异常' : listening ? '在听呢…' : thinking ? '想一想…' : speaking ? '正在说' : '点我说话'}
      </span>
    </button>
  )
}
