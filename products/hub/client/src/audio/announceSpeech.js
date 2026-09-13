// 终端自动语音播报：提醒、呼叫反馈、问安、SOS 反馈全部开口说，不依赖老人看字。
// 使用系统级中文语音（确定性、离线可用）；与实时助手并存——对话是真人在聊，
// 播报是终端主动开口，这是产品"主动式"的关键。
let cachedVoice = null

function pickVoice() {
  if (!('speechSynthesis' in window)) return null
  const voices = speechSynthesis.getVoices()
  cachedVoice = voices.find(voice => /tingting|ting-ting|xiaoxiao|meijia|sinji/i.test(voice.name) && voice.lang.toLowerCase().startsWith('zh'))
    || voices.find(voice => voice.lang.toLowerCase().startsWith('zh'))
    || null
  return cachedVoice
}

if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
  speechSynthesis.onvoiceschanged = () => { cachedVoice = null }
}

export function speak(text, { rate = 0.92, pitch = 1.02 } = {}) {
  const content = String(text || '').trim()
  if (!content || !('speechSynthesis' in window)) return false
  try {
    const voice = cachedVoice || pickVoice()
    const utterance = new SpeechSynthesisUtterance(content)
    if (voice) utterance.voice = voice
    utterance.lang = 'zh-CN'
    utterance.rate = rate
    utterance.pitch = pitch
    utterance.volume = 1
    speechSynthesis.speak(utterance)
    return true
  } catch {
    return false
  }
}

// 预热：语音列表在部分浏览器是异步加载的，首次交互时触发一次枚举。
export function warmUpSpeech() {
  if (!('speechSynthesis' in window)) return
  pickVoice()
}
