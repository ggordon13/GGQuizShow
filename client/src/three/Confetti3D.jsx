import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { ANSWER_STYLES } from '../lib/constants.js';
import { prefersReducedMotion } from '../lib/hooks.js';

const rand = (min, max) => min + Math.random() * (max - min);
const COLORS = [...ANSWER_STYLES.map((s) => s.color), '#ffffff', '#c89bff'];

/** A transparent overlay of tumbling 3D confetti, drawn with one InstancedMesh. */
export default function Confetti3D({ pieces = 420 }) {
  const mountRef = useRef(null);

  useEffect(() => {
    if (prefersReducedMotion()) return undefined;
    const mount = mountRef.current;
    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      return undefined;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(50, mount.clientWidth / mount.clientHeight, 0.1, 100);
    camera.position.z = 20;

    const geometry = new THREE.PlaneGeometry(0.28, 0.5);
    const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
    const mesh = new THREE.InstancedMesh(geometry, material, pieces);
    scene.add(mesh);

    const color = new THREE.Color();
    const bits = Array.from({ length: pieces }, (_, i) => {
      mesh.setColorAt(i, color.set(COLORS[i % COLORS.length]));
      return {
        // Start in two bursts from the lower corners, like confetti cannons.
        pos: new THREE.Vector3(i % 2 ? rand(10, 14) : rand(-14, -10), rand(-12, -9), rand(-4, 4)),
        vel: new THREE.Vector3(i % 2 ? rand(-9, -2) : rand(2, 9), rand(14, 24), rand(-2, 2)),
        rot: new THREE.Euler(rand(0, 6), rand(0, 6), rand(0, 6)),
        spin: new THREE.Vector3(rand(-6, 6), rand(-6, 6), rand(-6, 6)),
        flutter: rand(0, Math.PI * 2),
      };
    });
    mesh.instanceColor.needsUpdate = true;

    const dummy = new THREE.Object3D();
    const clock = new THREE.Clock();
    let frame = 0;
    const render = () => {
      frame = requestAnimationFrame(render);
      const dt = Math.min(clock.getDelta(), 0.05);
      const t = clock.elapsedTime;
      bits.forEach((b, i) => {
        b.vel.y -= 14 * dt; // gravity
        b.vel.multiplyScalar(1 - 1.4 * dt); // air drag, so pieces float down
        b.pos.addScaledVector(b.vel, dt);
        b.pos.x += Math.sin(t * 3 + b.flutter) * dt * 0.8;
        b.rot.x += b.spin.x * dt;
        b.rot.y += b.spin.y * dt;
        b.rot.z += b.spin.z * dt;
        if (b.pos.y < -14) {
          // Recycle as gentle rain from the top.
          b.pos.set(rand(-16, 16), rand(12, 16), rand(-4, 4));
          b.vel.set(rand(-1, 1), rand(-3, -1), 0);
        }
        dummy.position.copy(b.pos);
        dummy.rotation.copy(b.rot);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
      renderer.render(scene, camera);
    };
    render();

    const resize = new ResizeObserver(() => {
      const { clientWidth: w, clientHeight: h } = mount;
      if (!w || !h) return;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    });
    resize.observe(mount);

    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
      geometry.dispose();
      material.dispose();
      mesh.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [pieces]);

  return <div ref={mountRef} className="confetti3d" aria-hidden="true" />;
}
