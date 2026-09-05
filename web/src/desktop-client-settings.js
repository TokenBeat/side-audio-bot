import { resolveOrbSkinId } from '../../shared/orb-skin-catalog.mjs'
import {
  desktopAutoHideSeconds,
  desktopWakeWordEnabled,
} from './desktop-hide.js'

// orbBloub 外观参数：URL 首次加载时读，后续热应用时由 IPC 推送覆盖。
// autoState 默认 true（自动按状态变形），fixedShape 默认 false（不固定形状）。
function readBloubSettings(search = '') {
  const params = new URLSearchParams(search)
  return {
    orbBloubShape: params.get('orbBloubShape') || '',
    orbBloubColor: params.get('orbBloubColor') || '',
    orbBloubExpression: params.get('orbBloubExpression') || '',
    orbBloubAutoState: params.get('orbBloubAutoState') !== 'false',
    orbBloubFixedShape: params.get('orbBloubFixedShape') === 'true',
  }
}

export function initialDesktopClientSettings(search = '') {
  const params = new URLSearchParams(search)
  return {
    orbSkinId: resolveOrbSkinId({
      orbSkin: params.get('orbSkin'),
      orbStyle: params.get('orbStyle'),
    }),
    autoHideSeconds: desktopAutoHideSeconds(search),
    wakeWordEnabled: desktopWakeWordEnabled(search),
    language: params.get('lang') || '',
    ...readBloubSettings(search),
  }
}

export function applyDesktopClientSettings(current, update = {}) {
  return {
    orbSkinId: update.orbSkin
      ? resolveOrbSkinId({ orbSkin: update.orbSkin })
      : current.orbSkinId,
    autoHideSeconds: Number.isFinite(update.autoHideSeconds)
      ? update.autoHideSeconds
      : current.autoHideSeconds,
    wakeWordEnabled: typeof update.wakeWordEnabled === 'boolean'
      ? update.wakeWordEnabled
      : current.wakeWordEnabled,
    language: update.language || current.language,
    // orbBloub 外观热应用：仅当 IPC 推送了新值才覆盖，未推送字段保留现状。
    orbBloubShape: update.orbBloubShape ?? current.orbBloubShape,
    orbBloubColor: update.orbBloubColor ?? current.orbBloubColor,
    orbBloubExpression: update.orbBloubExpression ?? current.orbBloubExpression,
    orbBloubAutoState: typeof update.orbBloubAutoState === 'boolean'
      ? update.orbBloubAutoState
      : current.orbBloubAutoState,
    orbBloubFixedShape: typeof update.orbBloubFixedShape === 'boolean'
      ? update.orbBloubFixedShape
      : current.orbBloubFixedShape,
  }
}
