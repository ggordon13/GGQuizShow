import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { prefersReducedMotion } from '../lib/hooks.js';

const BEAM_COLORS = ['#ff4d6d', '#ffb627', '#4d7cff', '#c084fc', '#2ec27e'];

const VERTEX_UV = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

/** Soft round dot used for marquee bulbs and sparkles. */
function glowTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.22, 'rgba(255,255,255,0.9)');
  g.addColorStop(0.55, 'rgba(255,255,255,0.18)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** Rotating rays behind the stage, like a classic TV game-show backdrop. */
function makeSunburst() {
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: {
      uAngle: { value: 0 },
      uInner: { value: new THREE.Color('#7c3aed') },
      uOuter: { value: new THREE.Color('#1a0b3d') },
    },
    vertexShader: VERTEX_UV,
    fragmentShader: /* glsl */ `
      uniform float uAngle;
      uniform vec3 uInner;
      uniform vec3 uOuter;
      varying vec2 vUv;
      void main() {
        vec2 p = vUv - 0.5;
        float r = length(p);
        float rays = smoothstep(-0.25, 0.25, sin(atan(p.y, p.x) * 14.0 + uAngle));
        float fade = smoothstep(0.5, 0.03, r);
        gl_FragColor = vec4(mix(uOuter, uInner, fade), fade * (0.1 + 0.2 * rays));
        #include <colorspace_fragment>
      }
    `,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(90, 90), material);
  mesh.position.set(0, 3, -30);
  return mesh;
}

