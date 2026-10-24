"""Render an Interior Studio scene with Blender Cycles.

Run as: python render_scene.py job.json out.png   (Blender as a Python module, `bpy`)

job.json carries a glTF scene exported from the editor (three.js, Y-up, metres), the camera, the
lighting preset resolved to numbers, room ceiling panels and light fittings. Lights are rebuilt
here from those numbers rather than taken from glTF, so the look matches the browser renderer.
"""
import json
import math
import sys

import bpy
from mathutils import Matrix, Vector

# three.js is Y-up, Blender is Z-up: the glTF importer applies the same rotation to the scene.
C = Matrix.Rotation(math.radians(90), 4, 'X')

# Unit bridges from three.js render units to Cycles (tuned against the browser path tracer).
K_SUN = 1.0       # DirectionalLight intensity -> sun strength
K_POINT = 4 * math.pi  # PointLight intensity -> watts
K_AREA = math.pi  # RectAreaLight intensity x area -> watts


def progress(stage, fraction):
    print(json.dumps({'stage': stage, 'progress': round(fraction, 4)}), flush=True)


def lin(c):
    """sRGB 0..1 -> linear."""
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def hex_rgb(h, linear=True):
    h = h.lstrip('#')
    rgb = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return [lin(c) for c in rgb] if linear else rgb


def to_blender(p):
    return C @ Vector((p[0], p[1], p[2]))


def setup_world(scene, spec, panorama):
    world = bpy.data.worlds.new('Sky')
    scene.world = world
    world.use_nodes = True
    nt = world.node_tree
    nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputWorld')
    coord = nt.nodes.new('ShaderNodeTexCoord')
    sep = nt.nodes.new('ShaderNodeSeparateXYZ')
    # Direction z in -1..1 -> 0..1 for the ramp.
    remap = nt.nodes.new('ShaderNodeMapRange')
    remap.inputs['From Min'].default_value = -1
    remap.inputs['From Max'].default_value = 1
    ramp = nt.nodes.new('ShaderNodeValToRGB')
    sky = spec['sky']
    g = sky['gain']
    z, h, gr = sky['zenith'], sky['horizon'], sky['ground']
    els = ramp.color_ramp.elements
    els[0].position, els[0].color = 0.0, (*[c * g for c in gr], 1)
    els[1].position, els[1].color = 1.0, (*[c * g for c in z], 1)
    e = els.new(0.4167); e.color = (*[c * g for c in gr], 1)
    e = els.new(0.5); e.color = (*[c * g for c in h], 1)
    t = 0.5 ** 0.6  # match the browser's gradient curve at mid-sky
    e = els.new(0.75); e.color = (*[(h[i] + (z[i] - h[i]) * t) * g for i in range(3)], 1)
    bg = nt.nodes.new('ShaderNodeBackground')
    nt.links.new(coord.outputs['Generated'], sep.inputs[0])
    nt.links.new(sep.outputs['Z'], remap.inputs['Value'])
    nt.links.new(remap.outputs['Result'], ramp.inputs['Fac'])
    nt.links.new(ramp.outputs['Color'], bg.inputs['Color'])
    if panorama:
        nt.links.new(bg.outputs[0], out.inputs['Surface'])
        return
    # Stills: the sky lights the room but the camera sees a plain studio backdrop.
    plain = nt.nodes.new('ShaderNodeBackground')
    plain.inputs['Color'].default_value = (*hex_rgb(spec['background']), 1)
    path = nt.nodes.new('ShaderNodeLightPath')
    mix = nt.nodes.new('ShaderNodeMixShader')
    nt.links.new(path.outputs['Is Camera Ray'], mix.inputs['Fac'])
    nt.links.new(bg.outputs[0], mix.inputs[1])
    nt.links.new(plain.outputs[0], mix.inputs[2])
    nt.links.new(mix.outputs[0], out.inputs['Surface'])


def add_light(name, kind, location, rotation=None, **props):
    data = bpy.data.lights.new(name, kind)
    for k, v in props.items():
        setattr(data, k, v)
    obj = bpy.data.objects.new(name, data)
    obj.location = location
    if rotation is not None:
        obj.rotation_mode = 'QUATERNION'
        obj.rotation_quaternion = rotation
    bpy.context.scene.collection.objects.link(obj)
    return obj


