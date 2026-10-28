import { Color, MeshStandardMaterial } from 'three';
import tokens from '../spec/holo.tokens.json';

/** Patch the morph-capable standard shader AFTER <begin_vertex>/<morphtarget_vertex>. */
export function holoMaterial(minY: number, maxY: number) {
  const uniforms = {
    uProgress: { value: 0 }, uReduced: { value: 0 }, uHolo: { value: 1 },
    uMinY: { value: minY }, uMaxY: { value: maxY },
    uCore: { value: new Color(tokens.palette.ice) },
  };
  const material = new MeshStandardMaterial({
    color: tokens.palette.primary, emissive: tokens.palette.primary, emissiveIntensity: 0.22,
    roughness: 0.8, metalness: 0, transparent: true, depthWrite: true,
  });
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = 'varying vec3 vHoloPosition;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <project_vertex>',
      'vHoloPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;\n#include <project_vertex>');
    shader.fragmentShader = `varying vec3 vHoloPosition;
      uniform float uProgress, uReduced, uHolo, uMinY, uMaxY;
      uniform vec3 uCore;\n` + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>', `
      float h = clamp((vHoloPosition.y - uMinY) / (uMaxY - uMinY), 0.0, 1.0);
      float neckMask = smoothstep(0.05, 0.21, h);
      float noise = sin(dot(floor(vHoloPosition * 1400.0), vec3(12.9898, 78.233, 39.425))) * 43758.5453;
      noise = fract(noise) * 0.035;
      float phase = clamp((uProgress - 0.25) / 0.6, 0.0, 1.0);
      float reveal = smoothstep(h + noise - 0.06, h + noise + 0.06, phase * 1.15);
      if (uProgress <= 0.0) reveal = 0.0;
      if (uProgress >= 1.0) reveal = 1.0;
      reveal = mix(reveal, uProgress, uReduced);
      float rim = pow(1.0 - abs(dot(normalize(normal), normalize(vViewPosition))), 2.4);
      outgoingLight += uHolo * uCore * rim * 0.32;
      diffuseColor.a *= neckMask * reveal * mix(1.0, ${tokens.hologram.faceOpacityStartingPoint}, uHolo);
      if (diffuseColor.a < 0.008) discard;
      #include <opaque_fragment>
    `);
  };
  return { material, uniforms };
}