/** A glowing grid floor with a pulse rippling out from centre stage. */
function makeFloor() {
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color('#a855f7') } },
    vertexShader: VERTEX_UV,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uColor;
      varying vec2 vUv;
      void main() {
        vec2 g = vUv * 48.0;
        vec2 grid = abs(fract(g - 0.5) - 0.5) / fwidth(g);
        float line = 1.0 - min(min(grid.x, grid.y), 1.0);
        float dist = length(vUv - vec2(0.5, 0.7));
        float fade = smoothstep(0.42, 0.04, dist);
        float pulse = 0.65 + 0.35 * sin(uTime * 2.5 - dist * 40.0);
        gl_FragColor = vec4(uColor, line * fade * 0.5 * pulse);
        #include <colorspace_fragment>
      }
    `,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(0, -7, -4);
  return mesh;
}

/** A spotlight cone with its apex at the origin, pointing down. Fades along its length and at its edges. */
function makeBeam(color) {
  const geometry = new THREE.ConeGeometry(1, 1, 40, 1, true);
  geometry.translate(0, -0.5, 0);
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    uniforms: { uColor: { value: new THREE.Color(color) }, uIntensity: { value: 0.4 } },
    vertexShader: /* glsl */ `
      varying float vAlong;
      varying vec3 vNormal;
      varying vec3 vView;
      void main() {
        vAlong = 1.0 + position.y; // 1 at the lamp, 0 at the far end
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vNormal = normalize(normalMatrix * normal);
        vView = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uIntensity;
      varying float vAlong;
      varying vec3 vNormal;
      varying vec3 vView;
      void main() {
        float edge = abs(dot(normalize(vNormal), normalize(vView)));
        float a = pow(clamp(vAlong, 0.0, 1.0), 1.4) * pow(edge, 1.6) * uIntensity;
        gl_FragColor = vec4(uColor, a);
        #include <colorspace_fragment>
      }
    `,
  });
  return new THREE.Mesh(geometry, material);
}

/**
 * Full-screen three.js game-show stage: sunburst backdrop, sweeping
 * spotlights, a marquee arch of chasing bulbs, a glowing floor and sparkles.
 * `energy` (0..1) speeds everything up: high for a live question, low for the lobby.
 */
export default function Background3D({ energy = 0.3 }) {
  const mountRef = useRef(null);
  const energyRef = useRef(energy);
  energyRef.current = energy;

  useEffect(() => {
    const mount = mountRef.current;
    const reduceMotion = prefersReducedMotion();
    const small = window.innerWidth < 700;

    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: !small, alpha: true, powerPreference: 'low-power' });
    } catch {
      return undefined; // No WebGL: the CSS gradient behind the canvas still looks fine.
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, small ? 1.5 : 2));
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(50, mount.clientWidth / mount.clientHeight, 0.1, 120);
    const cameraHome = new THREE.Vector3(0, 2, 18);
    camera.position.copy(cameraHome);

    const disposables = [];
    const track = (obj) => {
      disposables.push(obj.geometry, obj.material);
      scene.add(obj);
      return obj;
    };

    const sunburst = track(makeSunburst());
    const floor = track(makeFloor());

    // Stage rings on the floor.
    // Kept far back and faint so they sit behind the UI rather than through it.
    const rings = [
      { radius: 6, color: '#ffb627' },
      { radius: 8, color: '#ff4d6d' },
    ].map(({ radius, color }) => {
      const ring = track(
        new THREE.Mesh(
          new THREE.TorusGeometry(radius, 0.08, 8, 96),
          new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending }),
        ),
      );
      ring.rotation.x = Math.PI / 2;
      ring.position.set(0, -6.95, -20);
      return ring;
    });

    // Spotlights hanging above the top edge of the screen.
    const beamXs = small ? [-9, 0, 9] : [-16, -8, 0, 8, 16];
    const beams = beamXs.map((x, i) => {
      const beam = track(makeBeam(BEAM_COLORS[i % BEAM_COLORS.length]));
      beam.position.set(x, 14, -8);
      beam.scale.set(3.6, 30, 3.6);
      beam.rotation.x = 0.12;
      beam.userData = { base: -x * 0.025, phase: i * 1.7, speed: 0.8 + (i % 3) * 0.25 };
      return beam;
    });

    const glow = glowTexture();
    disposables.push(glow);

    // Marquee arch of light bulbs with a chasing pattern.
    const bulbCount = small ? 36 : 64;
    const bulbPositions = new Float32Array(bulbCount * 3);
    const bulbColors = new Float32Array(bulbCount * 3);
    for (let i = 0; i < bulbCount; i++) {
      const theta = (i / (bulbCount - 1)) * Math.PI;
      bulbPositions.set([-Math.cos(theta) * 16, -7 + Math.sin(theta) * 17, -12], i * 3);
    }
    const bulbGeometry = new THREE.BufferGeometry();
    bulbGeometry.setAttribute('position', new THREE.BufferAttribute(bulbPositions, 3));
    bulbGeometry.setAttribute('color', new THREE.BufferAttribute(bulbColors, 3));
    track(
      new THREE.Points(
        bulbGeometry,
        new THREE.PointsMaterial({
          size: small ? 1.3 : 1.1,
          map: glow,
          vertexColors: true,
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      ),
    );
    const bulbOn = new THREE.Color('#ffd27a');
    const bulbOff = new THREE.Color('#5a3a12');
    const bulbTmp = new THREE.Color();

    // Gold sparkles drifting up through the light.
    const sparkleCount = small ? 70 : 160;
    const sparklePositions = new Float32Array(sparkleCount * 3);
    for (let i = 0; i < sparkleCount; i++) {
      sparklePositions.set(
        [THREE.MathUtils.randFloat(-22, 22), THREE.MathUtils.randFloat(-7, 15), THREE.MathUtils.randFloat(-14, 4)],
        i * 3,
      );
    }
    const sparkleGeometry = new THREE.BufferGeometry();
    sparkleGeometry.setAttribute('position', new THREE.BufferAttribute(sparklePositions, 3));
    const sparkleMaterial = new THREE.PointsMaterial({
      size: 0.35,
      map: glow,
      color: '#ffe3a3',
      transparent: true,
      opacity: 0.8,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    track(new THREE.Points(sparkleGeometry, sparkleMaterial));

    const pointer = { x: 0, y: 0 };
    const onPointerMove = (e) => {
      pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
      pointer.y = (e.clientY / window.innerHeight) * 2 - 1;
    };
    window.addEventListener('pointermove', onPointerMove, { passive: true });

    const resize = new ResizeObserver(() => {
      const { clientWidth: w, clientHeight: h } = mount;
      if (!w || !h) return;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    });
    resize.observe(mount);

    const clock = new THREE.Clock();
    let speed = energyRef.current;
    let sweep = 0;
    let chase = 0;
    let frame = 0;
    const lookAt = new THREE.Vector3(0, -1.5, 0);

    const render = () => {
      frame = requestAnimationFrame(render);
      const dt = Math.min(clock.getDelta(), 0.05);
      speed += (energyRef.current - speed) * 0.03; // ease between energy levels
      const motion = reduceMotion ? 0.02 : speed;

      sweep += dt * (0.25 + motion * 1.3);
      chase += dt * (reduceMotion ? 0 : 3 + motion * 14);
      sunburst.material.uniforms.uAngle.value += dt * (0.05 + motion * 0.35);
      floor.material.uniforms.uTime.value += dt * (0.4 + motion * 1.6);

      for (const beam of beams) {
        const { base, phase, speed: s } = beam.userData;
        beam.rotation.z = base + Math.sin(sweep * s + phase) * 0.42;
        beam.material.uniforms.uIntensity.value = 0.26 + motion * 0.22;
      }

      rings.forEach((ring, i) => {
        ring.material.opacity = 0.15 + 0.25 * (0.5 + 0.5 * Math.sin(sweep * 3 + i * Math.PI));
      });

      // Every fourth bulb lit, stepping along the arch.
      for (let i = 0; i < bulbCount; i++) {
        const lit = ((((i - Math.floor(chase)) % 4) + 4) % 4) === 0;
        bulbTmp.copy(lit ? bulbOn : bulbOff).toArray(bulbColors, i * 3);
      }
      bulbGeometry.attributes.color.needsUpdate = true;

      for (let i = 0; i < sparkleCount; i++) {
        let y = sparklePositions[i * 3 + 1] + dt * (0.3 + motion * 1.2);
        if (y > 15) y = -7;
        sparklePositions[i * 3 + 1] = y;
      }
      sparkleGeometry.attributes.position.needsUpdate = true;
      sparkleMaterial.opacity = 0.55 + 0.25 * Math.sin(sweep * 4);

      camera.position.x += (cameraHome.x + pointer.x * 1.2 - camera.position.x) * 0.03;
      camera.position.y += (cameraHome.y - pointer.y * 0.6 - camera.position.y) * 0.03;
      camera.lookAt(lookAt);
      renderer.render(scene, camera);
    };
    render();

    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
      window.removeEventListener('pointermove', onPointerMove);
      disposables.forEach((d) => d.dispose());
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  return <div ref={mountRef} className="bg3d" aria-hidden="true" />;
}
