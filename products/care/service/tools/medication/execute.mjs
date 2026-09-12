import { clean, reportActivity, toolResult } from '../shared.mjs'

export function executeMedicationTool(name, args, context) {
  const { careId, store, onActivity } = context
  const before = store.snapshot(careId)
  const roomId = clean(args.roomId) || before.rooms[0]?.id

  if (name === 'medication_plan_query') {
    const plan = before.medications[roomId]
    if (!plan) return toolResult('这个房间没有登记用药计划。', before, false)
    const lines = plan.items.map(item => `${item.time} ${item.name}（${item.note}）`)
    const today = new Date().toISOString().slice(0, 10)
    const confirmedToday = plan.confirmations.filter(item => item.date === today)
    const confirmText = confirmedToday.length
      ? `今天已在 ${confirmedToday.map(item => item.at.slice(11, 16)).join('、')} 确认过 ${confirmedToday.map(item => item.name).join('、')}。`
      : '今天还没有确认记录。'
    return toolResult(
      `用药计划：${lines.join('；')}。${confirmText}`,
      before,
      false,
      { plan: { roomId, items: plan.items, confirmations: confirmedToday } },
    )
  }

  const room = store.room(careId, roomId)
  const medicationName = clean(args.medicationName) || '药'
  const result = store.confirmMedication(careId, roomId, medicationName)
  reportActivity(onActivity, 'medication', 'confirmed',
    `${roomId} ${room?.resident.name || ''} 确认服用 ${medicationName}`)
  return toolResult(
    `好的，${medicationName}已经记下啦。多喝点温水，休息一会儿。`,
    store.snapshot(careId),
    true,
    { roomId, medicationName, confirmedAt: result.confirmedAt },
  )
}
