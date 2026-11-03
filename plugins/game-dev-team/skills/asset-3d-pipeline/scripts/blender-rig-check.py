"""Rig + motion check: one fixed set of criteria for every candidate model and clip.

blender -b --factory-startup --python blender-rig-check.py -- \
    --in model.blend|.fbx|.glb --out check.json [--candidate w3] [--actions Walk,Chase] \
    [--kind auto|biped|quad|multi] [--foot-bones REGEX] [--hand-bones REGEX] [--body-bones REGEX] \
    [--region position|weight] [--hand-region weight|position] [--leg-box ZMAX,XMIN] \
    [--contact auto|height|velocity] [--contact-m 0.005] [--trim 1] [--sole-height M] [--ground M]

Per clip: ground penetration/float, sole height error while planted, foot slip (deviation from a
straight line inside planted spans), edge length change p99/max, leg-region max change,
seam split (overlapping vertex pairs drifting apart), hand-into-body depth (biped only), loop seam.
Per model: triangles, open edges, overlapping vertex pairs.

Leg and sole regions are fixed by REST-POSE POSITION (nearest bone segment), so candidates with
different weights are measured on the same vertices. --region weight reproduces older scripts.
Hand/body regions default to dominant weight: by position, shoulder skin that moves with the arm
counts as "body" and the forearm reads as penetrating it (false hits).
Contact: height (sole within 0.5cm of ground) for quad/multi; foot velocity for biped (long feet
roll heel-to-toe, so the sole minimum stays low while the foot swings). Both trim 1 frame per end.
The mode used is written in the JSON.
Only reads the file. Nothing is saved. Output feeds probe-metrics.py --rig-check.
"""
import argparse
import json
import os
import re
import sys
import time

import bpy
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from mathutils.kdtree import KDTree

VERSION = 1
# Fixed criteria (lessons 2026-10-30 / 2026-10-31). Change only with a reason written in the JSON.
CONTACT_M = 0.005        # planted = sole lowest point within 0.5cm of ground
TRIM = 1                 # drop 1 frame at each end of a planted span
SOLE_H = {"biped": 0.06, "quad": 0.08, "multi": 0.08}  # sole vertices = rest height below ground + this
OVERLAP_M = 1e-4         # vertices closer than this in rest pose = one seam pair
HAND_SEARCH_M = 0.08     # hand-into-body: body surface searched within 8cm
HAND_FACING = -0.3       # only surfaces facing the hand vertex (normal dot < -0.3)
HAND_COUNT_M = 0.01      # count vertices deeper than 1cm
VEL_TOL_MIN = 0.006      # velocity contact: min tolerance (m/frame)

FOOT_RE = r"(foot|toe|paw|hoof)(?!.*(end|tip|nub))"
LEG_RE = r"leg"
HAND_RE = r"(hand|fore_?arm|lower_?arm)"
BODY_RE = r"(hips|pelvis|spine|chest|neck|head|up_?leg|thigh|calf|shin|(?<!fore)leg)"
NOT_BODY_RE = r"(arm|hand|shoulder|clavicle|foot|toe)"


def parse():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    p = argparse.ArgumentParser()
    p.add_argument("--in", dest="src", required=True)
    p.add_argument("--out", required=True)
    p.add_argument("--candidate", default="")
    p.add_argument("--actions", default="", help="comma separated substrings of clip names; default = all")
    p.add_argument("--kind", default="auto", choices=["auto", "biped", "quad", "multi"])
    p.add_argument("--foot-bones", default="", help="regex; each matched chain = one foot")
    p.add_argument("--hand-bones", default=HAND_RE)
    p.add_argument("--body-bones", default=BODY_RE)
    p.add_argument("--region", default="position", choices=["position", "weight"], help="leg/sole regions")
    p.add_argument("--hand-region", default="weight", choices=["weight", "position"], help="hand/body regions")
    p.add_argument("--contact", default="auto", choices=["auto", "height", "velocity"],
                   help="auto = velocity for biped, height otherwise")
    p.add_argument("--leg-box", default="", help="ZMAX,XMIN in m: leg = rest height < ZMAX and |x| > XMIN")
    p.add_argument("--contact-m", type=float, default=CONTACT_M)
    p.add_argument("--trim", type=int, default=TRIM)
    p.add_argument("--sole-height", type=float, default=None)
    p.add_argument("--ground", type=float, default=None, help="default = rest-pose lowest vertex")
    return p.parse_args(argv)


