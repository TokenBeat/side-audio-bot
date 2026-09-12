import { toolResult } from '../shared.mjs'

export function executeStatusTool(name, args, context) {
  const { homeId, store } = context
  const before = store.snapshot(homeId)
  const today = before.checkin.today
  return toolResult(
    today.status === 'done'
      ? `都告诉您女儿啦：今早 ${today.at.slice(11, 16)} 问安过，心情${today.mood}。`
      : '今天的问安还没开始呢。',
    before,
    false,
    { checkin: today },
  )
}
