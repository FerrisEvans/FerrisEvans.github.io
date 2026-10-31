"""Subtle, deterministic wear baked with the PBR surface maps.

All coordinates are world-space or geometric curvature: joining atlas objects
does not move the marks. Wear changes reflectance/roughness, never silhouette.
"""
import math
import random


class Surface:
    def __init__(self, material):
        self.n = material.node_tree.nodes
        self.l = material.node_tree.links
        self.p = self.n.get("Principled BSDF")
        self.geometry = self.n.new("ShaderNodeNewGeometry")
        self.position = self.geometry.outputs["Position"]

    def math(self, operation, a, b=0):
        node = self.n.new("ShaderNodeMath")
        node.operation = operation
        self.input(node.inputs[0], a)
        self.input(node.inputs[1], b)
        return node.outputs[0]

    def input(self, socket, value):
        if isinstance(value, (int, float, tuple)):
            socket.default_value = value
        else:
            self.l.new(value, socket)

    def vector(self, operation, a, b=(0, 0, 0)):
        node = self.n.new("ShaderNodeVectorMath")
        node.operation = operation
        self.input(node.inputs[0], a)
        self.input(node.inputs[1], b)
        return node.outputs["Value"] if operation == "LENGTH" else node.outputs["Vector"]

    def noise(self, scale, position=None):
        node = self.n.new("ShaderNodeTexNoise")
        node.inputs["Scale"].default_value = scale
        node.inputs["Detail"].default_value = 2
        node.inputs["Roughness"].default_value = .6
        self.l.new(position or self.position, node.inputs["Vector"])
        return node.outputs["Fac"]

    def ramp(self, value, start, end, low=0, high=1):
        node = self.n.new("ShaderNodeMapRange")
        node.clamp = True
        node.interpolation_type = "SMOOTHSTEP"
        for key, val in (("From Min", start), ("From Max", end), ("To Min", low), ("To Max", high)):
            node.inputs[key].default_value = val
        self.l.new(value, node.inputs["Value"])
        return node.outputs[0]

    def mix_color(self, mask, color, blend="MIX"):
        socket = self.p.inputs["Base Color"]
        original = socket.links[0].from_socket if socket.is_linked else tuple(socket.default_value)
        node = self.n.new("ShaderNodeMixRGB")
        node.blend_type = blend
        self.input(node.inputs[0], mask)
        self.input(node.inputs[1], original)
        node.inputs[2].default_value = (*color, 1)
        self.l.new(node.outputs[0], socket)

    def roughness(self, delta):
        socket = self.p.inputs["Roughness"]
        original = socket.links[0].from_socket if socket.is_linked else socket.default_value
        self.l.new(self.math("ADD", original, delta), socket)


