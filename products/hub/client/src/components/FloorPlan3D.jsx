// 3D 户型主视觉：对标座舱 3D 车模（react-three-fiber）。
// 房间=圆角地块，选中浮起+描边高亮；灯光=真实点光源+灯泡发光球（亮度→光强）；
// 设备=发光指示柱（开=暖橙/青/紫，关=灰）；场景激活时客厅泛暖光。点击房间选中。
// 中文标签用 drei Html 贴合（不依赖外部字体资源）。
import { Suspense, useMemo, useRef } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { RoundedBox, Html, OrbitControls } from '@react-three/drei'
import * as THREE from 'three'

// 平面布局（SVG 坐标系，590x440）→ 3D 世界坐标（米），原点移到中心
const ROOM_LAYOUT = {
  living: { x: 24, y: 60, w: 300, h: 250, label: '客厅' },
  bedroom: { x: 344, y: 60, w: 220, h: 190, label: '卧室' },
  kitchen: { x: 344, y: 262, w: 220, h: 148, label: '厨房' },
}
const SCALE = 1 / 140
const toWorld = layout => ({
  cx: (layout.x + layout.w / 2 - 295) * SCALE,
  cz: (layout.y + layout.h / 2 - 220) * SCALE,
  w: layout.w * SCALE,
  d: layout.h * SCALE,
})

const DEVICE_COLORS = {
  light: '#ffb35c',
  nightlight: '#ffd08a',
  ac: '#5fc4e0',
  curtain: '#b8c46a',
  media: '#b08ae0',
  tv: '#b08ae0',
}

function DeviceMarker({ position, kind, on }) {
  const ref = useRef(null)
  const color = on ? (DEVICE_COLORS[kind] || '#e8722a') : '#9a938c'
  useFrame((frameState, delta) => {
    if (!ref.current) return
    const material = ref.current.material
    const target = on ? 0.95 : 0.18
    material.emissiveIntensity += (target - material.emissiveIntensity) * Math.min(1, delta * 4)
  })
  return (
    <group position={position}>
      <mesh ref={ref}>
        <cylinderGeometry args={[0.055, 0.055, 0.34, 20]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.9} roughness={0.35} />
      </mesh>
    </group>
  )
}

function RoomSlab({ roomId, layout, selected, onSelect, children }) {
  const group = useRef(null)
  const { cx, cz, w, d } = useMemo(() => toWorld(layout), [layout])
  const lift = selected ? 0.16 : 0
  useFrame((frameState, delta) => {
    if (!group.current) return
    const currentY = group.current.position.y
    const nextY = currentY + (lift - currentY) * Math.min(1, delta * 7)
    group.current.position.y = nextY
  })
  return (
    <group
      ref={group}
      position={[cx, 0, cz]}
      onClick={event => { event.stopPropagation(); onSelect(roomId) }}
    >
      <RoundedBox args={[w, 0.22, d]} radius={0.09} smoothness={4}>
        <meshStandardMaterial
          color={selected ? '#fff0dd' : '#fffdf6'}
          roughness={0.6}
          metalness={0.02}
        />
      </RoundedBox>
      {/* 描边：选中=晨光橙，其余=细灰 */}
      <lineSegments position={[0, 0.121, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <edgesGeometry args={[new THREE.PlaneGeometry(w, d)]} />
        <lineBasicMaterial color={selected ? '#e8722a' : '#b6ab9c'} transparent opacity={selected ? 0.95 : 0.4} />
      </lineSegments>
      <Html position={[-w / 2 + 0.32, 0.3, -d / 2 + 0.28]} center>
        <span className="f3d-label">{layout.label}</span>
      </Html>
      {children}
    </group>
  )
}

function LightGlow({ position, brightness }) {
  const intensity = 0.4 + (brightness || 40) * 0.022
  return (
    <>
      <pointLight position={[position[0], 1.15, position[2]]} color="#ffca7a" intensity={intensity} distance={2.6} decay={2} />
      <mesh position={[position[0], 0.62, position[2]]}>
        <sphereGeometry args={[0.1, 20, 20]} />
        <meshStandardMaterial color="#ffd9a0" emissive="#ffca7a" emissiveIntensity={1.7} roughness={0.3} />
      </mesh>
    </>
  )
}

function FloorScene({ state, selected, onSelect }) {
  const devices = state?.devices || {}
  const activeScene = state?.scenes?.find(scene => scene.id === state?.activeScene)
  return (
    <group position={[0, 0, 0]}>
      <ambientLight intensity={1.15} />
      <directionalLight position={[3.2, 5, 2.4]} intensity={1.7} color="#fff4e4" />
      <directionalLight position={[-3, 3, -2.5]} intensity={0.5} color="#ffe3c2" />
      {/* 地台底座 */}
      <RoundedBox args={[4.6, 0.1, 3.6]} radius={0.06} smoothness={4} position={[0, -0.16, 0]}>
        <meshStandardMaterial color="#f3ecdf" roughness={0.85} />
      </RoundedBox>

      {Object.entries(ROOM_LAYOUT).map(([roomId, layout]) => {
        const { cx, cz, w, d } = toWorld(layout)
        const roomDevices = Object.entries(devices).filter(([, device]) => device.room === roomId)
        return (
          <RoomSlab key={roomId} roomId={roomId} layout={layout} selected={selected === roomId} onSelect={onSelect}>
            {roomDevices.map(([id, device], index) => {
              const px = -w / 2 + 0.42 + (index % 4) * 0.46
              const pz = d / 2 - 0.42
              const on = device.on !== false
              const kind = device.kind === 'tv' ? 'media' : device.kind
              return (
                <DeviceMarker key={id} kind={kind} on={on} position={[px, 0.38, pz]} />
              )
            })}
            {roomDevices.filter(([, device]) => (device.kind === 'light' || device.kind === 'nightlight') && device.on).map(([id, device]) => {
              const px = -w / 2 + 0.42 + (id === 'nightlight' ? 0.46 : 0)
              const pz = -d / 2 + 0.62
              return <LightGlow key={`${id}-glow`} brightness={device.brightness} position={[px, 0, pz]} />
            })}
            {/* 场景暖光：激活场景时客厅泛橙光 */}
            {activeScene && roomId === 'living' && (
              <pointLight position={[0, 1.4, 0]} color="#ffb066" intensity={1.15} distance={2.8} decay={2} />
            )}
          </RoomSlab>
        )
      })}
    </group>
  )
}

export default function FloorPlan3D({ state, selected, onSelect, height = 330 }) {
  return (
    <div className="floorplan3d-wrap" style={{ height }}>
      <Canvas
        camera={{ position: [0, 4.4, 4.6], fov: 40 }}
        dpr={[1, 2]}
        gl={{ alpha: true, antialias: true }}
      >
        <Suspense fallback={null}>
          <FloorScene state={state} selected={selected} onSelect={onSelect} />
          <OrbitControls
            enablePan={false}
            enableZoom={false}
            minPolarAngle={Math.PI / 5}
            maxPolarAngle={Math.PI / 2.6}
            minAzimuthAngle={-Math.PI / 10}
            maxAzimuthAngle={Math.PI / 10}
            target={[0, 0, 0]}
          />
        </Suspense>
      </Canvas>
    </div>
  )
}