def setup_lights(job):
    spec = job['spec']
    sun = spec.get('sun')
    if sun:
        az = math.radians(job['lighting']['sunAzimuthDeg'])
        el = math.radians(sun['elevationDeg'])
        to_sun = to_blender((math.sin(az) * math.cos(el), math.sin(el), -math.cos(az) * math.cos(el))).normalized()
        # A sun light shines along its -Z: point +Z at the sun.
        add_light('Sun', 'SUN', (0, 0, 10), to_sun.to_track_quat('Z', 'Y'), energy=sun['intensity'] * K_SUN, color=hex_rgb(sun['color']), angle=math.radians(1.2))
    interior = spec['interior']
    for i, r in enumerate(job.get('rooms', [])):
        w = max(0.4, min(1.4, r['w'] * 0.35))
        d = max(0.4, min(1.4, r['d'] * 0.35))
        # Default area light faces down (-Z), as wanted for a ceiling panel.
        add_light(f'Ceiling{i}', 'AREA', to_blender((r['x'], r['ceiling'] - 0.02, r['z'])), shape='RECTANGLE', size=w, size_y=d,
                  energy=interior['intensity'] * w * d * K_AREA, color=hex_rgb(interior['color']))
    if job['lighting'].get('fixturesOn'):
        for i, f in enumerate(job.get('fixtures', [])):
            add_light(f'Fixture{i}', 'POINT', to_blender((f['x'], f['y'], f['z'])), energy=f['intensity'] * 1.4 * K_POINT,
                      color=hex_rgb(f['color']), shadow_soft_size=0.04)


def setup_camera(scene, job):
    cam_data = bpy.data.cameras.new('Camera')
    cam = bpy.data.objects.new('Camera', cam_data)
    scene.collection.objects.link(cam)
    scene.camera = cam
    cam_data.clip_start = 0.02
    cam_data.clip_end = 500
    pano = job.get('panorama')
    if pano:
        cam_data.type = 'PANO'
        cam_data.panorama_type = 'EQUIRECTANGULAR'
        cam.location = to_blender((pano['x'], pano['y'], pano['z']))
        # Level, centred on plan north (three.js -Z), like the browser panoramas.
        cam.rotation_euler = (math.radians(90), 0, 0)
        return
    e = job['camera']['matrixWorld']  # column-major, three.js world
    m = Matrix(((e[0], e[4], e[8], e[12]), (e[1], e[5], e[9], e[13]), (e[2], e[6], e[10], e[14]), (e[3], e[7], e[11], e[15])))
    loc, rot, _ = (C @ m).decompose()
    cam.location = loc
    cam.rotation_mode = 'QUATERNION'
    cam.rotation_quaternion = rot
    cam_data.sensor_fit = 'VERTICAL'
    cam_data.angle_y = math.radians(job['camera']['fov'])


def tidy_materials():
    """glTF imports are faithful; a few tweaks give Cycles the materials designers expect."""
    for mat in bpy.data.materials:
        if not mat.use_nodes:
            continue
        for n in mat.node_tree.nodes:
            if n.type == 'BSDF_PRINCIPLED':
                # Glass from the editor arrives with transmission; give it a clean IOR and no roughness.
                if n.inputs['Transmission Weight'].default_value > 0.5:
                    n.inputs['Roughness'].default_value = 0.0
                    n.inputs['IOR'].default_value = 1.5


def configure(scene, job):
    scene.render.engine = 'CYCLES'
    cy = scene.cycles
    cy.device = 'CPU'
    cy.samples = int(job['samples'])
    cy.use_adaptive_sampling = True
    cy.adaptive_threshold = 0.02
    cy.use_denoising = True
    cy.denoiser = 'OPENIMAGEDENOISE'
    cy.max_bounces = 8
    cy.diffuse_bounces = 4
    cy.glossy_bounces = 4
    cy.transmission_bounces = 8
    cy.caustics_reflective = False
    cy.caustics_refractive = False
    cy.sample_clamp_indirect = 8
    scene.render.resolution_x = int(job['width'])
    scene.render.resolution_y = int(job['height'])
    scene.render.resolution_percentage = 100
    scene.render.threads_mode = 'AUTO'
    scene.view_settings.view_transform = 'AgX'
    scene.view_settings.look = 'AgX - Medium High Contrast'
    scene.view_settings.exposure = math.log2(max(1e-3, job['spec']['exposure'] * 2 ** job['lighting']['exposure']))
    fmt = scene.render.image_settings
    if job.get('format') == 'jpeg':
        fmt.file_format = 'JPEG'
        fmt.quality = 92
    else:
        fmt.file_format = 'PNG'
        fmt.color_mode = 'RGB'
        fmt.compression = 30


def main():
    args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:]
    job = json.load(open(args[0]))
    out = args[1]
    progress('preparing', 0)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=job['glb'], import_shading='NORMALS')
    scene = bpy.context.scene
    progress('preparing', 0.6)
    tidy_materials()
    setup_world(scene, job['spec'], bool(job.get('panorama')))
    setup_lights(job)
    setup_camera(scene, job)
    configure(scene, job)
    progress('preparing', 1)

    # Cycles reports per-sample progress on stdout ("Sample n/N"); the server parses it.
    scene.render.filepath = out
    bpy.ops.render.render(write_still=True)
    progress('done', 1)


if __name__ == '__main__':
    main()
