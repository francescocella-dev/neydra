/** Original engineering fixtures. No external model, texture, font or concept image. MIT. */
import * as T from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
// GLTFExporter uses FileReader in browsers. Node Blob already supplies arrayBuffer.
globalThis.FileReader = class {
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then((result) => {
      this.result = result;
      this.onloadend?.();
    });
  }
  readAsDataURL(blob) {
    blob.arrayBuffer().then((result) => {
      this.result = `data:${blob.type};base64,${Buffer.from(result).toString("base64")}`;
      this.onloadend?.();
    });
  }
};
const out = fileURLToPath(new URL("../public/models/", import.meta.url));
const mat = (color, metalness = 0.3, roughness = 0.4, glow = 0) =>
  new T.MeshStandardMaterial({
    color,
    metalness,
    roughness,
    emissive: color,
    emissiveIntensity: glow,
  });
const shell = mat("#bed4e0", 0.65, 0.28);
const dark = mat("#061321", 0.6, 0.24);
const cyan = mat("#6ad9ff", 0.4, 0.3, 2.4);
const holo = mat("#19627d", 0.7, 0.38, 0.28);
const mesh = (
  parent,
  name,
  geo,
  material,
  pos = [0, 0, 0],
  scale = [1, 1, 1],
) => {
  const m = new T.Mesh(geo, material);
  m.name = name;
  m.position.set(...pos);
  m.scale.set(...scale);
  parent.add(m);
  return m;
};
const sphere = () => new T.SphereGeometry(1, 40, 28);
const box = (x, y, z, r) => new RoundedBoxGeometry(x, y, z, 5, r);
const group = (parent, name, pos) => {
  const g = new T.Group();
  g.name = name;
  if (pos) g.position.set(...pos);
  parent.add(g);
  return g;
};
function morphs(m, targets) {
  const base = m.geometry.attributes.position;
  m.geometry.morphAttributes.position = Object.entries(targets).map(
    ([name, transform]) => {
      const attr = base.clone();
      attr.name = name;
      const v = new T.Vector3();
      for (let i = 0; i < attr.count; i++) {
        v.fromBufferAttribute(base, i);
        transform(v);
        attr.setXYZ(i, v.x, v.y, v.z);
      }
      return attr;
    },
  );
  m.updateMorphTargets();
}
function face(head, kind) {
  const robot = kind === "mini";
  const eyeY = robot ? 0.07 : 0.13;
  const eyeZ = robot ? 0.69 : 0.575;
  for (const [side, x] of [
    ["Left", -0.25],
    ["Right", 0.25],
  ]) {
    const eye = mesh(
      head,
      `Eye${side}`,
      sphere(),
      cyan,
      [x, eyeY, eyeZ],
      robot ? [0.105, 0.14, 0.035] : [0.115, 0.048, 0.055],
    );
    morphs(eye, {
      [`eyeBlink${side}`]: (v) => {
        v.y *= 0.06;
      },
    });
    if (!robot) {
      const brow = mesh(
        head,
        `Brow${side}`,
        box(0.25, 0.024, 0.035, 0.01),
        cyan,
        [x, 0.27, 0.56],
      );
      brow.rotation.z = side === "Left" ? -0.12 : 0.12;
      morphs(brow, {
        browInnerUp: (v) => {
          v.y += (1 - Math.abs(v.x) / 0.15) * 0.07;
        },
      });
    }
  }
  const mouth = mesh(
    head,
    "Mouth",
    sphere(),
    cyan,
    [0, robot ? -0.23 : -0.31, robot ? 0.708 : 0.581],
    [0.16, 0.025, 0.025],
  );
  morphs(mouth, {
    jawOpen: (v) => {
      v.y *= 2.5;
      v.y -= 0.25;
    },
    mouthSmile: (v) => {
      v.y += v.x * v.x * 0.85;
      v.x *= 1.18;
    },
    viseme_aa: (v) => {
      v.y *= 4;
      v.x *= 0.85;
    },
    viseme_ee: (v) => {
      v.x *= 1.5;
      v.y *= 1.6;
    },
    viseme_ih: (v) => {
      v.x *= 1.1;
      v.y *= 2.5;
    },
    viseme_oh: (v) => {
      v.x *= 0.65;
      v.y *= 3.8;
    },
    viseme_ou: (v) => {
      v.x *= 0.5;
      v.y *= 2.8;
      v.z += 0.4;
    },
    viseme_ff: (v) => {
      v.x *= 1.2;
      v.y *= 0.6;
    },
    viseme_mm: (v) => {
      v.y *= 0.25;
    },
  });
}
function create(kind) {
  const scene = new T.Scene();
  scene.name = `${kind}_ENGINE_PROTOTYPE_NOT_FINAL_CHARACTER`;
  const body = group(scene, "Body", [0, 0, 0]);
  const head = group(body, "Head", [0, kind === "holo" ? 2.05 : 1.8, 0]);
  if (kind === "mini") {
    mesh(head, "Shell", box(1.52, 1.24, 1.14, 0.28), shell);
    mesh(head, "Visor", box(1.29, 0.89, 0.23, 0.2), dark, [0, -0.015, 0.515]);
    mesh(
      head,
      "EarLeft",
      new T.CylinderGeometry(0.17, 0.17, 0.13, 32),
      dark,
      [-0.78, 0, 0],
    ).rotation.z = Math.PI / 2;
    mesh(
      head,
      "EarRight",
      new T.CylinderGeometry(0.17, 0.17, 0.13, 32),
      dark,
      [0.78, 0, 0],
    ).rotation.z = Math.PI / 2;
    mesh(
      head,
      "Antenna",
      new T.CylinderGeometry(0.025, 0.025, 0.24, 16),
      shell,
      [0, 0.69, 0],
    );
    mesh(
      head,
      "AntennaLight",
      sphere(),
      cyan,
      [0, 0.85, 0],
      [0.065, 0.065, 0.065],
    );
    mesh(body, "Torso", box(0.91, 0.91, 0.69, 0.24), shell, [0, 0.79, 0]);
    mesh(
      body,
      "ChestInset",
      box(0.45, 0.25, 0.07, 0.08),
      dark,
      [0, 0.88, 0.34],
    );
    mesh(body, "Core", sphere(), cyan, [0, 0.88, 0.39], [0.055, 0.055, 0.02]);
    for (const x of [-0.57, 0.57]) {
      mesh(
        body,
        x < 0 ? "ArmLeft" : "ArmRight",
        box(0.22, 0.59, 0.29, 0.1),
        shell,
        [x, 0.8, 0],
      ).rotation.z = x < 0 ? -0.18 : 0.18;
      mesh(
        body,
        x < 0 ? "FootLeft" : "FootRight",
        box(0.34, 0.19, 0.54, 0.08),
        shell,
        [x * 0.48, 0.22, 0.06],
      );
    }
    mesh(
      body,
      "Neck",
      new T.CylinderGeometry(0.19, 0.24, 0.28, 32),
      dark,
      [0, 1.3, 0],
    );
  } else {
    const skin = sphere();
    // Stylized engineering head: jaw taper and a modeled central face ridge.
    const p = skin.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i),
        y = p.getY(i),
        z = p.getZ(i);
      const taper = y < -0.1 ? 1 + y * 0.29 : 1;
      p.setXYZ(
        i,
        x * 0.64 * taper,
        y * 0.88,
        z * 0.54 +
          (z > 0 ? Math.exp(-x * x * 60 - (y + 0.05) ** 2 * 12) * 0.15 : 0),
      );
    }
    skin.computeVertexNormals();
    mesh(head, "FaceMesh", skin, holo);
    const wire = new T.MeshBasicMaterial({
      color: "#6ad9ff",
      wireframe: true,
      transparent: true,
      opacity: 0.18,
    });
    mesh(
      head,
      "TopologyOverlay",
      skin.clone(),
      wire,
      [0, 0, 0],
      [1.003, 1.003, 1.003],
    );
    mesh(
      head,
      "Nose",
      new T.ConeGeometry(0.095, 0.28, 4),
      holo,
      [0, -0.06, 0.61],
    ).rotation.x = 0.28;
    for (const x of [-0.62, 0.62])
      mesh(
        head,
        x < 0 ? "EarLeft" : "EarRight",
        sphere(),
        holo,
        [x, -0.01, -0.005],
        [0.08, 0.19, 0.1],
      );
    mesh(
      body,
      "Neck",
      new T.CylinderGeometry(0.2, 0.27, 0.57, 40),
      holo,
      [0, 1.15, -0.06],
    );
    mesh(
      body,
      "Shoulders",
      sphere(),
      holo,
      [0, 0.79, -0.1],
      [1.02, 0.31, 0.43],
    );
    mesh(
      body,
      "Bust",
      new T.CylinderGeometry(0.57, 0.26, 0.48, 48),
      holo,
      [0, 0.52, -0.08],
    );
    for (let i = 0; i < 4; i++)
      mesh(
        body,
        `ProjectionBand${i}`,
        new T.TorusGeometry(0.32 + i * 0.1, 0.008, 8, 80),
        cyan,
        [0, 0.31 + i * 0.17, -0.08],
      ).rotation.x = Math.PI / 2;
  }
  face(head, kind);
  const amounts = {
    idle: 0.025,
    listening: 0.015,
    processing: 0.04,
    speaking: 0.02,
    interrupted: 0,
    error: 0,
  };
  const animations = Object.entries(amounts).map(
    ([state, amount]) =>
      new T.AnimationClip(state, 3, [
        new T.VectorKeyframeTrack(
          "Body.position",
          [0, 1.5, 3],
          [0, 0, 0, 0, amount, 0, 0, 0, 0],
        ),
      ]),
  );
  return { scene, animations };
}
await mkdir(out, { recursive: true });
for (const kind of ["holo", "mini"]) {
  const { scene, animations } = create(kind);
  const binary = await new GLTFExporter().parseAsync(scene, {
    binary: true,
    animations,
  });
  await writeFile(`${out}/${kind}-prototype.glb`, Buffer.from(binary));
  console.log(
    `${kind}: ${binary.byteLength} bytes — ENGINE PROTOTYPE / NOT FINAL CHARACTER`,
  );
}
