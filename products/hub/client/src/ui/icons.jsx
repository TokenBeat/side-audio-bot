// 统一图标出口：全部走 lucide-react（24 网格线性图标，currentColor）。
// 尺寸与描边在 CSS 中按 .icon 体系约束，禁止再新增 emoji 当功能图标。
import {
  Lightbulb, Snowflake, Blinds, Tv, Plug, Moon, MoonStar, DoorOpen, DoorClosed,
  Radio, Lock, LockOpen, Mic, MicOff, AudioLines, TriangleAlert, Cloud,
  ScrollText, ArrowUpRight, Footprints, Home, Clapperboard, Hand, Sparkles,
} from 'lucide-react'

export {
  Lightbulb, Snowflake, Blinds, Tv, Plug, Moon, MoonStar, DoorOpen, DoorClosed,
  Radio, Lock, LockOpen, Mic, MicOff, AudioLines, TriangleAlert, Cloud,
  ScrollText, ArrowUpRight, Footprints, Home, Clapperboard, Hand, Sparkles,
}

const DEVICE_ICONS = {
  light: Lightbulb,
  nightlight: MoonStar,
  ac: Snowflake,
  curtain: Blinds,
  media: Tv,
  tv: Tv,
}

export function DeviceIcon({ kind, ...props }) {
  const Component = DEVICE_ICONS[kind] || Plug
  return <Component {...props} />
}

// 场景图标：service 种子里 icon 是 emoji 文案，这里按场景 id/名称映射成统一线性图标。
const SCENE_ICONS = [
  { keys: ['home', '回家'], Component: Home },
  { keys: ['movie', 'cinema', '观影'], Component: Clapperboard },
  { keys: ['sleep', '睡'], Component: Moon },
  { keys: ['night', '起夜'], Component: Footprints },
  { keys: ['away', '离家'], Component: DoorOpen },
]

export function SceneIcon({ scene, ...props }) {
  const id = String(scene?.id || '')
  const name = String(scene?.name || '')
  const hit = SCENE_ICONS.find(item => item.keys.some(key => id.includes(key) || name.includes(key)))
  const Component = hit ? hit.Component : Sparkles
  return <Component {...props} />
}
