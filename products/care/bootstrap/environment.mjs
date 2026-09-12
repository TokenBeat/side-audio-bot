import { readFileSync } from 'node:fs'
import { parseEnv } from 'node:util'

const ENVIRONMENT_FILES = Object.freeze([
  new URL('../.env.local', import.meta.url),
  new URL('../../../.env.local', import.meta.url),
])

// 座舱同款环境装载：只填充未定义的变量，真实环境变量永远优先。
export function loadCareEnvironment(env = process.env) {
  const loaded = []
  for (const url of ENVIRONMENT_FILES) {
    let values
    try {
      values = parseEnv(readFileSync(url, 'utf8'))
    } catch (error) {
      if (error.code === 'ENOENT') continue
      throw error
    }
    for (const [key, value] of Object.entries(values)) {
      if (env[key] === undefined) env[key] = value
    }
    loaded.push(url)
  }
  return loaded
}
