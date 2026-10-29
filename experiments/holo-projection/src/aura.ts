import { AdditiveBlending, BufferAttribute, BufferGeometry, Color, Group, Matrix4, Mesh, Points, ShaderMaterial, Vector3 } from 'three';
import tokens from '../spec/holo.tokens.json';

export const AURA_SEED = 0x4e455944;
export function particleBudget(width: number, dpr: number) {
  const scale = (width < 800 ? 0.5 : 1) * (dpr > 1.75 ? 0.75 : 1);
  return { pixels: Math.floor(320*scale), halo: Math.floor(96*scale), flow: Math.floor(160*scale) };
}

/** All arrays/materials are created once. update() changes uniforms/visibility only. */
export function digitalAura(head: Mesh, minY: number, maxY: number, emitter: Vector3) {
  const root = new Group(); root.name='HoloDigitalAura'; head.add(root);
  const h=maxY-minY;
  const positions=head.geometry.attributes.position, normals=head.geometry.attributes.normal;
  const candidates:number[]=[];
  for(let i=0;i<positions.count;i++) {
    // Keep the central eye/nose/mouth field unobscured, including at rest.
    if(positions.getY(i)>minY+h*0.18 &&
      (Math.abs(positions.getX(i))>h*0.21 || positions.getY(i)>minY+h*0.79 || positions.getZ(i)<0)) candidates.push(i);
  }
  if(candidates.length<32) throw new Error('Insufficient approved head surface for aura anchors');
  let seed=AURA_SEED;
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  const anchors=new Float32Array(320*3), directions=new Float32Array(320*3), seeds=new Float32Array(320);
  for(let i=0;i<320;i++) {
    const index=candidates[Math.floor(random()*candidates.length)];
    for(let a=0;a<3;a++) {
      anchors[i*3+a]=positions.getComponent(index,a);
      directions[i*3+a]=normals.getComponent(index,a);
    }
    seeds[i]=random();
  }
  const uniforms={uProgress:{value:0},uTime:{value:0},uReduced:{value:0},uSpeaking:{value:0},
    uHeight:{value:h},uMinY:{value:minY},uDpr:{value:1},uEmitter:{value:emitter.clone()},
    uIce:{value:new Color(tokens.palette.ice)},uCyan:{value:new Color(tokens.palette.primary)}};
  const vertex=`attribute vec3 aNormal; attribute float aSeed;
    uniform float uProgress,uTime,uReduced,uSpeaking,uHeight,uMinY,uDpr,uKind;
    uniform vec3 uEmitter; varying float vAlpha; varying float vSeed;
    void main(){
      vSeed=aSeed; float t=uTime; vec3 p=position;
      float height=clamp((position.y-uMinY)/uHeight,0.0,1.0);
      if(uKind<1.5){
        float offset=uHeight*(0.012+aSeed*0.046);
        p+=aNormal*offset;
        float life=fract(aSeed+t*0.025);
        float drifting=step(0.82,aSeed);
        p+=aNormal*uHeight*0.025*smoothstep(0.15,0.95,life)*drifting;
        p+=vec3(sin(t*0.19+aSeed*40.0),sin(t*0.13+aSeed*23.0),cos(t*0.16+aSeed*17.0))*uHeight*0.007;
        vec3 viewNormal=normalize(normalMatrix*aNormal);
        vec3 viewDirection=normalize(-(modelViewMatrix*vec4(p,1.0)).xyz);
        float silhouette=pow(1.0-abs(dot(viewNormal,viewDirection)),1.6);
        float arrival=smoothstep(0.07+height*0.54,0.35+height*0.54,uProgress);
        float breath=0.78+0.22*sin(t*0.23+aSeed*35.0);
        vAlpha=arrival*silhouette*breath*mix(1.0,0.66,uSpeaking);
        vAlpha*=mix(1.0,smoothstep(0.0,0.22,life)*(1.0-smoothstep(0.65,1.0,life)),drifting);
        if(uKind<0.5) vAlpha*=0.018; else vAlpha*=0.23;
        gl_PointSize=(uKind<0.5?24.0+18.0*aSeed:1.0+1.1*aSeed)*uDpr;
      }else{
        // Endpoints depend on progress, not elapsed time: reversing p retraces
        // every fragment toward the stationary emitter without respawning.
        float delay=0.025+height*0.44+aSeed*0.07;
        float travel=clamp((uProgress-delay)/0.32,0.0,1.0);
        float eased=travel*travel*(3.0-2.0*travel);
        vec3 origin=uEmitter+vec3(sin(aSeed*60.0),0.0,cos(aSeed*60.0))*uHeight*0.012;
        p=mix(origin,position,eased);
        p+=vec3(sin(travel*9.0+aSeed*30.0),0,cos(travel*8.0+aSeed*20.0))*uHeight*0.025*sin(travel*3.14159265);
        vAlpha=sin(travel*3.14159265)*0.42;
        gl_PointSize=(1.0+aSeed*1.2)*uDpr;
      }
      if(uProgress<=0.0) vAlpha=0.0;
      if(uReduced>0.5){vAlpha=uKind<0.5?uProgress*0.012:0.0;}
      vec4 mv=modelViewMatrix*vec4(p,1.0);
      gl_PointSize*=clamp(0.65/-mv.z,0.55,1.35);
      gl_Position=projectionMatrix*mv;
    }`;
  const fragment=`uniform vec3 uIce,uCyan; uniform float uKind; varying float vAlpha,vSeed;
    void main(){vec2 c=gl_PointCoord-0.5;
      float shape=uKind<0.5?exp(-dot(c,c)*18.0):(1.0-smoothstep(0.31,0.5,max(abs(c.x),abs(c.y))));
      gl_FragColor=vec4(mix(uCyan,uIce,0.35+vSeed*0.4),vAlpha*shape);
    }`;
  const nodes:Points<BufferGeometry,ShaderMaterial>[]=[];
  for(let kind=0;kind<3;kind++) {
    const geometry=new BufferGeometry();
    geometry.setAttribute('position',new BufferAttribute(anchors,3));
    geometry.setAttribute('aNormal',new BufferAttribute(directions,3));
    geometry.setAttribute('aSeed',new BufferAttribute(seeds,1));
    const material=new ShaderMaterial({uniforms:{...uniforms,uKind:{value:kind}},vertexShader:vertex,fragmentShader:fragment,
      transparent:true,depthWrite:false,blending:AdditiveBlending});
    const points=new Points(geometry,material); points.frustumCulled=false; points.renderOrder=2;
    root.add(points); nodes.push(points);
  }
  const inverse=new Matrix4();
  let disposed=false,enabled=true,reduced=false;
  let budget=particleBudget(1920,1);
  const resize=(width:number,dpr:number)=>{
    budget=particleBudget(width,dpr); uniforms.uDpr.value=dpr;
    nodes[0].geometry.setDrawRange(0,budget.halo);
    nodes[1].geometry.setDrawRange(0,budget.pixels);
    nodes[2].geometry.setDrawRange(0,budget.flow);
  };
  resize(1920,1);
  return {
    root,resize,
    update(progress:number,time:number,isReduced:boolean,speaking:boolean,isEnabled:boolean){
      enabled=isEnabled;reduced=isReduced;
      uniforms.uProgress.value=progress;
      uniforms.uTime.value=isReduced?0:time;
      uniforms.uReduced.value=Number(isReduced); uniforms.uSpeaking.value=Number(speaking);
      root.visible=!disposed&&enabled&&progress>0;
      nodes[1].visible=!isReduced;
      nodes[2].visible=!isReduced&&progress<0.9;
      if(root.visible&&nodes[2].visible){
        head.updateWorldMatrix(true,false);
        inverse.copy(head.matrixWorld).invert();
        uniforms.uEmitter.value.copy(emitter).applyMatrix4(inverse);
      }
    },
    snapshot(){return {seed:AURA_SEED,enabled,reduced,visible:root.visible,time:uniforms.uTime.value,
      progress:uniforms.uProgress.value,budget,drawCalls:root.visible?nodes.filter(node=>node.visible).length:0,
      moving:root.visible&&!reduced,disposed,anchors:Array.from(anchors.subarray(0,12)),
      worldMatrix:root.matrixWorld.toArray(),parentIsHead:root.parent===head};},
    dispose(){if(disposed)return;disposed=true;root.visible=false;root.removeFromParent();
      for(const node of nodes){node.geometry.dispose();node.material.dispose();}root.clear();},
  };
}