def load(src):
    ext = os.path.splitext(src)[1].lower()
    if ext == ".blend":
        bpy.ops.wm.open_mainfile(filepath=src)
        return
    bpy.ops.wm.read_factory_settings(use_empty=True)
    if ext in (".glb", ".gltf"):
        bpy.ops.import_scene.gltf(filepath=src)
    elif ext == ".fbx":
        bpy.ops.import_scene.fbx(filepath=src)
    else:
        raise SystemExit(f"unsupported: {ext}")


def action_paths(act):
    paths = []
    try:
        for lay in act.layers:
            for st in lay.strips:
                for cb in st.channelbags:
                    paths += [f.data_path for f in cb.fcurves]
    except AttributeError:
        pass
    if not paths and hasattr(act, "fcurves"):
        paths = [f.data_path for f in act.fcurves]
    return paths


def set_action(arm, act):
    ad = arm.animation_data or arm.animation_data_create()
    for t in ad.nla_tracks:
        t.mute = True
    ad.action = act
    slots = list(getattr(act, "slots", []) or []) if act is not None else []
    if slots and hasattr(ad, "action_slot"):
        pick = next((s for s in slots if getattr(s, "identifier", "") == "OB" + arm.name), None) \
            or next((s for s in slots if getattr(s, "target_id_type", "") == "OBJECT"), None) or slots[0]
        try:
            ad.action_slot = pick
        except Exception as e:  # noqa: BLE001
            print("action_slot failed:", act.name, e, flush=True)


def seg_dist(v, a, b):
    ab = b - a
    t = np.clip(((v[:, None, :] - a[None]) * ab[None]).sum(2) / np.maximum((ab * ab).sum(1), 1e-12)[None], 0, 1)
    return np.linalg.norm(v[:, None, :] - (a[None] + t[..., None] * ab[None]), axis=2)


