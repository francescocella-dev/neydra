import { AdditiveBlending, Color, DoubleSide, Group, Mesh, PlaneGeometry, ShaderMaterial } from 'three';
import tokens from '../spec/holo.tokens.json';

/** Intersecting soft light sheets, analytical radial/longitudinal falloff. */
export function projectionBeam(height: number, originY: number) {
  const group = new Group();
  const uniforms = { uStrength: { value: 0 }, uColor: { value: new Color(tokens.palette.primary) } };
  const material = new ShaderMaterial({
    uniforms, transparent: true, depthWrite: false, side: DoubleSide, blending: AdditiveBlending,
    vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
    fragmentShader: `varying vec2 vUv; uniform float uStrength; uniform vec3 uColor;
      void main(){
        float radius = mix(0.018,0.32,pow(vUv.y,0.8));
        float distanceToAxis = abs(vUv.x-0.5)/radius;
        float radial = exp(-distanceToAxis*distanceToAxis*3.5);
        float endFade = smoothstep(0.0,0.08,vUv.y)*(1.0-smoothstep(0.35,1.0,vUv.y));
        float filaments = 0.76+0.24*cos((vUv.x-0.5)*160.0+vUv.y*12.0);
        gl_FragColor=vec4(uColor,radial*endFade*filaments*uStrength*0.032);
      }`,
  });
  const beamHeight = height*0.78;
  for (const angle of [-0.65,0,0.65]) {
    const sheet = new Mesh(new PlaneGeometry(height*1.15,beamHeight),material);
    sheet.position.set(0,beamHeight/2,-height*0.035);
    sheet.rotation.y=angle;
    group.add(sheet);
  }
  group.position.y=originY;
  return { group, uniforms };
}
