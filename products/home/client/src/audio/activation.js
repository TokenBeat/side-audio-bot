export function activateAudioContext({ current, AudioContextClass } = {}) {
  if (!AudioContextClass) {
    throw new Error('当前浏览器不支持实时语音播放')
  }

  const context = current?.state === 'closed'
    ? new AudioContextClass()
    : current || new AudioContextClass()
  // `resume()` 必须在用户点击的同步调用栈里执行，延迟到 React effect 会
  // 丢失浏览器用户激活态，导致 context 永远停在 suspended。
  const resumed = context.state === 'running'
    ? Promise.resolve()
    : context.resume()

  return {
    context,
    ready: Promise.resolve(resumed).then(() => {
      if (context.state !== 'running') {
        throw new Error('浏览器未允许启用语音，请再点一次麦克风')
      }
      return context
    }),
  }
}