def main():
    o = parse()
    t0 = time.time()
    load(o.src)
    sc = bpy.context.scene
    vl = bpy.context.view_layer
    arms = [ob for ob in sc.objects if ob.type == "ARMATURE"]
    if not arms:
        raise SystemExit("no armature")
    skinned = {a.name: [m for m in sc.objects if m.type == "MESH" and m.find_armature() == a] for a in arms}
    arm = max(arms, key=lambda a: (sum(len(m.data.vertices) for m in skinned[a.name]), len(a.data.bones)))
    meshes = skinned[arm.name]
    if not meshes:
        raise SystemExit("no mesh deformed by armature " + arm.name)

    # ---- static topology (original mesh data) ----
    dom, edges, tris, offs = [], [], [], []
    n_open, n_tri = 0, 0
    off = 0
    for m in meshes:
        d = m.data
        gi = {g.index: g.name for g in m.vertex_groups}
        dom += [gi.get(max(v.groups, key=lambda g: g.weight).group, "") if len(v.groups) else "" for v in d.vertices]
        edges.append(np.array([e.vertices[:] for e in d.edges], int).reshape(-1, 2) + off)
        d.calc_loop_triangles()
        tris.append(np.array([t.vertices[:] for t in d.loop_triangles], int).reshape(-1, 3) + off)
        n_tri += len(d.loop_triangles)
        cnt = {}
        for poly in d.polygons:
            for k in poly.edge_keys:
                cnt[k] = cnt.get(k, 0) + 1
        n_open += sum(1 for e in d.edges if cnt.get(tuple(sorted(e.vertices[:])), 0) == 1)
        offs.append(off)
        off += len(d.vertices)
    nv = off
    dom = np.array(dom, dtype=object)
    edges = np.concatenate(edges)
    tris = np.concatenate(tris)

    def eval_co():
        vl.update()
        dg = bpy.context.evaluated_depsgraph_get()
        out = []
        for m in meshes:
            ev = m.evaluated_get(dg)
            mm = ev.to_mesh()
            if len(mm.vertices) != len(m.data.vertices):
                raise SystemExit(f"{m.name}: evaluated vertex count changed (topology modifier?)")
            co = np.empty(len(mm.vertices) * 3)
            mm.vertices.foreach_get("co", co)
            ev.to_mesh_clear()
            w = np.array(m.matrix_world)
            out.append(co.reshape(-1, 3) @ w[:3, :3].T + w[:3, 3])
        return np.concatenate(out)

    # ---- rest pose ----
    set_action(arm, None)
    for pb in arm.pose.bones:
        pb.matrix_basis.identity()
    rest = eval_co()
    ground = float(rest[:, 2].min()) if o.ground is None else o.ground
    ground_src = "rest_min" if o.ground is None else "option"

    # ---- bones, feet, kind ----
    bones = arm.data.bones
    names = [b.name for b in bones]
    mw = np.array(arm.matrix_world)
    deform = [b for b in bones if b.use_deform] or list(bones)
    bh = np.array([mw[:3, :3] @ np.array(b.head_local) + mw[:3, 3] for b in deform])
    bt = np.array([mw[:3, :3] @ np.array(b.tail_local) + mw[:3, 3] for b in deform])
    dnames = [b.name for b in deform]
    near = np.empty(nv, dtype=object)
    for s in range(0, nv, 4000):
        near[s:s + 4000] = np.array(dnames, dtype=object)[seg_dist(rest[s:s + 4000], bh, bt).argmin(1)]
    part_of = near if o.region == "position" else dom
    hand_of = near if o.hand_region == "position" else dom

    def chains(rx):
        hit = [b for b in bones if re.search(rx, b.name, re.I)]
        roots = [b for b in hit if b.parent not in hit]
        out = {}
        for r in roots:
            grp = [r] + [c for c in r.children_recursive if c in hit]
            out[r.name] = [g.name for g in grp]
        return out

    feet = chains(o.foot_bones) if o.foot_bones else chains(FOOT_RE)
    foot_src = "option" if o.foot_bones else "foot_regex"
    if not o.foot_bones and len(feet) < 2:
        legs = [b for b in bones if re.search(LEG_RE, b.name, re.I)]
        ends = [b for b in legs if not any(c in legs for c in b.children_recursive)]
        feet = {b.name: [b.name] for b in ends}
        foot_src = "leg_chain_end"
    if o.kind != "auto":
        kind, kind_src = o.kind, "option"
    else:
        kind = "biped" if len(feet) == 2 else ("quad" if len(feet) == 4 else "multi")
        kind_src = "auto"
    if not feet:
        raise SystemExit("no feet found; pass --foot-bones")

    # leg bones = each foot chain + its ancestors up to the first ancestor shared with another foot
    foot_root = {k: bones[k] for k in feet}
    leg_bones = {}
    for k, b in foot_root.items():
        others = [foot_root[j] for j in feet if j != k]
        chain = list(feet[k]) + [c.name for c in b.children_recursive]
        p = b.parent
        while p is not None and not any(p == ob or p in ob.parent_recursive for ob in others):
            chain.append(p.name)
            p = p.parent
        leg_bones[k] = sorted(set(chain))
    all_leg = set().union(*leg_bones.values())

    sole_h = o.sole_height if o.sole_height is not None else SOLE_H[kind]
    sole = {}
    for k in feet:
        member = set(feet[k]) if o.region == "weight" else set(leg_bones[k])
        idx = np.nonzero(np.isin(part_of, list(member)))[0]
        low = idx[rest[idx, 2] < ground + sole_h]
        sole[k] = low if len(low) else idx
    if o.leg_box:
        zmax, xmin = (float(x) for x in o.leg_box.split(","))
        inleg = (rest[:, 2] - ground < zmax) & (np.abs(rest[:, 0]) > xmin)
        leg_src = f"box z<{zmax} |x|>{xmin}"
    else:
        inleg = np.isin(part_of, list(all_leg))
        leg_src = o.region
    leg_edges = np.nonzero(inleg[edges[:, 0]] & inleg[edges[:, 1]])[0]

    # seam pairs
    kd = KDTree(nv)
    for i, pt in enumerate(rest):
        kd.insert(pt, i)
    kd.balance()
    pairs = sorted({(min(i, j), max(i, j)) for i in range(nv) for _, j, _ in kd.find_range(rest[i], OVERLAP_M) if j != i})
    pairs = np.array(pairs, int).reshape(-1, 2)
    pair_rest = np.linalg.norm(rest[pairs[:, 0]] - rest[pairs[:, 1]], axis=1) if len(pairs) else None
    rest_len = np.linalg.norm(rest[edges[:, 0]] - rest[edges[:, 1]], axis=1)

    # hand-into-body (biped with hand bones)
    hand_set = [n for n in names if re.search(o.hand_bones, n, re.I)]
    body_set = [n for n in names if re.search(o.body_bones, n, re.I) and not re.search(NOT_BODY_RE, n, re.I)]
    do_hand = kind == "biped" and bool(hand_set) and bool(body_set)
    if do_hand:
        probe = np.nonzero(np.isin(hand_of, hand_set))[0]
        isb = np.isin(hand_of, body_set)
        body_tris = tris[isb[tris[:, 0]] & isb[tris[:, 1]] & isb[tris[:, 2]]]
        do_hand = len(probe) > 0 and len(body_tris) > 0

    def vnormals(co):
        v0, v1, v2 = co[tris[:, 0]], co[tris[:, 1]], co[tris[:, 2]]
        fn = np.cross(v1 - v0, v2 - v0)
        n = np.zeros_like(co)
        for k in range(3):
            np.add.at(n, tris[:, k], fn)
        return n / np.maximum(np.linalg.norm(n, axis=1, keepdims=True), 1e-12)

    def hand_depth(co):
        vn = vnormals(co)
        bvh = BVHTree.FromPolygons([tuple(p) for p in co], [tuple(t) for t in body_tris], all_triangles=True)
        depth = np.zeros(len(co))
        for vi in probe:
            p = Vector(co[vi])
            loc, nrm, _, dist = bvh.find_nearest(p, HAND_SEARCH_M)
            if loc is not None and (p - loc).dot(nrm) < 0 and float(np.dot(vn[vi], np.array(nrm))) < HAND_FACING:
                depth[vi] = dist
        return depth

    pen0 = hand_depth(rest) if do_hand else None
    contact_mode = o.contact if o.contact != "auto" else ("velocity" if kind == "biped" else "height")
    do_vel = contact_mode == "velocity" or kind == "biped"

    def spans(contact):
        i, n = 0, len(contact)
        while i < n:
            if not contact[i]:
                i += 1
                continue
            j = i
            while j < n and contact[j]:
                j += 1
            yield i, j
            i = j

    def line_dev(a, contact):
        worst = 0.0
        tr = o.trim
        for i, j in spans(contact):
            seg = a[i + tr:j - tr, :2] if j - i > 2 * tr + 2 else a[i:j, :2]
            if len(seg) >= 3:
                t = np.arange(len(seg))
                fit = np.stack([np.polyval(np.polyfit(t, seg[:, k], 1), t) for k in (0, 1)], 1)
                worst = max(worst, float(np.linalg.norm(seg - fit, axis=1).max()))
        return worst

    def foot_height(a):
        contact = a[:, 2] < o.contact_m
        off_ = float(np.abs(a[contact, 2]).max()) if contact.any() else None
        return dict(slip_cm=round(line_dev(a, contact) * 100, 2), contact_pct=round(float(contact.mean()) * 100, 1),
                    stance_off_cm=None if off_ is None else round(off_ * 100, 2))

    def foot_velocity(a):
        # planted = foot speed close to the planted-foot speed (median of the lower half) and height in lower 75%
        xy, z = a[:, :2], a[:, 2]
        if len(a) < 3:
            return dict(slip_cm=None, contact_pct=None, stance_off_cm=None)
        v = np.gradient(xy, axis=0)
        low = z <= np.percentile(z, 50)
        cst = np.median(v[low], axis=0)
        tol = max(0.5 * float(np.linalg.norm(cst)), VEL_TOL_MIN)
        contact = (np.linalg.norm(v - cst, axis=1) < tol) & (z <= np.percentile(z, 75))
        for _ in range(2):
            contact[1:-1] |= contact[:-2] & contact[2:]
        off_ = float(np.abs(z[contact]).max()) if contact.any() else None
        return dict(slip_cm=round(line_dev(a, contact) * 100, 2), contact_pct=round(float(contact.mean()) * 100, 1),
                    stance_off_cm=None if off_ is None else round(off_ * 100, 2))

    fps = sc.render.fps / sc.render.fps_base
    want = [s.strip() for s in o.actions.split(",") if s.strip()]
    res_clips = {}
    skipped = []
    for act in bpy.data.actions:
        nm = act.name.split("|")[-1]
        if want and not any(s in nm for s in want):
            continue
        paths = action_paths(act)
        if paths and not any(pth.startswith("pose.bones") for pth in paths):
            skipped.append(nm)
            continue
        tc = time.time()
        set_action(arm, act)
        f0, f1 = (int(round(x)) for x in act.frame_range)
        feet_tr = {k: [] for k in feet}
        lows = []
        allmax = np.zeros(len(edges))
        split = 0.0
        hp, hpv = 0.0, 0
        first = last = None
        for f in range(f0, f1 + 1):
            sc.frame_set(f)
            co = eval_co()
            if first is None:
                first = co
            last = co
            lows.append(float(co[:, 2].min()) - ground)
            for k in feet:
                p = co[sole[k]]
                feet_tr[k].append(np.r_[p[:, :2].mean(0), p[:, 2].min() - ground])
            allmax = np.maximum(allmax, np.abs(np.linalg.norm(co[edges[:, 0]] - co[edges[:, 1]], axis=1) - rest_len))
            if pair_rest is not None:
                split = max(split, float((np.linalg.norm(co[pairs[:, 0]] - co[pairs[:, 1]], axis=1) - pair_rest).max()))
            if do_hand:
                d = np.maximum(hand_depth(co) - pen0, 0)
                hp = max(hp, float(d.max()))
                hpv = max(hpv, int((d > HAND_COUNT_M).sum()))
        per_foot = {}
        for k in feet:
            a = np.array(feet_tr[k])
            per_foot[k] = {"height": foot_height(a)}
            if do_vel:
                per_foot[k]["velocity"] = foot_velocity(a)
        lo = min(lows)

        def agg(mode, key, how):
            vals = [pf[mode][key] for pf in per_foot.values() if mode in pf and pf[mode][key] is not None]
            if not vals:
                return None
            return round(max(vals), 2) if how == "max" else round(float(np.mean(vals)), 1)

        cm = contact_mode
        r = dict(
            frames=f1 - f0 + 1, sec=round((f1 - f0) / fps, 3), contact=cm,
            ground_pen_cm=round(max(-lo, 0) * 100, 2), ground_float_cm=round(max(lo, 0) * 100, 2),
            max_low_cm=round(max(lows) * 100, 2),
            slip_cm=agg(cm, "slip_cm", "max"), stance_off_cm=agg(cm, "stance_off_cm", "max"),
            contact_pct=agg(cm, "contact_pct", "mean"),
            stretch_p99_mm=round(float(np.percentile(allmax, 99)) * 1000, 2),
            stretch_max_mm=round(float(allmax.max()) * 1000, 2),
            leg_stretch_mm=round(float(allmax[leg_edges].max()) * 1000, 2) if len(leg_edges) else None,
            seam_split_mm=round(max(split, 0.0) * 1000, 3) if pair_rest is not None else None,
            hand_pen_cm=round(hp * 100, 2) if do_hand else None,
            hand_pen_verts=hpv if do_hand else None,
            loop_seam_cm=round(float(np.linalg.norm(first - last, axis=1).max()) * 100, 2),
            feet=per_foot,
        )
        res_clips[nm] = r
        print(nm, {k: v for k, v in r.items() if k != "feet"}, f"{time.time() - tc:.1f}s", flush=True)

    hips = next((b for b in bones if re.search(r"^(mixamorig:)?(hips|pelvis)$", b.name, re.I)), None)
    out = {
        "tool": "blender-rig-check", "version": VERSION,
        "candidate": o.candidate or os.path.splitext(os.path.basename(o.src))[0],
        "source": os.path.basename(o.src), "blender": bpy.app.version_string,
        "armature": arm.name, "meshes": [m.name for m in meshes],
        "kind": kind, "kind_source": kind_src, "up": "z", "units": "m", "fps": fps,
        "criteria": {
            "ground_m": ground, "ground_source": ground_src,
            "contact": contact_mode, "contact_m": o.contact_m, "trim_frames": o.trim,
            "velocity_rule": ("planted = |foot xy speed - median speed of lower-half frames| < max(0.5*|median|, "
                              f"{VEL_TOL_MIN} m/frame) and height <= 75th percentile; 1-frame gaps filled twice")
            if do_vel else None,
            "feet_detail_modes": ["height"] + (["velocity"] if do_vel else []),
            "sole_height_m": sole_h, "region": o.region, "leg_region": leg_src, "hand_region": o.hand_region,
            "overlap_m": OVERLAP_M,
            "hand_search_m": HAND_SEARCH_M, "hand_facing_dot": HAND_FACING, "hand_count_m": HAND_COUNT_M,
            "slip": "planted span (both ends trimmed) max deviation from a fitted straight line, xy",
        },
        "model": {"vertices": nv, "triangles": n_tri, "open_edges": n_open, "overlap_pairs": int(len(pairs)),
                  "bones": len(bones), "hips_height_m": float((arm.matrix_world @ hips.head_local).z) if hips else None},
        "feet": {k: {"bones": feet[k], "leg_bones": leg_bones[k], "sole_verts": int(len(sole[k]))} for k in feet},
        "foot_source": foot_src,
        "regions": {"leg_edges": int(len(leg_edges)), "hand_bones": hand_set if do_hand else [],
                    "body_bones": body_set if do_hand else [],
                    "hand_verts": int(len(probe)) if do_hand else 0, "body_tris": int(len(body_tris)) if do_hand else 0},
        "skipped_actions": skipped,
        "clips": res_clips,
        "elapsed_s": round(time.time() - t0, 1),
    }
    os.makedirs(os.path.dirname(os.path.abspath(o.out)), exist_ok=True)
    with open(o.out, "w", encoding="utf-8") as fp:
        json.dump(out, fp, ensure_ascii=False, indent=1)
    print("DONE", o.out, f"{out['elapsed_s']}s", flush=True)


if __name__ == "__main__":
    main()
