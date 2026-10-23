"""Dump per-frame bone/vertex positions of one animated clip to probe JSON.

blender -b --factory-startup --python blender-dump-frames.py -- \
    --in model.fbx --out cand.json [--candidate a-current] [--action Wave] \
    [--loop] [--max-verts 3000] [--max-edges 1500] [--edge-bones "Shoulder|Arm"]

Output is the input format of probe-metrics.py (see references/propose-probe-compose.md).
Only reads the file. Nothing is saved back to the .blend/.fbx/.glb.
"""
import argparse
import json
import os
import re
import sys

import bpy
import numpy as np


def args():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    p = argparse.ArgumentParser()
    p.add_argument("--in", dest="src", required=True)
    p.add_argument("--out", required=True)
    p.add_argument("--candidate", default="")
    p.add_argument("--action", default="", help="substring of the action name; default = longest action")
    p.add_argument("--loop", action="store_true")
    p.add_argument("--max-verts", type=int, default=3000)
    p.add_argument("--max-edges", type=int, default=1500)
    p.add_argument("--edge-bones", default=r"shoulder|arm|elbow|clavicle")
    return p.parse_args(argv)


def load(src):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    ext = os.path.splitext(src)[1].lower()
    if ext in (".glb", ".gltf"):
        bpy.ops.import_scene.gltf(filepath=src)
    elif ext == ".fbx":
        bpy.ops.import_scene.fbx(filepath=src)
    elif ext == ".blend":
        bpy.ops.wm.open_mainfile(filepath=src)
    else:
        raise SystemExit(f"unsupported: {ext}")


def pick_action(arm, sub):
    acts = list(bpy.data.actions)
    if sub:
        acts = [a for a in acts if sub.lower() in a.name.lower()]
    if not acts:
        raise SystemExit("no action found")
    act = max(acts, key=lambda a: a.frame_range[1] - a.frame_range[0])
    ad = arm.animation_data or arm.animation_data_create()
    for t in ad.nla_tracks:
        t.mute = True
    ad.action = act
    if hasattr(ad, "action_slot") and len(getattr(act, "slots", [])):
        ad.action_slot = act.slots[0]
    return act


def dominant_group(obj, mesh):
    names = [g.name for g in obj.vertex_groups]
    out = []
    for v in mesh.vertices:
        best = max(v.groups, key=lambda g: g.weight, default=None)
        out.append(names[best.group] if best is not None and best.group < len(names) else "")
    return out


def main():
    a = args()
    load(a.src)
    arm = next((o for o in bpy.data.objects if o.type == "ARMATURE"), None)
    if arm is None:
        raise SystemExit("no armature")
    meshes = [o for o in bpy.data.objects if o.type == "MESH"
              and any(m.type == "ARMATURE" for m in o.modifiers)]
    act = pick_action(arm, a.action)
    scene = bpy.context.scene
    f0, f1 = int(np.floor(act.frame_range[0])), int(np.ceil(act.frame_range[1]))

    # static stats on the original (rest) mesh, and edge/vertex subset choice
    rx = re.compile(a.edge_bones, re.I)
    tri = open_edges = 0
    subset = []          # (mesh index, vertex index)
    edges, groups = [], {}
    rest = []
    for mi, o in enumerate(meshes):
        me = o.data
        tri += sum(len(p.vertices) - 2 for p in me.polygons)
        cnt = {}
        for p in me.polygons:
            for k in p.edge_keys:
                cnt[k] = cnt.get(k, 0) + 1
        open_edges += sum(1 for c in cnt.values() if c == 1)
        dom = dominant_group(o, me)
        cand = [e.vertices[:] for e in me.edges if rx.search(dom[e.vertices[0]]) and rx.search(dom[e.vertices[1]])]
        step = max(1, len(cand) // max(1, a.max_edges // max(1, len(meshes))))
        index = {}
        for (i, j) in cand[::step]:
            for v in (i, j):
                if (mi, v) not in index:
                    index[(mi, v)] = len(subset)
                    subset.append((mi, v))
            e = [index[(mi, i)], index[(mi, j)]]
            groups.setdefault(dom[i], []).append(len(edges))
            edges.append(e)
        stride = max(1, len(me.vertices) // max(1, a.max_verts // max(1, len(meshes))))
        for v in range(0, len(me.vertices), stride):
            if (mi, v) not in index:
                index[(mi, v)] = len(subset)
                subset.append((mi, v))
        mw = o.matrix_world
        for (m2, v) in subset[len(rest):]:
            rest.append(list(mw @ me.vertices[v].co))

    bones = {b.name: [] for b in arm.pose.bones}
    rots = {b.name: [] for b in arm.pose.bones}
    frames, min_up = [], []
    by_mesh = {}
    for k, (mi, v) in enumerate(subset):
        by_mesh.setdefault(mi, []).append((k, v))
    for f in range(f0, f1 + 1):
        scene.frame_set(f)
        dg = bpy.context.evaluated_depsgraph_get()
        aw = arm.matrix_world
        for pb in arm.pose.bones:
            bones[pb.name].append([round(x, 6) for x in aw @ pb.head])
            lm = pb.parent.matrix.inverted() @ pb.matrix if pb.parent else pb.matrix
            q = lm.to_quaternion()  # parent-relative rotation
            rots[pb.name].append([round(q.w, 6), round(q.x, 6), round(q.y, 6), round(q.z, 6)])
        row = [None] * len(subset)
        lo = float("inf")
        for mi, o in enumerate(meshes):
            ev = o.evaluated_get(dg)
            me = ev.to_mesh()
            co = np.empty(len(me.vertices) * 3, dtype=np.float64)
            me.vertices.foreach_get("co", co)
            co = co.reshape(-1, 3)
            mw = np.array(ev.matrix_world)
            wco = co @ mw[:3, :3].T + mw[:3, 3]
            lo = min(lo, float(wco[:, 2].min()))
            for k, v in by_mesh.get(mi, []):
                row[k] = [round(float(x), 6) for x in wco[v]]
            ev.to_mesh_clear()
        frames.append(row)
        min_up.append(round(lo, 6))

    out = {
        "candidate": a.candidate or os.path.splitext(os.path.basename(a.src))[0],
        "clip": act.name,
        "fps": scene.render.fps / scene.render.fps_base,
        "loop": a.loop,
        "up": "z",
        "units": "m",
        "source": os.path.abspath(a.src),
        "bones": bones,
        "rotations": rots,
        "mesh": {"rest": rest, "frames": frames, "edges": edges,
                 "edge_groups": groups, "min_up": min_up},
        "stats": {"triangles": tri, "open_edges": open_edges,
                  "file_mb": round(os.path.getsize(a.src) / 1048576, 3)},
    }
    with open(a.out, "w", encoding="utf-8") as fp:
        json.dump(out, fp, separators=(",", ":"))
    print(f"ok {a.out} frames={len(frames)} bones={len(bones)} verts={len(subset)} edges={len(edges)}")


main()
