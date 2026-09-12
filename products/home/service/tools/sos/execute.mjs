import { clean, reportActivity, toolResult } from '../shared.mjs'

export function executeSosTool(name, args, context) {
  const { homeId, store, onActivity } = context
  const action = clean(args.action) || 'query'

  if (action === 'trigger') {
    const before = store.snapshot(homeId)
    const reason = clean(args.reason) || '紧急求助'
    const sos = store.triggerSos(homeId, { reason, source: 'voice' })
    reportActivity(onActivity, 'sos', 'triggered', `${before.elder.name} ${reason} · 已通知${sos.notified[0]?.contact?.name || '家属'}`)
    const firstName = sos.notified[0]?.contact?.name || '家属'
    return toolResult(
      `您别急，我已经通知${firstName}了，保持电话畅通。`,
      store.snapshot(homeId),
      true,
      { sos },
    )
  }

  if (action === 'ack') {
    const sos = store.ackSos(homeId, clean(args.byName))
    if (!sos) return toolResult('当前没有进行中的求助。', store.snapshot(homeId), false)
    reportActivity(onActivity, 'sos', 'acknowledged', '家属已确认看到求助')
    return toolResult(
      `${sos.notified.find(entry => entry.ackAt)?.contact?.name || '家属'}已经看到了。`,
      store.snapshot(homeId),
      true,
      { sos },
    )
  }

  if (action === 'resolve') {
    store.resolveSos(homeId)
    reportActivity(onActivity, 'sos', 'resolved', '求助处理完毕')
    return toolResult('好，这次的求助处理完毕了。', store.snapshot(homeId), true, {})
  }

  const before = store.snapshot(homeId)
  const sos = before.sos
  return toolResult(
    sos && sos.status === 'active'
      ? `求助处理中：${sos.reason}，已通知 ${sos.notified.map(entry => entry.contact.name).join('、')}。`
      : '当前没有进行中的求助。',
    before,
    false,
    { sos: sos || null },
  )
}
