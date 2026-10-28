"""Derive a head on a new mesh, preserve exact per-index shape coordinates.

No MPFB code runs, no source is saved, no model sliders are changed.
"""
import bpy
import hashlib
import json
import sys
from pathlib import Path
from mathutils import Vector

REQUIRED = ('eyeBlinkLeft', 'eyeBlinkRight', 'jawOpen', 'mouthClose', 'mouthPucker', 'mouthFunnel', 'viseme_aa')


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    args = sys.argv[sys.argv.index('--') + 1:]
    source, approved, output = [Path(a).resolve() for a in args]
    if output == source.parent or source.parent in output.parents:
        raise RuntimeError('Output must be outside the original asset directory')
    output.mkdir(parents=True, exist_ok=True)
    if any(output.iterdir()):
        raise RuntimeError('Output must be empty; pipeline caches completed runs by hash')
    hashes = {p.name: digest(p) for p in (source, approved)}
    bpy.ops.wm.open_mainfile(filepath=str(source))
    candidates = [o for o in bpy.data.objects if o.type == 'MESH' and o.data.shape_keys
                  and all(k in o.data.shape_keys.key_blocks for k in REQUIRED)]
    if len(candidates) != 1:
        raise RuntimeError('Expected exactly one FacialKeys mesh')
    original = candidates[0]
    keys = original.data.shape_keys.key_blocks
    base = keys[0]
    preflight = {}
    for name in REQUIRED:
        ds = [(v.co - base.data[i].co).length for i, v in enumerate(keys[name].data)]
        preflight[name] = dict(changed=sum(d > 1e-7 for d in ds), maxDelta=max(ds))
        if preflight[name]['changed'] < 20:
            raise RuntimeError('Non-deforming required morph: ' + name)

    # Verify FacialKeys neutral is the approved MPFB shape mix, not generic Basis.
    with bpy.data.libraries.load(str(approved), link=False) as (available, loaded):
        loaded.objects = ['Human'] if 'Human' in available.objects else []
    if not loaded.objects or loaded.objects[0] is None:
        raise RuntimeError('Approved Human missing')
    approved_obj = loaded.objects[0]
    ak = approved_obj.data.shape_keys.key_blocks
    if len(ak[0].data) != len(base.data):
        raise RuntimeError('Approved topology differs')
    approved_error = 0.0
    for i, v in enumerate(base.data):
        co = ak[0].data[i].co.copy()
        for key in list(ak)[1:]:
            co += (key.data[i].co - key.relative_key.data[i].co) * key.value
        approved_error = max(approved_error, (co - v.co).length)
    if approved_error > 1e-5:
        raise RuntimeError('FacialKeys neutral differs from approved face: ' + str(approved_error))

    # First proof above uses untouched topology. Now derive a compact head and
    # reconstruct every key using an explicit original-index map, no bmesh edits.
    body_group = original.vertex_groups.get('body')
    if body_group is None:
        raise RuntimeError('MPFB body group missing; cannot exclude helpers safely')
    body = {v.index for v in original.data.vertices if any(g.group == body_group.index and g.weight > 0.5 for g in v.groups)}
    cutoff = 1.36  # meters in this approved MPFB input; jaw fades in renderer above rim
    polygons = [tuple(p.vertices) for p in original.data.polygons
                if all(i in body and (original.matrix_world @ base.data[i].co).z >= cutoff for i in p.vertices)]
    indices = sorted({i for face in polygons for i in face})
    if len(indices) < 1000:
        raise RuntimeError('Unexpected head region; inspect authoring scale')
    remap = {old: new for new, old in enumerate(indices)}
    world = [original.matrix_world @ base.data[i].co for i in indices]
    center = Vector([(min(v[a] for v in world) + max(v[a] for v in world)) / 2 for a in range(3)])
    mesh = bpy.data.meshes.new('HoloHeadRuntime')
    mesh.from_pydata([v - center for v in world], [], [[remap[i] for i in face] for face in polygons])
    mesh.update()
    head = bpy.data.objects.new('Head', mesh)
    bpy.context.scene.collection.objects.link(head)
    head.shape_key_add(name='Basis')
    integrity = {}
    for key in list(keys)[1:]:
        target = head.shape_key_add(name=key.name)
        max_error, changed, max_delta = 0.0, 0, 0.0
        for j, i in enumerate(indices):
            target.data[j].co = original.matrix_world @ key.data[i].co - center
            expected = original.matrix_world.to_3x3() @ (key.data[i].co - base.data[i].co)
            actual = target.data[j].co - head.data.shape_keys.key_blocks[0].data[j].co
            max_error = max(max_error, (actual - expected).length)
            max_delta = max(max_delta, actual.length)
            changed += actual.length > 1e-7
        if max_error > 1e-6:
            raise RuntimeError('Morph integrity failed: ' + key.name)
        integrity[key.name] = dict(changed=changed, maxDelta=max_delta, maxError=max_error)
    for name in REQUIRED:
        if integrity[name]['changed'] < 20:
            raise RuntimeError('Head subset lost required delta: ' + name)
    for polygon in mesh.polygons:
        polygon.use_smooth = True
    material = bpy.data.materials.new('HoloNeutral')
    material.diffuse_color = (0.58, 0.67, 0.72, 1)
    mesh.materials.append(material)
    body_node = bpy.data.objects.new('Body', None)
    bpy.context.scene.collection.objects.link(body_node)
    head.parent = body_node
    bpy.ops.object.select_all(action='DESELECT')
    head.select_set(True)
    body_node.select_set(True)
    bpy.context.view_layer.objects.active = head
    flags = dict(export_format='GLB', use_selection=True, export_yup=True,
                 export_apply=False, export_morph=True, export_morph_normal=False,
                 export_morph_tangent=False, export_animations=False, export_skins=False,
                 export_texcoords=False, export_normals=True, export_materials='EXPORT')
    glb = output / 'holo-head.glb'
    bpy.ops.export_scene.gltf(filepath=str(glb), **flags)
    if glb.stat().st_size > 20 * 1024 * 1024:
        raise RuntimeError('GLB exceeds 20 MiB contract')
    # Separate .blend contains runtime objects only. Originals remain untouched.
    runtime_scene = bpy.data.scenes.new('HoloRuntime')
    runtime_scene.collection.objects.link(body_node)
    runtime_scene.collection.objects.link(head)
    bpy.data.libraries.write(str(output / 'holo-runtime.blend'), {runtime_scene}, fake_user=True, compress=True)
    for p in (source, approved):
        if digest(p) != hashes[p.name]:
            raise RuntimeError('Source hash changed')
    report = dict(status='PASS', blender=bpy.app.version_string, sources=hashes,
                  approvedNeutralMaxError=approved_error, sourceVertices=len(base.data),
                  runtimeVertices=len(indices), runtimePolygons=len(polygons), cutoffMeters=cutoff,
                  originalIndexSha256=hashlib.sha256(json.dumps(indices).encode()).hexdigest(),
                  centerBlenderMeters=list(center), units='meters; glTF +Y up, +Z forward; head centered at origin',
                  preflight=preflight, morphs=integrity, exportFlags=flags,
                  glb=dict(file=glb.name, bytes=glb.stat().st_size, sha256=digest(glb)),
                  limitations=['No separate eyeball, teeth or tongue objects in approved scene; no added anatomy.',
                               'Head-only topology subset; shader fades lower perimeter. Cosmetic review pending.',
                               'Morph position deltas preserved; morph normals intentionally omitted for size.'])
    (output / 'export-report.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
    print('NEYDRA_EXPORT=PASS ' + str(glb))


if __name__ == '__main__':
    main()
