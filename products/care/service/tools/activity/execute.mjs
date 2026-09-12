import { clean, reportActivity, toolResult } from '../shared.mjs'

export function executeActivityTool(name, args, context) {
  const { careId, store, onActivity } = context

  if (name === 'activity_query') {
    const before = store.snapshot(careId)
    const lines = before.activities.map(activity => (
      `${activity.time} ${activity.title}（已报 ${activity.attendees.length} 人）`
    ))
    return toolResult(
      lines.length ? `最近的活动：${lines.join('；')}。` : '近期没有安排活动。',
      before,
      false,
      { activities: before.activities },
    )
  }

  const before = store.snapshot(careId)
  const residentName = clean(args.residentName)
    || before.rooms[0]?.resident.name
  const result = store.activitySignup(careId, clean(args.title), residentName)
  reportActivity(onActivity, 'activity', 'signup',
    `${residentName} 报名了 ${result.title}（已报 ${result.attendees} 人）`)
  return toolResult(
    `好，${residentName}报名${result.title}啦，记得提前几分钟到活动室。`,
    store.snapshot(careId),
    true,
    result,
  )
}
