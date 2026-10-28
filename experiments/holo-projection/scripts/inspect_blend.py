"""Read-only Blender inventory; run with --background --factory-startup."""
import bpy
import hashlib
import json
import sys
from pathlib import Path

source = Path(sys.argv[sys.argv.index('--') + 1]).resolve()
before = hashlib.sha256(source.read_bytes()).hexdigest()
bpy.ops.wm.open_mainfile(filepath=str(source))
objects = []
for obj in bpy.data.objects:
    if obj.type != 'MESH':
        continue
    item = dict(name=obj.name, vertices=len(obj.data.vertices), polygons=len(obj.data.polygons),
                bounds=[list(obj.matrix_world @ __import__('mathutils').Vector(v)) for v in obj.bound_box],
                groups=[g.name for g in obj.vertex_groups], materials=[m.name for m in obj.data.materials if m],
                modifiers=[dict(name=m.name, type=m.type, vertexGroup=getattr(m, 'vertex_group', None), invert=getattr(m, 'invert_vertex_group', None)) for m in obj.modifiers],
                properties={k: str(v)[:250] for k, v in obj.items()}, morphs={})
    if obj.data.shape_keys:
        keys = obj.data.shape_keys.key_blocks
        base = keys[0]
        for key in keys[1:]:
            distances = [(v.co - base.data[i].co).length for i, v in enumerate(key.data)]
            item['morphs'][key.name] = dict(changed=sum(d > 1e-7 for d in distances), maxDelta=max(distances, default=0))
    item['landmarks'] = {}
    item['groupCounts'] = {g.name: sum(any(w.group == g.index for w in v.groups) for v in obj.data.vertices) for g in obj.vertex_groups if g.name in ('body', 'HelperGeometry', 'JointCubes')}
    for group in obj.vertex_groups:
        if group.name in ('joint-head', 'joint-head-2', 'joint-neck', 'joint-jaw', 'joint-l-eye', 'joint-r-eye'):
            coords = [obj.matrix_world @ v.co for v in obj.data.vertices if any(g.group == group.index for g in v.groups)]
            item['landmarks'][group.name] = [sum(c[a] for c in coords) / len(coords) for a in range(3)] if coords else []
    objects.append(item)
print('NEYDRA_INSPECT=' + json.dumps(dict(blender=bpy.app.version_string, sha256=before, objects=objects)))
assert hashlib.sha256(source.read_bytes()).hexdigest() == before
