import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { ANSWER_STYLES } from '../lib/constants.js';
import { prefersReducedMotion } from '../lib/hooks.js';

const rand = (min, max) => min + Math.random() * (max - min);

/**
 * Full-screen three.js scene: the four answer shapes (cone, octahedron, torus,
 * cube) drifting upward through a starfield. `energy` (0..1) speeds everything
 * up. Higher energy suits a live question; lower suits the lobby.
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
    scene.fog = new THREE.Fog(0x1a0b3d, 14, 40);
    const camera = new THREE.PerspectiveCamera(55, mount.clientWidth / mount.clientHeight, 0.1, 100);
    camera.position.z = 16;

    scene.add(new THREE.AmbientLight(0xffffff, 0.9));
    const key = new THREE.DirectionalLight(0xffffff, 2.2);
    key.position.set(6, 10, 10);
    scene.add(key);
    const glow = new THREE.PointLight(0xb57bff, 120, 60);
    glow.position.set(-10, -6, 6);
    scene.add(glow);

    const geometries = [
      new THREE.ConeGeometry(0.9, 1.4, 3),
      new THREE.OctahedronGeometry(0.95),
      new THREE.TorusGeometry(0.62, 0.26, 14, 36),
      new THREE.BoxGeometry(1.1, 1.1, 1.1),
    ];
    const materials = ANSWER_STYLES.map(
      (s) => new THREE.MeshStandardMaterial({ color: s.color, roughness: 0.4, metalness: 0.1, flatShading: true }),
    );

    const shapes = [];
    const count = small ? 16 : 32;
    for (let i = 0; i < count; i++) {
      const kind = i % 4;
      const mesh = new THREE.Mesh(geometries[kind], materials[kind]);
      mesh.position.set(rand(-20, 20), rand(-13, 13), rand(-16, 3));
      mesh.rotation.set(rand(0, Math.PI), rand(0, Math.PI), 0);
      mesh.scale.setScalar(rand(0.55, 1.35));
      mesh.userData = {
        spin: new THREE.Vector3(rand(-0.8, 0.8), rand(-0.8, 0.8), rand(-0.3, 0.3)),
        rise: rand(0.25, 0.8),
        sway: rand(0, Math.PI * 2),
      };
      scene.add(mesh);
      shapes.push(mesh);
    }

    const starCount = small ? 350 : 800;
    const starPositions = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      starPositions.set([rand(-40, 40), rand(-25, 25), rand(-30, 5)], i * 3);
    }
    const starGeometry = new THREE.BufferGeometry();
    starGeometry.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
    const starMaterial = new THREE.PointsMaterial({ color: 0xffffff, size: 0.07, transparent: true, opacity: 0.75 });
    const stars = new THREE.Points(starGeometry, starMaterial);
    scene.add(stars);

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
    let frame = 0;
    const render = () => {
      frame = requestAnimationFrame(render);
      const dt = Math.min(clock.getDelta(), 0.05);
      const t = clock.elapsedTime;
      speed += (energyRef.current - speed) * 0.03; // ease between energy levels
      const motion = reduceMotion ? 0.03 : speed;

      for (const mesh of shapes) {
        const { spin, rise, sway } = mesh.userData;
        const k = dt * (0.35 + motion * 2.2);
        mesh.rotation.x += spin.x * k;
        mesh.rotation.y += spin.y * k;
        mesh.rotation.z += spin.z * k;
        mesh.position.y += rise * dt * (0.25 + motion * 3.5);
        mesh.position.x += Math.sin(t * 0.4 + sway) * dt * 0.25;
        if (mesh.position.y > 14) {
          mesh.position.y = -14;
          mesh.position.x = rand(-20, 20);
        }
      }
      stars.rotation.z += dt * 0.01 * (1 + motion * 5);

      camera.position.x += (pointer.x * 1.6 - camera.position.x) * 0.03;
      camera.position.y += (-pointer.y * 1.1 - camera.position.y) * 0.03;
      camera.lookAt(0, 0, 0);
      renderer.render(scene, camera);
    };
    render();

    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
      window.removeEventListener('pointermove', onPointerMove);
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
      starGeometry.dispose();
      starMaterial.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  return <div ref={mountRef} className="bg3d" aria-hidden="true" />;
}
