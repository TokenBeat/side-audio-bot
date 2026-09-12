import { clean, reportActivity, toolResult } from '../shared.mjs'

const CHANNELS = [
  { match: /(豫剧|梆子)/u, channel: '豫剧选段', station: '戏曲频道' },
  { match: /(京剧|京戏)/u, channel: '京剧经典', station: '戏曲频道' },
  { match: /(评书|相声)/u, channel: '单田芳评书', station: '曲艺频道' },
  { match: /(黄梅戏)/u, channel: '黄梅戏精选', station: '戏曲频道' },
  { match: /(音乐|歌|曲)/u, channel: '怀旧金曲', station: '音乐频道' },
]

export function executeMediaTool(name, args, context) {
  const { careId, store, onActivity } = context
  const action = clean(args.action) || 'play'

  if (action === 'stop') {
    store.setMedia(careId, { playing: false })
    reportActivity(onActivity, 'media', 'stopped', '已停止播放')
    return toolResult('好的，先不放了，想听随时说一声。', store.snapshot(careId), true, { playing: false })
  }

  const query = clean(args.query)
  const matched = CHANNELS.find(item => item.match.test(query)) || {
    channel: query || '经典戏曲',
    station: '戏曲频道',
  }
  store.setMedia(careId, { playing: true, channel: matched.channel, station: matched.station })
  reportActivity(onActivity, 'media', 'playing', `开始播放 ${matched.channel}`)
  return toolResult(
    `好，给您放${matched.channel}，音量适中。想换或想停，随时跟我说。`,
    store.snapshot(careId),
    true,
    { playing: true, channel: matched.channel },
  )
}
