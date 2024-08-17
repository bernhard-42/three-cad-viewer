# %%
from build123d import *
from ocp_vscode import *
import cadquery as cq

# enable_native_tessellator()
from ocp_tessellate.convert import export_three_cad_viewer_js


def save(name, obj):
    export_three_cad_viewer_js(name.replace("-", "_"), obj, filename=f"{name}.js")


# %% Beispiel "box"

b = Box(10, 20, 30)
b2 = Box(10, 20, 30)
b2 = fillet(b2.edges().filter_by(Axis.Y), 2)
b3 = Box(10, 20, 30)
b3 = fillet(b3.edges().filter_by(Axis.Z), 2)
b4 = Box(20, 40, 60) - b2
b = b - b4
b4 = Box(20, 40, 60) - b3
b = b - b4
show(b)
save("box", b)

# %% Beispiel "Image Face"

f = ImageFace("object-160x160mm.png", 600 / 912, name="imageplane")
save("image-face", f)

# %% Beispiel "orientation box"

b = Box(50, 100, 150)
f = b.faces().sort_by(Axis.Y)[0]
b += Plane(f) * Text("ZX / Front")

# %%
box1 = cq.Workplane("XY").box(10, 20, 30).edges(">X or <X").chamfer(2)
box1.name = "box1"

box2 = cq.Workplane("XY").box(8, 18, 28).edges(">X or <X").chamfer(2)
box2.name = "box2"

box3 = (
    cq.Workplane("XY")
    .transformed(offset=(0, 15, 7))
    .box(30, 20, 6)
    .edges(">Z")
    .fillet(3)
)
box3.name = "box3"

box4 = box3.mirror("XY").translate((0, -5, 0))
box4.name = "box4"

box1 = box1.cut(box2).cut(box3).cut(box4)