def age_wood(material):
    s = Surface(material)
    xyz = s.n.new("ShaderNodeSeparateXYZ")
    s.l.new(s.position, xyz.inputs[0])
    # Restrict handling marks to the desk top, leaving floor/legs coherent.
    top = s.math("MULTIPLY", s.ramp(xyz.outputs["Z"], .675, .685), s.ramp(xyz.outputs["Z"], .70, .74, 1, 0))
    front = s.ramp(xyz.outputs["Y"], -.95, -.74, 1, 0)
    wear = s.math("MULTIPLY", top, s.math("MULTIPLY", front, s.noise(3)))
    s.mix_color(s.math("MULTIPLY", wear, .13), (.38, .20, .09))
    s.roughness(s.math("MULTIPLY", wear, -.07))

    # Open pores follow the grain; broad variation describes boards, whereas
    # this separate fine layer only changes how the oil catches grazing light.
    pores = s.noise(3, s.vector("MULTIPLY", s.position, (2.1, 110, 12)))
    pores = s.ramp(pores, .61, .78)
    s.mix_color(s.math("MULTIPLY", pores, .20), (.21, .12, .060), "MULTIPLY")
    s.roughness(s.math("MULTIPLY", pores, .11))
    # Subtle join between two physical boards, broken by fibres and finish.
    seam = s.ramp(s.math("ABSOLUTE", s.math("ADD", xyz.outputs["Y"], .13)), .0007, .0028, 1, 0)
    seam = s.math("MULTIPLY", seam, top)
    s.mix_color(s.math("MULTIPLY", seam, .24), (.22, .12, .06), "MULTIPLY")

    # One incomplete old cup ring; density variations prevent a stamped circle.
    offset = s.vector("SUBTRACT", s.position, (-.49, -.69, 0))
    radius = s.vector("LENGTH", s.vector("MULTIPLY", offset, (1, 1, 0)))
    ring = s.ramp(s.math("ABSOLUTE", s.math("SUBTRACT", radius, .136)), .002, .008, 1, 0)
    breakup = s.ramp(s.noise(32), .32, .66, .10, 1)
    ring = s.math("MULTIPLY", top, s.math("MULTIPLY", ring, breakup))
    s.mix_color(s.math("MULTIPLY", ring, .17), (.15, .07, .024), "MULTIPLY")
    s.roughness(s.math("MULTIPLY", ring, .055))

    # A handful of hairline scratches follow handling, rather than a full noise
    # field. Their endpoints taper; the intensity stays below the grain contrast.
    marks = 0
    rng = random.Random(2901)
    for _ in range(17):
        x, y = rng.uniform(-2.6, 2.55), rng.uniform(-.88, .58)
        length, angle = rng.uniform(.018, .11), rng.uniform(-.23, .23)
        relative = s.vector("SUBTRACT", s.position, (x, y, 0))
        rotate = s.n.new("ShaderNodeVectorRotate")
        rotate.rotation_type = "AXIS_ANGLE"
        rotate.inputs["Axis"].default_value = (0, 0, 1)
        rotate.inputs["Angle"].default_value = angle
        s.l.new(relative, rotate.inputs["Vector"])
        axes = s.n.new("ShaderNodeSeparateXYZ")
        s.l.new(rotate.outputs[0], axes.inputs[0])
        across = s.ramp(s.math("ABSOLUTE", axes.outputs["Y"]), .0004, .0014, 1, 0)
        along = s.ramp(s.math("ABSOLUTE", axes.outputs["X"]), length * .30, length * .5, 1, 0)
        marks = s.math("MAXIMUM", marks, s.math("MULTIPLY", across, along))
    marks = s.math("MULTIPLY", marks, top)
    s.mix_color(s.math("MULTIPLY", marks, .12), (.48, .28, .13))
    s.roughness(s.math("MULTIPLY", marks, .09))


def age_plastic(material, light=False):
    s = Surface(material)
    handling = s.ramp(s.noise(6), .30, .74)
    s.mix_color(s.math("MULTIPLY", handling, .035), (.24, .22, .18), "MULTIPLY")
    # Convex molded edges become slightly smoother and lighter with use.
    edge = s.ramp(s.geometry.outputs["Pointiness"], .505, .58)
    s.mix_color(s.math("MULTIPLY", edge, .075), (.70, .65, .53) if light else (.24, .25, .25))
    s.roughness(s.math("SUBTRACT", s.math("MULTIPLY", handling, .035), s.math("MULTIPLY", edge, .06)))
    normal = s.n.new("ShaderNodeSeparateXYZ")
    s.l.new(s.geometry.outputs["Normal"], normal.inputs[0])
    top = s.ramp(normal.outputs["Z"], .55, .96)
    recess = s.ramp(s.geometry.outputs["Pointiness"], .45, .50, 1, 0)
    dust = s.math("MULTIPLY", s.math("MAXIMUM", s.math("MULTIPLY", top, .35), recess), s.noise(37))
    s.mix_color(s.math("MULTIPLY", dust, .028), (.29, .26, .21))
    s.roughness(s.math("MULTIPLY", dust, .06))


def age_paper(material):
    s = Surface(material)
    grime = s.ramp(s.noise(13), .48, .79)
    s.mix_color(s.math("MULTIPLY", grime, .045), (.48, .40, .26), "MULTIPLY")
    s.roughness(s.math("MULTIPLY", grime, .02))
