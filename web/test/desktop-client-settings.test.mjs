import assert from 'node:assert/strict'
import test from 'node:test'

import {
  applyDesktopClientSettings,
  initialDesktopClientSettings,
} from '../src/desktop-client-settings.js'

test('desktop client settings initialize from the desktop URL', () => {
  assert.deepEqual(initialDesktopClientSettings(
    '?orbSkin=firefly&autoHideSeconds=300&wakeWordEnabled=true&lang=en',
  ), {
    orbSkinId: 'firefly',
    autoHideSeconds: 300,
    wakeWordEnabled: true,
    language: 'en',
    orbBloubShape: '',
    orbBloubColor: '',
    orbBloubExpression: '',
    orbBloubAutoState: true,
    orbBloubFixedShape: false,
  })
})

test('desktop client settings hot-apply without replacing unrelated state', () => {
  const current = {
    orbSkinId: 'fluid',
    autoHideSeconds: 60,
    wakeWordEnabled: false,
    language: 'zh-CN',
    orbBloubShape: 'blob',
    orbBloubColor: 'blue',
    orbBloubExpression: 'happy',
    orbBloubAutoState: true,
    orbBloubFixedShape: false,
  }

  assert.deepEqual(applyDesktopClientSettings(current, {
    orbSkin: 'firefly',
    autoHideSeconds: 120,
    language: 'en',
  }), {
    orbSkinId: 'firefly',
    autoHideSeconds: 120,
    wakeWordEnabled: false,
    language: 'en',
    // 未推送的 orbBloub 字段全部保留原值
    orbBloubShape: 'blob',
    orbBloubColor: 'blue',
    orbBloubExpression: 'happy',
    orbBloubAutoState: true,
    orbBloubFixedShape: false,
  })
})

test('desktop client settings initialize orbBloub appearance from URL', () => {
  assert.deepEqual(initialDesktopClientSettings(
    '?orbBloubShape=blob&orbBloubColor=blue&orbBloubExpression=happy&orbBloubAutoState=false&orbBloubFixedShape=true',
  ).orbBloubShape, 'blob')
})

test('desktop client settings initialize orbBloub with defaults when URL params absent', () => {
  const settings = initialDesktopClientSettings('?orbSkin=firefly')
  assert.equal(settings.orbBloubShape, '')
  assert.equal(settings.orbBloubColor, '')
  assert.equal(settings.orbBloubExpression, '')
  assert.equal(settings.orbBloubAutoState, true)
  assert.equal(settings.orbBloubFixedShape, false)
})

test('orbBloub appearance hot-applies without replacing unrelated state', () => {
  const current = {
    orbSkinId: 'bloub-bot',
    autoHideSeconds: 60,
    wakeWordEnabled: false,
    language: 'zh-CN',
    orbBloubShape: 'blob',
    orbBloubColor: 'blue',
    orbBloubExpression: 'happy',
    orbBloubAutoState: true,
    orbBloubFixedShape: false,
  }

  // 只推 orbBloubColor 和 orbBloubFixedShape，其余字段保留
  const next = applyDesktopClientSettings(current, {
    orbBloubColor: 'green',
    orbBloubFixedShape: true,
  })

  assert.equal(next.orbBloubShape, 'blob', '未推送字段保留原值')
  assert.equal(next.orbBloubColor, 'green', '推送字段覆盖原值')
  assert.equal(next.orbBloubExpression, 'happy', '未推送字段保留原值')
  assert.equal(next.orbBloubAutoState, true, '未推送字段保留原值')
  assert.equal(next.orbBloubFixedShape, true, '推送字段覆盖原值')
})

test('orbBloub boolean coercion respects type-checked assignment', () => {
  const current = {
    orbSkinId: 'bloub-bot',
    autoHideSeconds: 60,
    wakeWordEnabled: false,
    language: 'zh-CN',
    orbBloubShape: '',
    orbBloubColor: '',
    orbBloubExpression: '',
    orbBloubAutoState: true,
    orbBloubFixedShape: false,
  }

  // 非布尔值不应覆盖布尔字段（保持当前值）
  const next = applyDesktopClientSettings(current, {
    orbBloubAutoState: 'true',
    orbBloubFixedShape: 1,
  })

  assert.equal(next.orbBloubAutoState, true, '字符串不应覆盖布尔字段')
  assert.equal(next.orbBloubFixedShape, false, '数字不应覆盖布尔字段')
})
