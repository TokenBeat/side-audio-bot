import { clean, reportActivity, toolResult } from '../shared.mjs'

const CHANNELS = [
  { match: /(豫剧|梆子)/u, channel: '豫剧选段' },
  { match: /(京剧|京戏)/u, channel: '京剧经典' },
  { match: /(评书|相声)/u, channel: '单田芳评书' },
  { match: /(音乐|歌|曲)/u, channel: '怀旧金曲' },
]

export function executeMediaTool(name, args, context) {
  const { homeId, store, onActivity } = context
  const action = clean(args.action) || 'play'

  if (action === 'stop') {
    store.setMedia(homeId, { playing: false })
    reportActivity(onActivity, 'media', 'stopped', '已停止播放')
    return toolResult('好的，先不放了，想听随时说一声。', store.snapshot(homeId), true, { playing: false })
  }

  const query = clean(args.query)
  const matched = CHANNELS.find(item => item.match.test(query)) || { channel: query || '经典戏曲' }
  store.setMedia(homeId, { playing: true, channel: matched.channel })
  reportActivity(onActivity, 'media', 'playing', `开始播放 ${matched.channel}`)
  return toolResult(
    `好，给您放${matched.channel}。想换或想停，随时跟我说。`,
    store.snapshot(homeId),
    true,
    { playing: true, channel: matched.channel },
  )
}
