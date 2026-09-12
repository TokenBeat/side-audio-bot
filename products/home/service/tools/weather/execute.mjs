import { toolResult } from '../shared.mjs'

export function executeWeatherTool(name, args, context) {
  const { homeId, store } = context
  const before = store.snapshot(homeId)
  return toolResult(
    `今天${before.weather.summary}，空气质量${before.weather.airQuality}。早晚偏凉，出门加件外套。`,
    before,
    false,
    { weather: before.weather },
  )
}
