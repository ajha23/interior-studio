"""Build an Interior Studio furniture recipe in Blender and export GLB.

Run as: python build_recipe.py recipe.json out.glb   (Blender as a Python module, `bpy`)

recipe.json = {"recipe": <sanitised recipe>, "materials": {slot: {color, roughness, metalness,
transmission?}}}. Geometry follows the browser builder exactly (three.js conventions: y up, mm,
cylinders along y, lathe around y, extrude along z, Euler XYZ in degrees) inside a parent that
turns three.js Y-up into Blender Z-up, then gets bevels and smooth shading the browser skips.
"""
import json
import math
import sys

import bpy  # noqa: I001 - bpy must load before bmesh in module mode
import bmesh
from mathutils import Matrix, Vector

MM = 0.001
Z_TO_Y = Matrix.Rotation(math.radians(-90), 4, 'X')  # Blender primitive axis (z) -> three.js y


def lin(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def make_material(slot, spec):
    m = bpy.data.materials.new(slot)
    m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    h = spec.get('color', '#cccccc').lstrip('#')
    b.inputs['Base Color'].default_value = (*[lin(int(h[i:i + 2], 16) / 255) for i in (0, 2, 4)], 1)
    b.inputs['Roughness'].default_value = float(spec.get('roughness', 0.6))
    b.inputs['Metallic'].default_value = float(spec.get('metalness', 0))
    if spec.get('transmission'):
        b.inputs['Transmission Weight'].default_value = float(spec['transmission'])
        b.inputs['Roughness'].default_value = 0.02
        b.inputs['IOR'].default_value = 1.5
    return m


def mesh_from_bm(name, bm):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    return me


def primitive(name, op, transform=None, **kw):
    bm = bmesh.new()
    op(bm, **kw)
    if transform is not None:
        bmesh.ops.transform(bm, matrix=transform, verts=bm.verts)
    return mesh_from_bm(name, bm)


def geometry(p):
    s = p['shape']
    if s in ('box', 'roundedBox'):
        w, h, d = (v * MM for v in p['size'])
        me = primitive(p['id'], lambda bm: bmesh.ops.create_cube(bm, size=1.0), Matrix.Diagonal((w, h, d, 1)))
        r = min(p.get('radius', 0) * MM, min(w, h, d) / 2 - 1e-5) if s == 'roundedBox' else min(0.002, min(w, h, d) / 4)
        return me, r
    if s == 'cylinder':
        me = primitive(p['id'], lambda bm: bmesh.ops.create_cone(bm, cap_ends=True, segments=32, radius1=p['radiusBottom'] * MM, radius2=p['radiusTop'] * MM, depth=p['height'] * MM), Z_TO_Y)
        return me, 0.0
    if s == 'sphere':
        return primitive(p['id'], lambda bm: bmesh.ops.create_uvsphere(bm, u_segments=32, v_segments=16, radius=p['radius'] * MM)), 0.0
    if s == 'torus':
        bm = bmesh.new()
        R, t = p['radius'] * MM, p['tube'] * MM
        ring = []
        for i in range(48):
            a = 2 * math.pi * i / 48
            row = []
            for j in range(16):
                b = 2 * math.pi * j / 16
                rr = R + t * math.cos(b)
                row.append(bm.verts.new((rr * math.cos(a), t * math.sin(b), rr * math.sin(a))))  # flat in xz
            ring.append(row)
        for i in range(48):
            for j in range(16):
                bm.faces.new((ring[i][j], ring[(i + 1) % 48][j], ring[(i + 1) % 48][(j + 1) % 16], ring[i][(j + 1) % 16]))
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        return mesh_from_bm(p['id'], bm), 0.0
    if s == 'lathe':
        ys = [y for _, y in p['profile']]
        mid = (min(ys) + max(ys)) / 2
        bm = bmesh.new()
        n = 48
        rings = [[bm.verts.new((r * MM * math.cos(2 * math.pi * k / n), (y - mid) * MM, r * MM * math.sin(2 * math.pi * k / n))) for k in range(n)] for r, y in p['profile']]
        for a, b in zip(rings, rings[1:]):
            for k in range(n):
                try:
                    bm.faces.new((a[k], a[(k + 1) % n], b[(k + 1) % n], b[k]))
                except ValueError:
                    pass
        bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        return mesh_from_bm(p['id'], bm), 0.0
    if s == 'extrude':
        cu = bpy.data.curves.new(p['id'], 'CURVE')
        cu.dimensions = '2D'
        cu.fill_mode = 'BOTH'
        bevel = p.get('bevel') or 0
        cu.extrude = max(1e-5, (p['depth'] - 2 * bevel) * MM / 2)
        cu.bevel_depth = bevel * MM
        cu.bevel_resolution = 2
        for loop in [p['outline'], *(p.get('holes') or [])]:
            sp = cu.splines.new('POLY')
            sp.points.add(len(loop) - 1)
            for pt, (x, y) in zip(sp.points, loop):
                pt.co = (x * MM, y * MM, 0, 1)
            sp.use_cyclic_u = True
        obj = bpy.data.objects.new('tmp', cu)
        bpy.context.scene.collection.objects.link(obj)
        me = bpy.data.meshes.new_from_object(obj.evaluated_get(bpy.context.evaluated_depsgraph_get()))
        bpy.data.objects.remove(obj)
        # Centre the box on the part position, like the browser builder.
        lo = Vector((min(v.co.x for v in me.vertices), min(v.co.y for v in me.vertices), min(v.co.z for v in me.vertices)))
        hi = Vector((max(v.co.x for v in me.vertices), max(v.co.y for v in me.vertices), max(v.co.z for v in me.vertices)))
        me.transform(Matrix.Translation(-(lo + hi) / 2))
        return me, 0.0
    if s == 'tube':
        cu = bpy.data.curves.new(p['id'], 'CURVE')
        cu.dimensions = '3D'
        cu.bevel_depth = p['radius'] * MM
        cu.bevel_resolution = 4
        cu.use_fill_caps = True
        sp = cu.splines.new('BEZIER')
        sp.bezier_points.add(len(p['path']) - 1)
        for bp, (x, y, z) in zip(sp.bezier_points, p['path']):
            bp.co = (x * MM, y * MM, z * MM)
            bp.handle_left_type = bp.handle_right_type = 'AUTO'
        sp.use_cyclic_u = bool(p.get('closed'))
        obj = bpy.data.objects.new('tmp', cu)
        bpy.context.scene.collection.objects.link(obj)
        me = bpy.data.meshes.new_from_object(obj.evaluated_get(bpy.context.evaluated_depsgraph_get()))
        bpy.data.objects.remove(obj)
        return me, 0.0
    raise ValueError(f'unknown shape {s}')


def main():
    args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:]
    src = json.load(open(args[0]))
    recipe, mats = src['recipe'], src.get('materials', {})
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    root = bpy.data.objects.new(recipe.get('name', 'Model'), None)
    scene.collection.objects.link(root)
    root.rotation_euler = (math.radians(90), 0, 0)  # three.js Y-up frame inside Blender
    materials = {slot: make_material(slot, mats.get(slot, {})) for slot in recipe['materials']}
    fallback = next(iter(materials.values()))
    for p in recipe['parts']:
        me, bevel = geometry(p)
        me.materials.append(materials.get(p['material'], fallback))
        for poly in me.polygons:
            poly.use_smooth = p['shape'] not in ('box', 'roundedBox', 'extrude')
        rep = p.get('repeat') or {'count': 1, 'offset': [0, 0, 0]}
        for i in range(int(rep['count'])):
            ob = bpy.data.objects.new(p['id'] if rep['count'] == 1 else f"{p['id']}-{i + 1}", me)
            scene.collection.objects.link(ob)
            ob.parent = root
            ob.location = [(p['position'][k] + rep['offset'][k] * i) * MM for k in range(3)]
            rot = p.get('rotation') or [0, 0, 0]
            ob.rotation_mode = 'ZYX'  # same matrix as three.js Euler 'XYZ'
            ob.rotation_euler = [math.radians(a) for a in rot]
            if bevel > 0:
                mod = ob.modifiers.new('Bevel', 'BEVEL')
                mod.width = bevel
                mod.segments = 3 if p['shape'] == 'roundedBox' else 1
                mod.limit_method = 'NONE' if p['shape'] == 'roundedBox' else 'ANGLE'
                ob.modifiers.new('Normals', 'WEIGHTED_NORMAL').keep_sharp = True
    # Rest on the floor, centred in plan.
    bpy.context.view_layer.update()
    pts = [ob.matrix_world @ Vector(c) for ob in root.children for c in ob.bound_box]
    lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    root.location = (-(lo.x + hi.x) / 2, -(lo.y + hi.y) / 2, -lo.z)
    bpy.ops.export_scene.gltf(filepath=args[1], export_format='GLB', export_apply=True, export_yup=True)
    print(json.dumps({'size_mm': [round((hi.x - lo.x) * 1000), round((hi.y - lo.y) * 1000), round((hi.z - lo.z) * 1000)]}))


if __name__ == '__main__':
    main()
