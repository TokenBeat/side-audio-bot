import { clean, reportActivity, toolResult } from '../shared.mjs'

const URGENT_PATTERN = /(疼|痛|跌|摔|倒|胸闷|喘|呼救|救命|急救|不舒服|难受|头晕|吐)/u

function onDutyStaff(state) {
  const staff = state.duty.staff.find(person => person.onDuty && person.role !== '护士长')
  return staff?.name || '护理员'
}

export function executeCallTool(name, args, context) {
  const { careId, store, now, onActivity } = context
  const action = clean(args.action) || 'query'

  if (action === 'create') {
    const before = store.snapshot(careId)
    const room = store.room(careId, clean(args.roomId) || before.rooms[0]?.id)
    if (!room) return toolResult('找不到房间信息，请联系系统管理员', before, false)
    const urgency = args.urgency === 'urgent' || URGENT_PATTERN.test(clean(args.intent))
      ? 'urgent'
      : 'normal'
    const ticket = store.createCall(careId, {
      roomId: room.id,
      intent: clean(args.intent) || '呼叫护理员',
      urgency,
    })
    const staffName = onDutyStaff(before)
    reportActivity(onActivity, 'call', 'created',
      `${room.id} ${room.resident.name} 呼叫：${ticket.intent}（${urgency === 'urgent' ? '紧急' : '普通'}）`)
    reportActivity(onActivity, 'call', 'dispatched', `工单已派给 ${staffName}`)
    const etaText = urgency === 'urgent' ? '马上就到' : '几分钟内就到'
    return toolResult(
      `已经告诉${staffName}了，${etaText}。您先别着急。`,
      store.snapshot(careId),
      true,
      { ticket, staffName, room: room.id },
    )
  }

  if (action === 'accept') {
    const ticketId = clean(args.ticketId)
    const ticket = store.acceptCall(careId, ticketId, clean(args.staffName))
    reportActivity(onActivity, 'call', 'accepted',
      `${ticket.roomId} 工单已被 ${ticket.acceptedBy} 受理`)
    return toolResult(
      `${ticket.roomId} 的呼叫已由 ${ticket.acceptedBy} 受理。`,
      store.snapshot(careId),
      true,
      { ticket },
    )
  }

  if (action === 'complete') {
    const ticketId = clean(args.ticketId)
    const ticket = store.completeCall(careId, ticketId)
    reportActivity(onActivity, 'call', 'completed',
      `${ticket.roomId} 工单完成，响应 ${ticket.responseSeconds} 秒`)
    return toolResult(
      `${ticket.roomId} 的呼叫已完成。`,
      store.snapshot(careId),
      true,
      { ticket },
    )
  }

  const before = store.snapshot(careId)
  const ticketId = clean(args.ticketId)
  const ticket = ticketId
    ? before.callTickets.find(item => item.id === ticketId)
    : before.callTickets[0]
  return toolResult(
    ticket ? `工单 ${ticket.id}：${ticket.roomId} ${ticket.intent}，状态 ${ticket.status}` : '当前没有进行中的工单。',
    before,
    false,
    { ticket: ticket || null },
  )
}
