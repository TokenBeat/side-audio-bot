// 中控 API：现场（中控屏）与远程（/remote 页面）调用同一套服务端 API。
// 远程真实部署时，该基址走家庭网关的远程访问（Tailscale / 设备凭证），协议不变。
import { gatewayHttpUrl } from './config/gateway'

function serviceCommand(name, arguments_ = {}) {
  return fetch('/api/hub/commands', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, arguments: arguments_ }),
  }).then(response => response.json())
}

export function deviceControlApi(deviceId, arguments_ = {}) {
  return serviceCommand('device_control', { action: 'set', device: deviceId, ...arguments_ })
}

export function sceneApi(scene) {
  return serviceCommand('scene_activate', { scene })
}

export function sensorApi() {
  return serviceCommand('sensor_query')
}

export function hubStateApi() {
  return fetch(gatewayHttpUrl('/api/hub/state')).then(response => response.json())
}

export function motionApi(room) {
  return fetch('/api/hub/motion', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ room }),
  }).then(response => response.json())
}

export function doorApi(where, status) {
  return fetch('/api/hub/door', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ where, status }),
  }).then(response => response.json())
}
