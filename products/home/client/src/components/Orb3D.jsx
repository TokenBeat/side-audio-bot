// 晚晴 3D 陪伴球：对标座舱 3D 车模的主视觉。
// 暖色渐变球体 + 菲涅尔边缘光 + 柔和浮动；音量驱动呼吸缩放，
// 状态驱动色相与光环：待机=暖橙，聆听=扩散涟漪，思考=慢转光环，播报=波纹。
import { Suspense, useRef } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { Float } from '@react-three/drei'
import * as THREE from 'three'

function CompanionOrb({ state, level, speakingLevel }) {
  const coreRef = useRef(null)
  const haloRef = useRef(null)
  const ringGroupRef = useRef(null)
  const rippleRefs = useRef([])
  const levelRef = useRef(0)
  const targetColor = useRef(new THREE.Color('#f08c3a'))

  const stateColor = {
    idle: '#f08c3a',
    listening: '#e8722a',
    thinking: '#e8a23a',
    speaking: '#4fa876',
    error: '#d9432f',
  }[state] || '#f08c3a'

  useFrame((frameState, delta) => {
    levelRef.current += ((state === 'listening' ? level : speakingLevel) - levelRef.current) * Math.min(1, delta * 6)
    const breathe = 1 + levelRef.current * 0.22 + Math.sin(frameState.clock.elapsedTime * 1.4) * 0.015
    if (coreRef.current) {
      coreRef.current.scale.setScalar(breathe)
      targetColor.current.set(stateColor)
      coreRef.current.material.color.lerp(targetColor.current, Math.min(1, delta * 3))
    }
    if (haloRef.current) {
      haloRef.current.rotation.z += delta * (state === 'thinking' ? 0.8 : 0.18)
      const haloScale = 1 + levelRef.current * 0.1 + Math.sin(frameState.clock.elapsedTime * 1.1) * 0.02
      haloRef.current.scale.setScalar(haloScale)
      haloRef.current.material.color.lerp(targetColor.current, Math.min(1, delta * 3))
    }
    if (ringGroupRef.current) {
      ringGroupRef.current.rotation.y += delta * (state === 'thinking' ? 0.5 : 0.12)
      ringGroupRef.current.rotation.x = Math.sin(frameState.clock.elapsedTime * 0.4) * 0.28
      const ringActive = state === 'listening' || state === 'speaking' || state === 'thinking'
      ringGroupRef.current.children.forEach((child, index) => {
        const material = child.material
        const target = ringActive ? 0.5 - index * 0.12 : 0.14
        material.opacity += (target - material.opacity) * Math.min(1, delta * 4)
      })
    }
    if (state === 'speaking') {
      rippleRefs.current.forEach((ripple, index) => {
        if (!ripple) return
        const phase = (frameState.clock.elapsedTime * 0.9 + index * 0.33) % 1
        ripple.scale.setScalar(1.05 + phase * 0.9)
        ripple.material.opacity = (1 - phase) * 0.35
      })
    } else {
      rippleRefs.current.forEach(ripple => {
        if (ripple) ripple.material.opacity = 0
      })
    }
  })

  const rings = [
    { radius: 1.32, tube: 0.012 },
    { radius: 1.5, tube: 0.009 },
    { radius: 1.66, tube: 0.006 },
  ]

  return (
    <group>
      {/* 主体：暖色呼吸球 */}
      <mesh ref={coreRef}>
        <sphereGeometry args={[1, 64, 64]} />
        <meshStandardMaterial
          color="#f08c3a"
          roughness={0.28}
          metalness={0.05}
          emissive="#ff9d4d"
          emissiveIntensity={0.22}
        />
      </mesh>

      {/* 菲涅尔感外晕 */}
      <mesh ref={haloRef} scale={1.14}>
        <sphereGeometry args={[1, 48, 48]} />
        <meshBasicMaterial
          color="#f08c3a"
          transparent
          opacity={0.12}
          side={THREE.BackSide}
        />
      </mesh>

      {/* 轨道细环 */}
      <group ref={ringGroupRef}>
        {rings.map((ring, index) => (
          <mesh
            key={ring.radius}
            rotation={[Math.PI / 2.15 + index * 0.16, index * 0.4, 0]}
          >
            <torusGeometry args={[ring.radius, ring.tube, 12, 90]} />
            <meshBasicMaterial color="#f0a35c" transparent opacity={0.16} />
          </mesh>
        ))}
      </group>

      {/* 播报涟漪 */}
      {[1.3, 1.6, 1.9].map((radius, index) => (
        <mesh
          key={radius}
          ref={node => { rippleRefs.current[index] = node }}
        >
          <sphereGeometry args={[radius, 32, 32]} />
          <meshBasicMaterial color="#4fa876" transparent opacity={0} side={THREE.BackSide} />
        </mesh>
      ))}
    </group>
  )
}

export default function Orb3D({ state = 'idle', level = 0, speakingLevel = 0, height = 340 }) {
  return (
    <div className="orb3d-wrap" style={{ height }}>
      <Canvas
        camera={{ position: [0, 0.35, 4.6], fov: 38 }}
        dpr={[1, 2]}
        gl={{ alpha: true, antialias: true }}
      >
        <ambientLight intensity={0.85} />
        <directionalLight position={[3, 4, 5]} intensity={1.5} color="#fff4e4" />
        <directionalLight position={[-4, -2, -3]} intensity={0.5} color="#ffd9b0" />
        <Suspense fallback={null}>
          <Float speed={1.6} rotationIntensity={0.12} floatIntensity={0.55} floatingRange={[-0.06, 0.08]}>
            <CompanionOrb state={state} level={level} speakingLevel={speakingLevel} />
          </Float>
        </Suspense>
      </Canvas>
    </div>
  )
}
