import { expect,it,vi } from 'vitest';
import { Mesh, SphereGeometry, Vector3 } from 'three';
import { digitalAura,particleBudget } from '../src/aura';
import { Projection } from '../src/projection';

it('uses deterministic immutable anchors, bounded budgets and head parenting',()=>{
  const head=new Mesh(new SphereGeometry(0.12,24,24));
  const before=head.geometry.attributes.position.array.slice();
  const first=digitalAura(head,-0.12,0.12,new Vector3(0,-0.22,0));
  const second=digitalAura(head,-0.12,0.12,new Vector3(0,-0.22,0));
  expect(first.snapshot().anchors).toEqual(second.snapshot().anchors);
  expect(first.root.parent).toBe(head);
  expect(particleBudget(1920,1)).toEqual({pixels:320,halo:96,flow:160});
  expect(particleBudget(390,2).pixels).toBeLessThan(160);
  first.resize(390,1);expect(first.snapshot().budget.flow).toBe(80);
  expect(head.geometry.attributes.position.array).toEqual(before);
  first.dispose();second.dispose();head.geometry.dispose();
});

it('freezes reduced motion, hides fallback/zero progress and disposes once',()=>{
  const head=new Mesh(new SphereGeometry(0.12,24,24));
  const effect=digitalAura(head,-0.12,0.12,new Vector3(0,-0.22,0));
  effect.update(1,10,true,false,true);
  expect(effect.snapshot()).toMatchObject({time:0,moving:false,drawCalls:1,visible:true});
  effect.update(1,99,true,false,true);expect(effect.snapshot().time).toBe(0);
  effect.update(0,2,false,false,true);expect(effect.snapshot().drawCalls).toBe(0);
  effect.update(1,2,false,false,false);expect(effect.snapshot().visible).toBe(false);
  const geometry=effect.root.children[0] as Mesh;
  const dispose=vi.spyOn(geometry.geometry,'dispose');
  effect.dispose();effect.dispose();expect(dispose).toHaveBeenCalledTimes(1);
  expect(head.children).toHaveLength(0);
  expect(effect.snapshot()).toMatchObject({disposed:true,visible:false});
  head.geometry.dispose();
});

it('reuses the same aura and exact progress when an appearance is reversed',()=>{
  const head=new Mesh(new SphereGeometry(0.12,24,24));
  const effect=digitalAura(head,-0.12,0.12,new Vector3(0,-0.22,0));
  const progress=new Projection();progress.to(true,0);
  effect.update(progress.sample(675),1,false,false,true);
  const anchors=effect.snapshot().anchors;
  progress.to(false,675);effect.update(progress.sample(675),1,false,false,true);
  expect(effect.snapshot().progress).toBe(0.5);
  effect.update(progress.sample(1000),1,false,false,true);
  expect(effect.snapshot().visible).toBe(false);
  expect(effect.snapshot().anchors).toEqual(anchors);
  expect(head.children).toHaveLength(1);effect.dispose();head.geometry.dispose();
});
