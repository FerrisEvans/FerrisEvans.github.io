"""Local surface refinements; keep the accepted Home camera and silhouettes."""
import math

import bpy
from bpy_extras.object_utils import world_to_camera_view
from mathutils import Vector


def screen_bounds(obj, scene):
    points = [world_to_camera_view(scene, scene.camera, obj.matrix_world @ v.co) for v in obj.data.vertices]
    return (min(p.x for p in points), min(p.y for p in points),
            max(p.x for p in points), max(p.y for p in points))


def fit_projection(obj, target, scene):
    """Keep depth, fit camera-plane geometry to its original projected bounds."""
    bounds = screen_bounds(obj, scene)
    camera = scene.camera
    view = camera.matrix_world.inverted()
    local = obj.matrix_world.inverted() @ camera.matrix_world
    tan_x = camera.data.sensor_width / (2 * camera.data.lens)
    tan_y = tan_x * scene.render.resolution_y / scene.render.resolution_x
    for vertex in obj.data.vertices:
        point = obj.matrix_world @ vertex.co
        projected = world_to_camera_view(scene, camera, point)
        u = target[0] + (projected.x - bounds[0]) / (bounds[2] - bounds[0]) * (target[2] - target[0])
        v = target[1] + (projected.y - bounds[1]) / (bounds[3] - bounds[1]) * (target[3] - target[1])
        depth = -(view @ point).z
        vertex.co = local @ Vector(((2 * u - 1) * depth * tan_x, (2 * v - 1) * depth * tan_y, -depth))
    obj.data.update()


def refine_shade(scene, outer_material, inner_material):
    shade = bpy.data.objects['Lamp_Shade']
    bpy.context.view_layer.update()
    target = screen_bounds(shade, scene)
    vertices, faces = [], []
    segments = 96
    profile = [(.266, -.165), (.270, -.161), (.270, -.154),
               (.096, .144), (.091, .158), (.079, .169),
               (.059, .177), (.029, .182), (.002, .183)]
    for radius, z in profile:
        vertices.extend((radius * math.cos(i * math.tau / segments), radius * math.sin(i * math.tau / segments), z)
                        for i in range(segments))
    for row in range(len(profile) - 1):
        for i in range(segments):
            a, b = row * segments + i, row * segments + (i + 1) % segments
            faces.append((a, b, b + segments, a + segments))
    faces.append(tuple((len(profile) - 1) * segments + i for i in range(segments)))
    mesh = bpy.data.meshes.new('Smooth spun-metal shade')
    mesh.from_pydata(vertices, [], faces)
    mesh.materials.append(outer_material)
    for polygon in mesh.polygons:
        polygon.use_smooth = len(polygon.vertices) == 4
    shade.data = mesh
    # Tilt the opening toward the viewer; previously the underside was hidden.
    shade.rotation_euler.x = math.radians(-24)
    shade.rotation_euler.y = .08
    bpy.context.view_layer.update()
    fit_projection(shade, target, scene)
    inner = shade.copy()
    inner.data = shade.data.copy()
    inner.name = 'Lamp_Interior'
    scene.collection.objects.link(inner)
    inner.scale *= .975
    inner.data.materials.clear()
    inner.data.materials.append(inner_material)
    # Reverse winding without carrying stale custom split normals.
    inner_vertices = [v.co.copy() for v in inner.data.vertices]
    inner_faces = [tuple(reversed(p.vertices)) for p in inner.data.polygons]
    inner.data.clear_geometry()
    inner.data.from_pydata(inner_vertices, [], inner_faces)
    for polygon in inner.data.polygons:
        polygon.use_smooth = len(polygon.vertices) == 4
    bpy.context.view_layer.update()
    bottom = sum((shade.matrix_world @ v.co for v in shade.data.vertices[:segments]), Vector()) / segments
    top = sum((shade.matrix_world @ v.co for v in shade.data.vertices[-segments:]), Vector()) / segments
    return shade, bottom, bottom.lerp(top, .30), target


def curve_crt_screen(scene):
    screen = bpy.data.objects['CRT_Screen']
    material = screen.data.materials[0]
    nx = 64
    hw, hh, corner, bulge = .45, .3325, .035, .037
    vertices, faces, texcoords = [], [], []
    # Concentrate rows at the curved corners; a uniform grid leaves only two
    # segments there and makes the silhouette look like a cut-off octagon.
    z_levels = [-hh + corner * (1 - math.cos(i * math.pi / 16)) for i in range(9)]
    z_levels += [-(hh - corner) + 2 * (hh - corner) * i / 40 for i in range(1, 40)]
    z_levels += [hh - corner + corner * math.sin(i * math.pi / 16) for i in range(9)]
    ny = len(z_levels) - 1
    for j, z in enumerate(z_levels):
        v = (z + hh) / (2 * hh)
        cap = max(abs(z) - (hh - corner), 0)
        row_half = hw - corner + math.sqrt(max(corner * corner - cap * cap, 0))
        for i in range(nx + 1):
            u = i / nx
            x = (2 * u - 1) * row_half
            y = -.010 - bulge * (1 - (x / hw) ** 2) * (1 - (z / hh) ** 2)
            vertices.append((x, y, z))
            texcoords.append((u, v))
    for j in range(ny):
        for i in range(nx):
            a = j * (nx + 1) + i
            faces.append((a, a + 1, a + nx + 2, a + nx + 1))
    mesh = bpy.data.meshes.new('CRT convex glass 37mm')
    mesh.from_pydata(vertices, [], faces)
    uv = mesh.uv_layers.new(name='ScreenUV')
    for polygon in mesh.polygons:
        polygon.use_smooth = True
        for loop in polygon.loop_indices:
            uv.data[loop].uv = texcoords[mesh.loops[loop].vertex_index]
    mesh.materials.append(material)
    screen.data = mesh
    screen['screen_bulge_m'] = bulge
    return screen
