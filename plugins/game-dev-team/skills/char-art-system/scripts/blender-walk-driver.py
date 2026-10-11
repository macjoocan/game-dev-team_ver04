"""Render a whole-body IK motion CONTROL, not approved character animation.
blender -b --python blender-walk-driver.py -- --out folder --frames 25
"""
import argparse
import json
import math
import sys
from pathlib import Path
import bpy
from mathutils import Vector

GAIT = {"stance_fraction": .62, "step_half": .28, "swing_clearance": .09,
        "hip_mid": 1.0875, "hip_bob": .0175, "heel_angle": -.18, "toe_angle": .42}


def smooth(t):
    t = max(0, min(1, t))
    return t*t*(3-2*t)


def foot_target(q, gait):
    duty, half = gait["stance_fraction"], gait["step_half"]
    stance = q < duty
    if stance:
        t = q / duty
        x = half - 2*half*t
        pitch = gait["heel_angle"]*(1-smooth(t/.14)) + gait["toe_angle"]*smooth((t-.76)/.24)
    else:
        t = (q-duty)/(1-duty)
        # Hermite end velocities match the support-foot travel through contact/toe-off.
        tangent = -2*half*(1-duty)/duty
        x = (2*t**3-3*t*t+1)*(-half) + (t**3-2*t*t+t)*tangent + (-2*t**3+3*t*t)*half + (t**3-t*t)*tangent
        pitch = gait["toe_angle"] + (gait["heel_angle"]-gait["toe_angle"])*smooth(t)
    offset = Vector((.075*math.cos(pitch)-.025*math.sin(pitch), 0,
                     -.075*math.sin(pitch)-.025*math.cos(pitch)))
    radius_z = math.sqrt((.16*math.sin(pitch))**2 + (.06*math.cos(pitch))**2)
    lift = 0 if stance else gait["swing_clearance"]*math.sin(math.pi*t)**2
    z = radius_z - offset.z + lift
    return x, z, pitch, offset, stance, lift


def ik_knee(hip, ankle, upper=.52, lower=.52):
    delta = ankle - hip
    distance = delta.length
    if not abs(upper - lower) < distance < upper + lower:
        raise ValueError(f"Unreachable foot target: {distance}")
    unit = delta.normalized()
    along = (upper * upper - lower * lower + distance * distance) / (2 * distance)
    bend = math.sqrt(max(0, upper * upper - along * along))
    perp = Vector((-unit.z, 0, unit.x))
    if perp.x < 0:
        perp = -perp
    return hip + unit * along + perp * bend


def material(name, color):
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*color, 1)
    return m


def sphere(name, radius, mat):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=16, ring_count=8, radius=radius)
    o = bpy.context.object
    o.name = name
    o.data.materials.append(mat)
    return o


def segment(name, radius, mat):
    bpy.ops.mesh.primitive_cylinder_add(vertices=12, radius=radius, depth=1)
    o = bpy.context.object
    o.name = name
    o.data.materials.append(mat)
    return o


def place_segment(obj, a, b):
    obj.location = (a + b) / 2
    obj.rotation_euler = (b - a).to_track_quat("Z", "Y").to_euler()
    obj.scale.z = (b - a).length


