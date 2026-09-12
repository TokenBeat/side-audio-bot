import { clean, toolResult } from '../shared.mjs'

const STATE_LABELS = {
  safe: '平安',
  calling: '呼叫中',
  reminder: '有待确认提醒',
  offline: '终端离线',
}

export function executeRoomTool(name, args, context) {
  const { careId, store } = context
  const before = store.snapshot(careId)
  const roomId = clean(args.roomId)

  if (roomId) {
    const room = before.rooms.find(item => item.id === roomId)
    if (!room) return toolResult(`没有 ${roomId} 这个房间。`, before, false)
    const lastTicket = before.callTickets.find(item => item.roomId === roomId)
    return toolResult(
      `${room.id} ${room.resident.name}（${room.resident.address}，${room.resident.age} 岁）：${STATE_LABELS[room.state] || room.state}。`,
      before,
      false,
      { room, lastTicket: lastTicket || null },
    )
  }

  const summary = before.rooms.map(room => (
    `${room.id} ${room.resident.name} ${STATE_LABELS[room.state] || room.state}`
  )).join('；')
  const onDuty = before.duty.staff.filter(person => person.onDuty).map(person => person.name).join('、')
  return toolResult(
    `${before.floor} 共 ${before.rooms.length} 个房间：${summary}。当班：${onDuty}。`,
    before,
    false,
    { rooms: before.rooms, duty: before.duty },
  )
}
