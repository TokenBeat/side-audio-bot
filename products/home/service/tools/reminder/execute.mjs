import { clean, reportActivity, toolResult } from '../shared.mjs'

export function executeReminderTool(name, args, context) {
  const { homeId, store, onActivity } = context

  if (name === 'reminder_query') {
    const before = store.snapshot(homeId)
    const lines = before.reminders.map(item => (
      `${item.time} ${item.name}${item.confirmedAt ? '（已确认）' : ''}（${item.note}）`
    ))
    return toolResult(
      lines.length ? `今天的安排：${lines.join('；')}。` : '今天没有特别的安排。',
      before,
      false,
      { reminders: before.reminders },
    )
  }

  const before = store.snapshot(homeId)
  const reminderName = clean(args.reminderName) || '提醒'
  const matched = store.confirmReminder(homeId, reminderName)
  if (!matched) {
    return toolResult('好，我记下来了。', before, false, {})
  }
  reportActivity(onActivity, 'reminder', 'confirmed', `${matched.name} 已确认`)
  return toolResult(
    `好，${matched.name}记下来啦，真棒。`,
    store.snapshot(homeId),
    true,
    { reminder: matched },
  )
}
