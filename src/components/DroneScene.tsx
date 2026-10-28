import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { DroneFrame, DroneMission } from "../../shared/drone";
import { t } from "../lib/i18n";

export default function DroneScene({
  mission,
  frame,
  trail,
  cameraView,
}: {
  mission: DroneMission;
  frame: DroneFrame;
  trail: DroneFrame[];
  cameraView: number;
}) {
  const container = useRef<HTMLDivElement>(null);
  const live = useRef({ frame, trail });
  live.current = { frame, trail };
  const resetCamera = useRef<(() => void) | undefined>(undefined);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    resetCamera.current?.();
  }, [cameraView]);
  useEffect(() => {
    const host = container.current!;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true });
    } catch {
      setFailed(true);
      return;
    }
    setFailed(false);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.8));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.domElement.setAttribute(
      "aria-label",
      t("Трёхмерная сцена полёта"),
    );
    host.appendChild(renderer.domElement);
    const lost = (event: Event) => {
      event.preventDefault();
      setFailed(true);
    };
    renderer.domElement.addEventListener("webglcontextlost", lost);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#0b1629");
    scene.fog = new THREE.Fog("#0b1629", 22, 48);
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 80);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.minDistance = 7;
    controls.maxDistance = 24;
    controls.maxPolarAngle = Math.PI / 2.08;
    const reset = () => {
      if (host.clientWidth < 480) camera.position.set(12, 12, 15);
      else camera.position.set(10, 10, 12);
      controls.target.set(3.5, 0.2, 3.5);
      controls.update();
    };
    resetCamera.current = reset;
    reset();
    scene.add(new THREE.HemisphereLight(0xc5e6ff, 0x28374b, 2.6));
    const sun = new THREE.DirectionalLight(0xffffff, 3);
    sun.position.set(2, 12, 5);
    sun.castShadow = true;
    Object.assign(sun.shadow.camera, {
      left: -10,
      right: 10,
      top: 10,
      bottom: -10,
    });
    sun.shadow.mapSize.set(1024, 1024);
    scene.add(sun);
    function box(
      w: number,
      h: number,
      d: number,
      color: string,
      x: number,
      y: number,
      z: number,
      parent: THREE.Object3D = scene,
    ) {
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(w, h, d),
        new THREE.MeshStandardMaterial({
          color,
          roughness: 0.48,
          metalness: 0.22,
        }),
      );
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      parent.add(mesh);
      return mesh;
    }
    box(8.4, 0.22, 8.4, "#1b304c", 3.5, -0.18, 3.5);
    const grid = new THREE.GridHelper(8, 8, 0x5c85aa, 0x37516e);
    grid.position.set(3.5, -0.055, 3.5);
    scene.add(grid);
    const labels: THREE.CanvasTexture[] = [];
    for (const [label, x, z] of [
      ["+X", 7.7, -0.6],
      ["+Z", -0.6, 7.7],
    ] as const) {
      const canvas = document.createElement("canvas");
      canvas.width = 128;
      canvas.height = 64;
      const context = canvas.getContext("2d")!;
      context.fillStyle = "#b9daff";
      context.font = "bold 34px sans-serif";
      context.textAlign = "center";
      context.fillText(label, 64, 44);
      const texture = new THREE.CanvasTexture(canvas);
      labels.push(texture);
      const sprite = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: texture, depthTest: false }),
      );
      sprite.position.set(x, 0.15, z);
      sprite.scale.set(0.8, 0.4, 1);
      scene.add(sprite);
    }
    // Grid cells are centred on integer coordinates used by the interpreter.
    const pad = (x: number, z: number, color: string) => {
      box(0.9, 0.04, 0.9, color, x, -0.025, z);
      box(0.08, 0.01, 0.55, "#e4f2ff", x - 0.15, 0.002, z);
      box(0.08, 0.01, 0.55, "#e4f2ff", x + 0.15, 0.002, z);
      box(0.3, 0.01, 0.08, "#e4f2ff", x, 0.002, z);
    };
    pad(mission.start.x, mission.start.z, "#367f78");
    pad(mission.finish.x, mission.finish.z, "#347fe0");
    if (mission.cargo) pad(mission.cargo.x, mission.cargo.z, "#bc7b32");
    mission.obstacles.forEach((o) => {
      box(0.92, o.height, 0.92, "#526885", o.x, o.height / 2, o.z);
      box(0.94, 0.055, 0.94, "#f0aa59", o.x, o.height + 0.025, o.z);
    });
    const rings = mission.checkpoints.map((p, i) => {
      const mesh = new THREE.Mesh(
        new THREE.TorusGeometry(0.48, 0.045, 12, 40),
        new THREE.MeshStandardMaterial({
          color: "#55d8f1",
          emissive: "#147d9b",
          emissiveIntensity: 0.5,
        }),
      );
      mesh.position.set(p.x, p.y + 0.18, p.z);
      mesh.rotation.y = i === 0 ? Math.PI / 2 : 0;
      scene.add(mesh);
      return mesh;
    });
    const drone = new THREE.Group();
    scene.add(drone);
    box(0.48, 0.16, 0.32, "#e5edf7", 0, 0, 0, drone);
    box(0.15, 0.1, 0.2, "#42c7ee", 0.25, -0.015, 0, drone);
    const rotors: THREE.Mesh[] = [];
    for (const x of [-0.3, 0.3])
      for (const z of [-0.3, 0.3]) {
        const arm = box(0.65, 0.055, 0.06, "#8195af", 0, -0.025, z / 2, drone);
        arm.rotation.y = x * z > 0 ? -Math.PI / 4 : Math.PI / 4;
        box(0.06, 0.2, 0.06, "#526885", x, -0.12, z, drone);
        const rotor = box(0.48, 0.018, 0.065, "#a7c9e6", x, 0.08, z, drone);
        rotors.push(rotor);
        const guard = new THREE.Mesh(
          new THREE.TorusGeometry(0.255, 0.018, 8, 32),
          new THREE.MeshStandardMaterial({ color: "#395d80" }),
        );
        guard.rotation.x = Math.PI / 2;
        guard.position.set(x, 0.07, z);
        drone.add(guard);
      }
    const payload = box(0.2, 0.18, 0.2, "#e9a04c", 0, -0.22, 0, drone);
    const cargo = mission.cargo
      ? box(0.32, 0.3, 0.32, "#e9a04c", mission.cargo.x, 0.15, mission.cargo.z)
      : undefined;
    const line = new THREE.Line(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({ color: "#62e2f3" }),
    );
    scene.add(line);
    const resize = () => {
      const w = host.clientWidth,
        h = host.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(host);
    resize();
    const motion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    let previousTrail: DroneFrame[] | undefined;
    let lastTime = 0;
    const target = new THREE.Vector3();
    drone.position.set(mission.start.x, 0.25, mission.start.z);
    renderer.setAnimationLoop((time) => {
      const dt = Math.min((time - lastTime) / 1000, 0.05);
      lastTime = time;
      const { frame: f, trail: path } = live.current;
      target.set(f.x, f.y + 0.25, f.z);
      drone.position.lerp(target, motion ? 1 : 1 - Math.exp(-9 * dt));
      const angle = (-f.heading * Math.PI) / 2;
      const delta = Math.atan2(
        Math.sin(angle - drone.rotation.y),
        Math.cos(angle - drone.rotation.y),
      );
      drone.rotation.y += delta * (motion ? 1 : 1 - Math.exp(-12 * dt));
      if (f.y && !motion)
        rotors.forEach((r, i) => {
          r.rotation.y += dt * (i % 2 ? 30 : -30);
        });
      payload.visible = f.carrying;
      if (cargo) {
        cargo.visible = !f.carrying;
        cargo.position.set(
          f.delivered ? mission.finish.x : mission.cargo!.x,
          0.15,
          f.delivered ? mission.finish.z : mission.cargo!.z,
        );
      }
      rings.forEach((ring, i) => {
        ring.material.color.set(f.visited.includes(i) ? "#58dfae" : "#55d8f1");
      });
      if (path !== previousTrail) {
        line.geometry.dispose();
        line.geometry = new THREE.BufferGeometry().setFromPoints(
          path.map((p) => new THREE.Vector3(p.x, p.y + 0.25, p.z)),
        );
        previousTrail = path;
      }
      controls.update();
      renderer.render(scene, camera);
    });
    return () => {
      observer.disconnect();
      renderer.setAnimationLoop(null);
      sun.shadow.dispose();
      controls.dispose();
      resetCamera.current = undefined;
      scene.traverse((o) => {
        if (o instanceof THREE.Mesh || o instanceof THREE.Line) {
          o.geometry.dispose();
          const materials = Array.isArray(o.material)
            ? o.material
            : [o.material];
          materials.forEach((m) => m.dispose());
        }
        if (o instanceof THREE.Sprite) o.material.dispose();
      });
      labels.forEach((texture) => texture.dispose());
      renderer.domElement.removeEventListener("webglcontextlost", lost);
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    };
  }, [mission]);
  return (
    <div className="drone-scene" ref={container}>
      {failed && (
        <div className="drone-webgl-error" role="alert">
          {t(
            "3D недоступно. Включите аппаратное ускорение браузера и перезагрузите страницу. Код и пошаговая проверка остаются доступны.",
          )}
        </div>
      )}
    </div>
  );
}
