export const CARE_CONNECTION_INTERRUPTED = '终端连接中断，正在重连'

export function publishCareVoiceIntent(client, muted, publishedMuted = null) {
  if (!client || publishedMuted === muted) return publishedMuted
  const sent = client.send({
    type: muted ? 'mute' : 'unmute',
  }) === true
  return sent ? muted : publishedMuted
}

export function careVoiceConnectionMode(muted) {
  const enabled = muted !== true
  return {
    voiceEnabled: enabled,
    inputEnabled: enabled,
    outputEnabled: enabled,
    // textOnly 描述客户端能力而非当前静音态：保持 false，静音的终端
    // 之后可以通过标准 unmute 事件恢复语音而无需重连。
    textOnly: false,
  }
}

export function playbackUnavailableReason({ context, muted } = {}) {
  if (muted) return 'client_muted'
  if (!context) return 'audio_context_missing'
  if (context.state && context.state !== 'running') return 'audio_context_suspended'
  return ''
}

export function careConnectionError(state) {
  if (state === 'unavailable' || state === 'disconnected') {
    return CARE_CONNECTION_INTERRUPTED
  }
  if (state === 'connected' || state === 'ready') return null
  return undefined
}
