// 晚晴·照护房间终端的语音会话：GCP 客户端 + 音频采集/播放 + 回执。
// 由座舱 useVoiceSession 精简而来：去掉 persona/音色同步与调试投影，保留语音主链路。
import { useCallback, useEffect, useRef, useState } from 'react'
import { GatewayClient } from 'qwen-audio-agent/gateway-client-sdk'
import {
  GatewayClientCapability,
} from 'qwen-audio-agent/gateway-client-protocol'
import {
  GatewayClientEvent,
  GatewayServerEvent,
} from 'qwen-audio-agent/realtime-events'
import {
  careConnectionError,
  careVoiceConnectionMode,
  playbackUnavailableReason,
  publishCareVoiceIntent,
} from './voiceSessionMode'
import { activateAudioContext } from '../audio/activation'
import { gatewayWebSocketUrl } from '../config/gateway'

const INPUT_SAMPLE_RATE = 16000
const OUTPUT_SAMPLE_RATE = 24000
const SPEECH_THRESHOLD = 0.035
const AUDIO_CAPTURE_CONSTRAINTS = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
}
const TASK_TERMINAL_EVENTS = new Set([
  'task.completed',
  'task.failed',
  'task.cancelled',
])

function gatewayWsUrl(sessionId) {
  const url = gatewayWebSocketUrl('/api/realtime')
  url.searchParams.set('sessionId', sessionId)
  return url.toString()
}

function floatToPcm16Base64(samples) {
  const bytes = new Uint8Array(samples.length * 2)
  const view = new DataView(bytes.buffer)
  for (let index = 0; index < samples.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, samples[index]))
    view.setInt16(index * 2, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true)
  }
  let binary = ''
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000))
  }
  return btoa(binary)
}

function base64Pcm16ToFloat32(base64) {
  const binary = atob(base64)
  const bytes = Uint8Array.from(binary, character => character.charCodeAt(0))
  const view = new DataView(bytes.buffer)
  const samples = new Float32Array(bytes.length / 2)
  for (let index = 0; index < samples.length; index += 1) {
    samples[index] = view.getInt16(index * 2, true) / 0x8000
  }
  return samples
}

function resampleLinear(input, fromRate, toRate) {
  if (fromRate === toRate) return input
  const ratio = fromRate / toRate
  const length = Math.max(1, Math.round(input.length / ratio))
  const output = new Float32Array(length)
  for (let index = 0; index < length; index += 1) {
    const position = index * ratio
    const before = Math.floor(position)
    const after = Math.min(input.length - 1, before + 1)
    const weight = position - before
    output[index] = input[before] * (1 - weight) + input[after] * weight
  }
  return output
}

function rmsLevel(samples) {
  if (!samples.length) return 0
  let sum = 0
  for (let index = 0; index < samples.length; index += 1) {
    sum += samples[index] * samples[index]
  }
  return Math.sqrt(sum / samples.length)
}

function gatewayVoiceState(event) {
  if (event?.type === GatewayServerEvent.VOICE_STATE) {
    return event.state === 'processing' ? 'thinking' : event.state
  }
  if (event?.type === GatewayServerEvent.AGENT_ACTIVITY) return 'thinking'
  if (String(event?.type || '').startsWith('task.') && !TASK_TERMINAL_EVENTS.has(event.type)) {
    return 'thinking'
  }
  return null
}

function taskProgressFromEvent(event) {
  const type = String(event?.type || '')
  if (!type.startsWith('task.')) return null
  const status = event.task?.status || event.status
  const state = String(status?.state || '').replace('TASK_STATE_', '').toLowerCase()
  const message = status?.message?.parts
    ?.filter(part => part?.content?.$case === 'text')
    .map(part => part.content.value)
    .join(' ')
    .trim() || ''
  return { type, state, message }
}

