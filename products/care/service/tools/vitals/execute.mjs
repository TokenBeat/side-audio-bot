import { clean, reportActivity, toolResult } from '../shared.mjs'
import { latestVitalsOf, assessVital } from '../../state-store.mjs'

function formatPressure(entry) {
  return `${entry.systolic}/${entry.diastolic}`
}

function describeVital(kind, entry, assessment) {
  if (kind === 'bloodPressure') {
    return `血压 ${formatPressure(entry)}，${assessment.text}`
  }
  const unit = entry.unit || { bloodSugar: '', heartRate: ' 次/分', bloodOxygen: '%' }[kind] || ''
  return `${assessment.label} ${entry.value}${unit}，${assessment.text}`
}

export function executeVitalsTool(name, args, context) {
  const { careId, store, onActivity } = context
  const before = store.snapshot(careId)
  const roomId = clean(args.roomId) || before.rooms[0]?.id

  if (name === 'vitals_query') {
    const byDay = before.vitals[roomId]
    const latest = latestVitalsOf(byDay)
    const room = store.room(careId, roomId)
    if (!latest || !Object.keys(latest.measurements).length) {
      return toolResult(
        `${room?.resident.address || ''}今天还没有测量记录，等护理员来测过我就告诉您。`,
        before,
        false,
      )
    }
    const parts = []
    for (const [kind, entry] of Object.entries(latest.measurements)) {
      const assessment = assessVital(kind, entry)
      parts.push(describeVital(kind, entry, assessment))
    }
    const abnormal = parts.filter(text => /偏高|偏低|偏快/.test(text))
    const opening = abnormal.length
      ? '有两项要留意：'
      : '都挺正常：'
    return toolResult(
      `${opening}${parts.join('；')}。${abnormal.length ? '护理站已经看到了，会安排再测一次。' : '继续保持。'}`,
      before,
      false,
      { vitals: latest },
    )
  }

  // vitals_record：护理员或老人语音录入测量值
  const room = store.room(careId, roomId)
  const kind = clean(args.kind)
  const entry = {}
  if (kind === 'bloodPressure') {
    const systolic = Number(args.systolic)
    const diastolic = Number(args.diastolic)
    if (!Number.isFinite(systolic) || !Number.isFinite(diastolic)) {
      return toolResult('血压需要两个数，高压和低压，比如 135 85。请再说一遍好吗？', before, false)
    }
    entry.systolic = systolic
    entry.diastolic = diastolic
  } else if (kind === 'bloodSugar' || kind === 'heartRate' || kind === 'bloodOxygen' || kind === 'temperature') {
    const value = Number(args.value)
    if (!Number.isFinite(value)) {
      return toolResult('没有听清数值，请再说一遍好吗？', before, false)
    }
    entry.value = value
    if (kind === 'bloodSugar' && clean(args.stage)) entry.stage = clean(args.stage)
  } else {
    return toolResult(`暂不支持记录 ${kind || '该项'} 测量。`, before, false)
  }

  const result = store.recordVital(careId, { roomId, kind, entry })
  const spoken = kind === 'bloodPressure'
    ? `血压 ${formatPressure(entry)}，${result.assessment.text}`
    : `${result.label} ${entry.value}${result.unit}，${result.assessment.text}`
  reportActivity(onActivity, 'vitals',
    result.abnormal ? 'abnormal' : 'recorded',
    `${roomId} ${result.resident} ${spoken}${result.abnormal ? ' · 已预警' : ''}`)
  const abnormalAdvice = result.abnormal
    ? '这个数值要留意，我已经告诉护理站了，会安排再测一次。'
    : '记录好啦。'
  return toolResult(
    `${room?.resident.address || ''}的${spoken}。${abnormalAdvice}`,
    store.snapshot(careId),
    true,
    { ...result, spoken },
  )
}