def main():
    args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    p = argparse.ArgumentParser()
    p.add_argument("--out", required=True)
    p.add_argument("--frames", type=int, default=25)
    p.add_argument("--size", type=int, default=512)
    p.add_argument("--fps", type=int, default=24)
    p.add_argument("--render", action="store_true")
    p.add_argument("--gait-config")
    p.add_argument("--weapon", choices=["none", "sword"], default="none")
    p.add_argument("--action", choices=["walk", "slash", "thrust", "hit"], default="walk")
    p.add_argument("--forward-slash", action="store_true")
    p.add_argument("--step-thrust", action="store_true")
    p.add_argument("--ortho-scale", type=float, default=2.7)
    p.add_argument("--camera-center-x", type=float, default=0)
    opt = p.parse_args(args)
    gait = {**GAIT, **(json.loads(Path(opt.gait_config).read_text()) if opt.gait_config else {})}
    if opt.frames < 2:
        raise ValueError("At least two motion frames are required")
    out = Path(opt.out).resolve()
    out.mkdir(parents=True, exist_ok=True)
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_WORKBENCH"
    scene.render.resolution_x = opt.size
    scene.render.resolution_y = opt.size
    scene.render.resolution_percentage = 100
    scene.render.film_transparent = True
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.fps = opt.fps
    scene.frame_start, scene.frame_end = 1, opt.frames
    scene.display.shading.light = "STUDIO"
    scene.display.shading.color_type = "MATERIAL"
    scene.display.shading.show_shadows = False
    scene.display.shading.show_cavity = True
    near = material("near-body", (.2, .58, .78))
    far = material("far-body", (.12, .25, .38))
    boot = material("boots", (.25, .12, .06))
    torso = sphere("torso", .27, near)
    torso.scale = (.78, .65, 1.3)
    pelvis = sphere("pelvis", .16, near)
    head = sphere("head", .17, near)
    nose = sphere("facing-marker", .055, boot)
    limbs = []
    for side, mat in enumerate((near, far)):
        limbs.append({"thigh": segment(f"leg-{side}-upper", .075, mat),
                      "shin": segment(f"leg-{side}-lower", .055, mat),
                      "foot": sphere(f"foot-{side}", 1, boot),
                      "arm": segment(f"arm-{side}", .045, mat),
                      "forearm": segment(f"forearm-{side}", .035, mat)})
        limbs[-1]["foot"].scale = (.16, .065, .06)
    sword = []
    if opt.weapon == "sword":
        steel = material("blade", (.75,.78,.8))
        sword = [segment("sword-grip", .025, boot), segment("sword-guard", .02, steel),
                 segment("sword-blade", .018, steel)]
    bpy.ops.object.camera_add(location=(opt.camera_center_x, -6, 1.12))
    camera = bpy.context.object
    camera.rotation_euler = (Vector((opt.camera_center_x, 0, 1.12)) - camera.location).to_track_quat("-Z", "Y").to_euler()
    camera.data.type = "ORTHO"
    camera.data.ortho_scale = opt.ortho_scale
    scene.camera = camera
    motion = []
    for frame in range(opt.frames):
        # Include a closing duplicate for model 4n+1 input, export can omit it for loop playback.
        phase = frame / (opt.frames - 1)
        # Pelvis rises during single support, lowers at opposite foot contacts.
        hip_z = gait["hip_mid"] - gait["hip_bob"] * math.cos(4 * math.pi * phase)
        # One-shot action: anticipation, fast execution, then recovery to the ready pose.
        wind = smooth(phase/.30) if phase < .30 else 1-smooth((phase-.30)/.16)
        strike = smooth((phase-.30)/.16)*(1-smooth((phase-.56)/.44))
        recoil = smooth(phase/.18)*(1-smooth((phase-.28)/.72))
        lean = 0
        root_x = 0
        if opt.action != "walk":
            hip_z = 1.045 - (.025*wind + .055*strike if opt.action != "hit" else .045*recoil)
            lean = .13*strike-.08*wind if opt.action != "hit" else -.25*recoil
            root_x = .055*strike if opt.action != "hit" else -.06*recoil
            if opt.action == "thrust" and opt.step_thrust:
                root_x = .28*smooth((phase-.18)/.30)
                lean = .02*wind+.22*strike
                hip_z -= .07*smooth((phase-.18)/.20)*(1-smooth((phase-.64)/.28))
            if opt.action == "slash" and opt.forward_slash:
                lean = .03*wind+.28*strike
                root_x = .02*wind+.12*strike
        torso.location = (0.015 * math.sin(2 * math.pi * phase), 0, hip_z + .30)
        torso.rotation_euler.y = .06
        pelvis.location = (0, 0, hip_z)
        pelvis.rotation_euler.z = .045 * math.sin(2*math.pi*phase)
        torso.rotation_euler.z = -.035 * math.sin(2*math.pi*phase)
        head.location = (.05, 0, hip_z + .76)
        nose.location = (.21, -.025, hip_z + .76)
        if opt.action != "walk":
            torso.location = (root_x+.30*math.sin(lean),0,hip_z+.30)
            torso.rotation_euler.y = lean
            torso.rotation_euler.z = 0
            pelvis.location.x = root_x
            head.location = (root_x+.05+.76*math.sin(lean),0,hip_z+.76*math.cos(lean))
            nose.location = (head.location.x+.16,-.025,head.location.z)
        record = {"frame": frame, "hip_z": hip_z, "legs": [],
                  "root_travel": phase * 2*gait["step_half"]/gait["stance_fraction"],
                  "head": list(head.location), "neck": [0, 0, hip_z + .55]}
        if opt.action != "walk":
            record["root_travel"] = root_x if opt.action == "thrust" and opt.step_thrust else 0
            record["neck"] = [root_x+.55*math.sin(lean),0,hip_z+.55*math.cos(lean)]
        for side, objects in enumerate(limbs):
            q = (phase + side * .5) % 1
            y = -.08 if side == 0 else .08
            x, z, pitch, foot_offset, stance, clearance = foot_target(q, gait)
            if opt.action != "walk":
                x, z, pitch, foot_offset, stance, clearance = (.24 if side==0 else -.24),.085,0,Vector((.075,0,-.025)),True,0
                if opt.action == "thrust" and opt.step_thrust:
                    step_t=max(0,min(1,(phase-(.14 if side==0 else .64))/(.30 if side==0 else .28)))
                    x += .28*smooth(step_t)
                    clearance=.10*math.sin(math.pi*step_t)**2
                    z += clearance
                    stance=step_t in (0,1)
            hip = Vector((root_x, y, hip_z))
            ankle = Vector((x, y, z))
            knee = ik_knee(hip, ankle)
            place_segment(objects["thigh"], hip, knee)
            place_segment(objects["shin"], knee, ankle)
            objects["foot"].location = ankle + foot_offset
            # Toe always faces +X. Swing articulation never mirrors the whole foot.
            objects["foot"].rotation_euler.y = pitch
            shoulder = Vector((.02, y * 1.8, hip_z + .54))
            if opt.action != "walk":
                shoulder = Vector((root_x+.02+.54*math.sin(lean),y*1.8,hip_z+.54*math.cos(lean)))
            angle = -.32 * math.cos(2 * math.pi * q)
            elbow = shoulder + Vector((.29 * math.sin(angle), 0, -.29 * math.cos(angle)))
            hand = elbow + Vector((.25*math.sin(angle+.35), 0, -.25*math.cos(angle+.35)))
            if opt.weapon == "sword" and side == 0:
                # Holding arm stays in a coherent carry pose; the opposite arm counter-swings.
                elbow = shoulder + Vector((-.025,0,-.28))
                hand = elbow + Vector((.25,0,.015))
                direction = Vector((math.cos(.12),0,-math.sin(.12)))
                if opt.action != "walk":
                    arm_angle = -.10-.45*wind+.80*strike if opt.action=="thrust" else -.55
                    fore_angle = .10 + (1.20*wind-.85*strike if opt.action=="slash" else 0)
                    blade_angle = -.12 + (1.62*wind-.85*strike if opt.action=="slash" else .12*strike)
                    if opt.action == "slash" and opt.forward_slash:
                        arm_angle = -.15+.75*strike
                        fore_angle = .10+.85*wind-.65*strike
                        blade_angle = -.12+1.10*wind-.80*strike
                    elbow = shoulder+Vector((.29*math.sin(arm_angle),0,-.29*math.cos(arm_angle)))
                    hand = elbow+Vector((.25*math.cos(fore_angle),0,.25*math.sin(fore_angle)))
                    direction = Vector((math.cos(blade_angle),0,math.sin(blade_angle)))
                hilt = hand + direction*.08
                tip = hilt + direction*.64
                place_segment(sword[0],hand-direction*.065,hilt)
                guard_axis = Vector((-direction.z,0,direction.x))*.075
                place_segment(sword[1],hilt-guard_axis,hilt+guard_axis)
                place_segment(sword[2],hilt,tip)
                record["weapon"] = {"hand":list(hand),"hilt":list(hilt),"tip":list(tip),"blade_length":.64}
            place_segment(objects["arm"], shoulder, elbow)
            place_segment(objects["forearm"], elbow, hand)
            record["legs"].append({"hip": list(hip), "ankle": list(ankle), "knee": list(knee), "stance": stance,
                                   "shoulder": list(shoulder), "elbow": list(elbow), "hand": list(hand),
                                   "upper_length": (hip-knee).length, "lower_length": (knee-ankle).length})
            record["legs"][-1].update(phase=q, foot_pitch=pitch, ground_clearance=clearance,
                                       flat_support=stance and .14 < q/gait["stance_fraction"] < .76)
        for obj in (torso, pelvis, head, nose, *[o for limb in limbs for o in limb.values()], *sword):
            for prop in ("location", "rotation_euler", "scale"):
                obj.keyframe_insert(data_path=prop, frame=frame + 1)
        motion.append(record)
    (out / "motion.json").write_text(json.dumps({"status": "concept-control", "facing": "+X",
                "frames": opt.frames, "fps": opt.fps, "closing_duplicate": True,
                "gait":gait, "version":3, "weapon":opt.weapon,"action":opt.action,
                "forward_slash": opt.forward_slash,
                "step_thrust": opt.step_thrust,
                "projection": {"ortho_scale": opt.ortho_scale, "center_x":opt.camera_center_x, "center_z": 1.12}, "motion": motion}, indent=2))
    bpy.ops.wm.save_as_mainfile(filepath=str(out / "walk-driver.blend"))
    if opt.render:
        for frame in range(1, opt.frames + 1):
            scene.frame_set(frame)
            scene.render.filepath = str(out / "frames" / f"frame_{frame-1:04d}.png")
            bpy.ops.render.render(write_still=True)


if __name__ == "__main__":
    main()