export default function useVoiceSession({
  muted,
  clientId,
  clientLabel = '晚晴照护终端',
  onVoiceMessage,
}) {
  const [voiceState, setVoiceState] = useState('idle')
  const [inputLevel, setInputLevel] = useState(0)
  const [outputLevel, setOutputLevel] = useState(0)
  const [progress, setProgress] = useState(null)
  const [error, setError] = useState(null)
  const [connectionError, setConnectionError] = useState(null)
  const clientRef = useRef(null)
  const audioContextRef = useRef(null)
  const audioReadyRef = useRef(null)
  const mediaRequestRef = useRef(null)
  const inputSampleRateRef = useRef(INPUT_SAMPLE_RATE)
  const mutedRef = useRef(muted)
  const publishedMutedRef = useRef(null)
  const onVoiceMessageRef = useRef(onVoiceMessage)
  const progressSeenRef = useRef(new Set())
  const progressTimerRef = useRef(null)
  const playbackRef = useRef({
    cursor: 0,
    sources: new Set(),
    counts: new Map(),
    started: new Set(),
    done: new Set(),
    startTimers: new Map(),
  })

  const publishMutedState = useCallback((nextMuted, client = clientRef.current) => {
    mutedRef.current = nextMuted
    publishedMutedRef.current = publishCareVoiceIntent(
      client,
      nextMuted,
      publishedMutedRef.current,
    )
    return publishedMutedRef.current === nextMuted
  }, [])

  useEffect(() => { publishMutedState(muted) }, [muted, publishMutedState])
  useEffect(() => { onVoiceMessageRef.current = onVoiceMessage }, [onVoiceMessage])

  const sendPlaybackReceipt = useCallback((type, responseId, reason = '') => {
    if (!responseId) return
    clientRef.current?.send({
      type,
      responseId,
      ...(reason ? { reason } : {}),
    })
  }, [])

  const finishResponsePlayback = useCallback((responseId) => {
    const playback = playbackRef.current
    if (
      !playback.done.has(responseId)
      || !playback.started.has(responseId)
      || (playback.counts.get(responseId) || 0) > 0
    ) return
    sendPlaybackReceipt(GatewayClientEvent.PLAYBACK_ENDED, responseId)
    playback.done.delete(responseId)
    playback.started.delete(responseId)
    playback.counts.delete(responseId)
    if (!playback.counts.size) {
      setOutputLevel(0)
      setVoiceState('idle')
    }
  }, [sendPlaybackReceipt])

  const clearPlayback = useCallback((reason = '') => {
    const playback = playbackRef.current
    const responseIds = new Set([
      ...playback.counts.keys(),
      ...playback.started,
      ...playback.done,
    ])
    for (const timer of playback.startTimers.values()) clearTimeout(timer)
    for (const source of playback.sources) {
      try { source.stop() } catch { /* source already ended */ }
      try { source.disconnect() } catch { /* source already disconnected */ }
    }
    for (const responseId of responseIds) {
      sendPlaybackReceipt(GatewayClientEvent.PLAYBACK_CANCELLED, responseId, reason)
    }
    playbackRef.current = {
      cursor: audioContextRef.current?.currentTime || 0,
      sources: new Set(),
      counts: new Map(),
      started: new Set(),
      done: new Set(),
      startTimers: new Map(),
    }
    setOutputLevel(0)
  }, [sendPlaybackReceipt])

  const playPcmAudio = useCallback((audioBase64, sampleRate, responseId) => {
    const context = audioContextRef.current
    const unavailableReason = playbackUnavailableReason({
      context,
      muted: mutedRef.current,
    })
    if (unavailableReason) {
      sendPlaybackReceipt(
        GatewayClientEvent.PLAYBACK_CANCELLED,
        responseId,
        unavailableReason,
      )
      setOutputLevel(0)
      setVoiceState(current => current === 'speaking' ? 'idle' : current)
      return
    }
    try {
      const samples = base64Pcm16ToFloat32(audioBase64)
      const buffer = context.createBuffer(1, samples.length, sampleRate || OUTPUT_SAMPLE_RATE)
      buffer.copyToChannel(samples, 0)
      const source = context.createBufferSource()
      source.buffer = buffer
      source.connect(context.destination)
      const playback = playbackRef.current
      const startAt = Math.max(context.currentTime + 0.02, playback.cursor)
      playback.cursor = startAt + buffer.duration
      playback.sources.add(source)
      playback.counts.set(responseId, (playback.counts.get(responseId) || 0) + 1)
      if (!playback.started.has(responseId) && !playback.startTimers.has(responseId)) {
        const timer = setTimeout(() => {
          const current = playbackRef.current
          current.startTimers.delete(responseId)
          if (!current.counts.has(responseId) || current.started.has(responseId)) return
          current.started.add(responseId)
          sendPlaybackReceipt(GatewayClientEvent.PLAYBACK_STARTED, responseId)
        }, Math.max(0, (startAt - context.currentTime) * 1000))
        playback.startTimers.set(responseId, timer)
      }
      source.addEventListener('ended', () => {
        const current = playbackRef.current
        current.sources.delete(source)
        current.counts.set(responseId, Math.max(0, (current.counts.get(responseId) || 0) - 1))
        try { source.disconnect() } catch { /* source already disconnected */ }
        finishResponsePlayback(responseId)
      })
      source.start(startAt)
      setOutputLevel(Math.min(1, rmsLevel(samples) / 0.18))
      setVoiceState('speaking')
    } catch (reason) {
      sendPlaybackReceipt(GatewayClientEvent.PLAYBACK_CANCELLED, responseId, 'playback_error')
      setError(reason?.message || '语音播放失败')
      setVoiceState('error')
    }
  }, [finishResponsePlayback, sendPlaybackReceipt])

  const activateVoice = useCallback(() => {
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('当前浏览器不支持麦克风采集')
      }
      const AudioContextClass = window.AudioContext || window.webkitAudioContext
      const activation = activateAudioContext({
        current: audioContextRef.current,
        AudioContextClass,
      })
      audioContextRef.current = activation.context
      audioReadyRef.current = activation.ready
      const mediaRequest = navigator.mediaDevices.getUserMedia({
        audio: AUDIO_CAPTURE_CONSTRAINTS,
      })
      mediaRequestRef.current = mediaRequest
      // 借用户点击的激活态立即发布 unmute 意图；麦克风授权稍后完成也不阻塞。
      publishMutedState(false)
      activation.ready.catch(() => {})
      mediaRequest.catch(() => {})
      setError(null)
      return true
    } catch (reason) {
      setError(reason?.message || '语音启用失败')
      setVoiceState('error')
      return false
    }
  }, [publishMutedState])

  const deactivateVoice = useCallback(() => {
    publishMutedState(true)
  }, [publishMutedState])

  useEffect(() => {
    const handleEvent = (event) => {
      const state = gatewayVoiceState(event)
      if (state) setVoiceState(state)
      if (event.type === GatewayServerEvent.VOICE_READY && event.inputSampleRate) {
        inputSampleRateRef.current = event.inputSampleRate
        setError(null)
      } else if (event.type === GatewayServerEvent.AUDIO_DELTA) {
        playPcmAudio(event.audio, event.sampleRate, event.responseId)
      } else if (event.type === GatewayServerEvent.AUDIO_DONE) {
        const playback = playbackRef.current
        if (!playback.started.has(event.responseId)) {
          playback.started.add(event.responseId)
          sendPlaybackReceipt(GatewayClientEvent.PLAYBACK_STARTED, event.responseId)
        }
        playback.done.add(event.responseId)
        finishResponsePlayback(event.responseId)
      } else if (event.type === GatewayServerEvent.PLAYBACK_CLEAR) {
        clearPlayback(event.reason || 'gateway_clear')
      } else if (
        event.type === GatewayServerEvent.TRANSCRIPT_DELTA
        || event.type === GatewayServerEvent.TRANSCRIPT_FINAL
      ) {
        onVoiceMessageRef.current?.({
          role: event.role,
          content: event.content,
          responseId: event.responseId,
          turnId: event.turnId,
          delta: event.type === GatewayServerEvent.TRANSCRIPT_DELTA,
          final: event.type === GatewayServerEvent.TRANSCRIPT_FINAL,
        })
      } else if (event.type === GatewayServerEvent.ERROR) {
        setError(event.message || '语音服务错误')
        setVoiceState('error')
      }
      const nextProgress = taskProgressFromEvent(event)
      if (nextProgress) {
        const key = `${nextProgress.type}#${nextProgress.state}#${nextProgress.message}`
        if (!progressSeenRef.current.has(key)) {
          progressSeenRef.current.add(key)
          setProgress(nextProgress)
          onVoiceMessageRef.current?.({ role: 'assistant', progress: nextProgress })
          if (TASK_TERMINAL_EVENTS.has(nextProgress.type)) {
            clearTimeout(progressTimerRef.current)
            progressTimerRef.current = setTimeout(() => setProgress(null), 2500)
          }
        }
      }
    }

    const client = new GatewayClient({
      url: gatewayWsUrl(clientId),
      createSocket: url => new WebSocket(url),
      clientType: 'web',
      clientVersion: '2.0.0',
      clientInstanceId: clientId,
      clientLabel,
      capabilities: [
        GatewayClientCapability.INPUT_AUDIO,
        GatewayClientCapability.INPUT_TEXT,
        GatewayClientCapability.PLAYBACK_RECEIPTS,
        GatewayClientCapability.TASK_COMMANDS,
        GatewayClientCapability.PERMISSION_RESPOND,
        GatewayClientCapability.CONVERSATION_HISTORY,
        GatewayClientCapability.SESSION_REPLAY,
      ],
      locale: navigator.language,
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      configure: () => careVoiceConnectionMode(mutedRef.current),
      onEvent: handleEvent,
      onStatus: status => {
        if (status.state === 'ready') {
          publishedMutedRef.current = mutedRef.current
        } else if (['connecting', 'disconnected', 'unavailable'].includes(status.state)) {
          publishedMutedRef.current = null
        }
        const nextConnectionError = careConnectionError(status.state)
        if (nextConnectionError === undefined) return
        setConnectionError(nextConnectionError)
        if (nextConnectionError) {
          setVoiceState('error')
        } else {
          setVoiceState(current => current === 'error' ? 'idle' : current)
        }
      },
    })
    clientRef.current = client
    client.start()
    return () => {
      clearTimeout(progressTimerRef.current)
      clearPlayback('connection_closed')
      client.stop()
      if (clientRef.current === client) clientRef.current = null
    }
  }, [clearPlayback, clientId, clientLabel, finishResponsePlayback, playPcmAudio, sendPlaybackReceipt])

  useEffect(() => {
    if (muted) {
      const frame = requestAnimationFrame(() => {
        setInputLevel(0)
        setOutputLevel(0)
        setVoiceState('idle')
        clearPlayback('client_muted')
      })
      return () => cancelAnimationFrame(frame)
    }

    let disposed = false
    let frame = 0
    let media = null
    let source = null
    let analyser = null
    let processor = null
    let lastVoiceAt = 0

    const start = async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error('当前浏览器不支持麦克风采集')
        }
        const pendingMedia = mediaRequestRef.current
        mediaRequestRef.current = null
        media = await (pendingMedia || navigator.mediaDevices.getUserMedia({
          audio: AUDIO_CAPTURE_CONSTRAINTS,
        }))
        if (disposed) {
          media.getTracks().forEach(track => track.stop())
          return
        }
        let context = audioContextRef.current
        let audioReady = audioReadyRef.current
        if (!context || !audioReady) {
          const AudioContextClass = window.AudioContext || window.webkitAudioContext
          const activation = activateAudioContext({
            current: context,
            AudioContextClass,
          })
          context = activation.context
          audioReady = activation.ready
          audioContextRef.current = context
          audioReadyRef.current = audioReady
        }
        await audioReady
        analyser = context.createAnalyser()
        analyser.fftSize = 512
        source = context.createMediaStreamSource(media)
        source.connect(analyser)
        processor = context.createScriptProcessor(2048, 1, 1)
        processor.onaudioprocess = event => {
          const activeClient = clientRef.current
          if (!activeClient?.ready || mutedRef.current) return
          const samples = resampleLinear(
            event.inputBuffer.getChannelData(0),
            context.sampleRate,
            inputSampleRateRef.current,
          )
          activeClient.send({
            type: GatewayClientEvent.AUDIO_APPEND,
            audio: floatToPcm16Base64(samples),
          })
        }
        source.connect(processor)
        processor.connect(context.destination)
        setError(null)

        const data = new Float32Array(analyser.fftSize)
        const tick = () => {
          analyser.getFloatTimeDomainData(data)
          const level = rmsLevel(data)
          const now = performance.now()
          setInputLevel(Math.min(1, level / 0.18))
          if (level > SPEECH_THRESHOLD) {
            lastVoiceAt = now
            setVoiceState(current => current === 'idle' ? 'listening' : current)
          } else if (now - lastVoiceAt > 900) {
            setVoiceState(current => current === 'listening' ? 'idle' : current)
          }
          frame = requestAnimationFrame(tick)
        }
        frame = requestAnimationFrame(tick)
      } catch (reason) {
        media?.getTracks().forEach(track => track.stop())
        if (!disposed) {
          setInputLevel(0)
          setVoiceState('error')
          setError(reason?.message || '麦克风不可用')
        }
      }
    }
    start()

    return () => {
      disposed = true
      cancelAnimationFrame(frame)
      processor?.disconnect()
      source?.disconnect()
      media?.getTracks().forEach(track => track.stop())
    }
  }, [clearPlayback, muted])

  useEffect(() => () => {
    audioContextRef.current?.close()
    audioContextRef.current = null
    audioReadyRef.current = null
    mediaRequestRef.current = null
  }, [])

  const sendInput = useCallback((parts) => (
    clientRef.current?.send({ type: GatewayClientEvent.INPUT_MESSAGE, parts }) === true
  ), [])

  return {
    voiceState,
    inputLevel,
    outputLevel,
    progress,
    error: connectionError || error,
    activateVoice,
    deactivateVoice,
    sendInput,
  }
}
