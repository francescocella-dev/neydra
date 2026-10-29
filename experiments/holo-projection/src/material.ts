import { Color, MeshStandardMaterial } from 'three';
import tokens from '../spec/holo.tokens.json';

/** Surface-only effects: original vertices, normals and morph data are untouched. */
export function holoMaterial(minY: number, maxY: number) {
  const uniforms = {
    uProgress: { value: 0 }, uReduced: { value: 0 }, uHolo: { value: 1 },
    uMinY: { value: minY }, uMaxY: { value: maxY },
    uCore: { value: new Color(tokens.palette.ice) },
    uCyan: { value: new Color(tokens.palette.primary) },
    uIris: { value: 1 }, uBlinkLeft: { value: 0 }, uBlinkRight: { value: 0 },
    uV3: { value: 1 },
  };
  const material = new MeshStandardMaterial({
    color: tokens.palette.primary, emissive: tokens.palette.primary, emissiveIntensity: 0.045,
    roughness: 0.95, metalness: 0, transparent: true, depthWrite: true,
  });
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = 'varying vec3 vHoloPosition; varying vec3 vHoloLocalPosition;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <project_vertex>',
      'vHoloLocalPosition = transformed; vHoloPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;\n#include <project_vertex>');
    shader.fragmentShader = `varying vec3 vHoloPosition; varying vec3 vHoloLocalPosition;
      uniform float uProgress, uReduced, uHolo, uMinY, uMaxY, uIris, uBlinkLeft, uBlinkRight, uV3;
      uniform vec3 uCore, uCyan;
      float holoHash(vec3 p) { return fract(sin(dot(p, vec3(12.9898,78.233,39.425))) * 43758.5453); }
      float holoNoise(vec3 p) {
        vec3 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
        return mix(mix(mix(holoHash(i),holoHash(i+vec3(1,0,0)),f.x),
                       mix(holoHash(i+vec3(0,1,0)),holoHash(i+vec3(1,1,0)),f.x),f.y),
                   mix(mix(holoHash(i+vec3(0,0,1)),holoHash(i+vec3(1,0,1)),f.x),
                       mix(holoHash(i+vec3(0,1,1)),holoHash(i+vec3(1,1,1)),f.x),f.y),f.z);
      }\n` + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>', `
      float h = clamp((vHoloPosition.y - uMinY) / (uMaxY - uMinY), 0.0, 1.0);
      float neckMask = smoothstep(0.06,0.25,h);
      // Broad spatial delays, with only a small height bias. No slicing plane.
      float field = holoNoise(vHoloPosition*38.0);
      float cells = holoHash(floor(vHoloPosition*1350.0));
      float delay = 0.19+h*0.10+field*0.30+cells*0.13;
      float reveal = smoothstep(delay-0.16,delay+0.27,uProgress);
      reveal *= mix(0.58,1.0,smoothstep(cells*0.5,cells*0.5+0.5,uProgress));
      float localH=clamp((vHoloLocalPosition.y-uMinY)/(uMaxY-uMinY),0.0,1.0);
      float fine=holoHash(floor(vHoloLocalPosition*1800.0));
      float spatial=holoNoise(vHoloLocalPosition*42.0);
      // Maximum delay + envelope end is .98: finish before p=1 without a pop.
      float ascendingDelay=0.10+localH*0.52+spatial*0.12+fine*0.04;
      float ascending=smoothstep(ascendingDelay-0.16,ascendingDelay+0.20,uProgress);
      reveal=mix(reveal,ascending,uV3);
      reveal = mix(reveal,uProgress,uReduced);
      if (uProgress <= 0.0) reveal = 0.0;
      if (uProgress >= 1.0) reveal = 1.0;
      float facing = abs(dot(normalize(normal),normalize(vViewPosition)));
      float rim = pow(1.0-facing,3.2);
      float edgeFade=smoothstep(0.015,0.44,facing);
      float microEdge=mix(0.55,1.0,smoothstep(0.12,0.84,fine));
      neckMask=mix(neckMask,smoothstep(0.07,0.33,localH)*mix(microEdge,1.0,edgeFade),uV3);
      vec3 tint = mix(uCyan,uCore,0.14+0.32*h+0.20*facing);
      float luminance = dot(outgoingLight,vec3(0.2126,0.7152,0.0722));
      vec3 lightSurface = mix(outgoingLight*0.55,tint*(0.16+min(luminance,1.0)*0.58),0.68);
      lightSurface += uCore*(rim*0.085+reveal*(1.0-reveal)*0.12);
      vec3 iceLight=mix(uCyan,uCore,0.48+0.32*facing)*(0.20+min(luminance,1.0)*0.72);
      iceLight+=uCore*(rim*0.10+reveal*(1.0-reveal)*0.16+fine*rim*0.045);
      lightSurface=mix(lightSurface,iceLight,uV3);
      // Optional iris on existing eye surfaces. Original MPFB landmarks in this
      // centered GLB; no eyeball/vertex addition or photorealistic texture.
      vec2 eyeL = (vHoloLocalPosition.xy-vec2(0.02813,0.00952))/vec2(0.0047);
      vec2 eyeR = (vHoloLocalPosition.xy-vec2(-0.02813,0.00952))/vec2(0.0047);
      float eyeGate = smoothstep(0.005,0.025,vHoloLocalPosition.z);
      float irisL = (1.0-smoothstep(0.65,1.0,length(eyeL)))*(1.0-uBlinkLeft);
      float irisR = (1.0-smoothstep(0.65,1.0,length(eyeR)))*(1.0-uBlinkRight);
      lightSurface = mix(lightSurface,lightSurface*0.52+uCyan*0.045,
        clamp(irisL+irisR,0.0,1.0)*eyeGate*uIris);
      outgoingLight = mix(outgoingLight,lightSurface,uHolo);
      float alpha = mix(0.46,0.60,facing)*mix(0.94,1.0,h);
      // Spatial transparency protects the facial core while feathering contour.
      float coreAlpha=mix(0.19,0.48,pow(facing,1.6));
      alpha=mix(alpha,coreAlpha*mix(0.16,1.0,edgeFade),uV3);
      diffuseColor.a *= neckMask*reveal*mix(1.0,alpha,uHolo);
      if (diffuseColor.a < 0.0001) discard;
      #include <opaque_fragment>
    `);
  };
  return { material, uniforms };
}
