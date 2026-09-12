import { clean, reportActivity, toolResult } from '../shared.mjs'

export function executeCheckinTool(name, args, context) {
  const { homeId, store, onActivity } = context
  const mood = clean(args.mood) || '不错'
  const notes = clean(args.notes)
  store.completeCheckin(homeId, { mood, notes })
  reportActivity(onActivity, 'checkin', 'done',
    `问安完成 · 心情${mood}${notes ? ` · ${notes}` : ''}`)
  const respond = {
    不错: '好嘞，看您精神不错我就放心了。儿女那边我都说好了，您慢慢歇着。',
    一般: '好，要是觉得没精神，随时叫我陪您说说话。',
    '不太好': '哎，那您多歇歇，我已经跟孩子们说您今天有点累，让他们多陪陪您。',
  }
  return toolResult(
    respond[mood] || respond['不错'],
    store.snapshot(homeId),
    true,
    { mood, notes },
  )
}
