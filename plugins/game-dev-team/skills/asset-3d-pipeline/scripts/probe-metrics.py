"""Probe metrics: compare 2-3 candidates of the same asset task on the same metric table.

Raw frames (from blender-dump-frames.py or a Unity batch dump):
    python probe-metrics.py a.json b.json c.json [--ref source.json] [--md out.md] [--out out.json]

Existing Unity per-clip summary (EmoteCompare metrics.json style):
    python probe-metrics.py --unity-metrics metrics.json [--unity-metrics other.json ...] [--keys Wave,Dance1]

Thresholds are provisional flags, not verdicts. Override with --thresholds t.json.
Exit: 0 = no flag exceeded / 1 = some flag exceeded / 3 = nothing measurable.
Standard library + numpy only. Input format: references/propose-probe-compose.md.
"""
import argparse
import json
import math
import os
import re
import sys

import numpy as np

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

# key: (label, unit, limit, direction, basis). limit None = no default, shown as [확인 필요].
THRESHOLDS = {
    "effector_err_max_m": ("손·발 끝 위치 오차 최대", "m", 0.05, "max", "[확인 필요]"),
    "stretch_max_mm": ("간선 최대 늘어남", "mm", 30.0, "max",
                       "web/docs/43 어깨 임시 기준 30mm(HatKid 모델). 다른 모델은 [확인 필요]"),
    "foot_slide_cm": ("발 미끄러짐 최대", "cm", 5.0, "max", "[확인 필요]"),
    "ground_penetration_cm": ("바닥 관통", "cm", 1.0, "max", "[확인 필요]"),
    "ground_float_cm": ("바닥 뜸", "cm", 2.0, "max", "[확인 필요]"),
    "seam_rot_deg": ("반복 이음새 회전", "deg", 5.0, "max", "[확인 필요]"),
    "seam_pos_cm": ("반복 이음새 위치", "cm", 2.0, "max", "[확인 필요]"),
    "open_edges": ("열린 모서리 수", "개", None, "max",
                   "삼각형 수보다 많으면 표면 조각남(함정 목록). 절대 기준 [확인 필요]"),
    "triangles": ("삼각형 수", "개", None, "max", "프로젝트 예산(asset-budget) [확인 필요]"),
    "file_mb": ("용량", "MB", None, "max", "프로젝트 예산(asset-budget) [확인 필요]"),
    "renders": ("정면·측면·뒷면 렌더", "장", 3, "min", "3장 모두 있어야 외형 판정 가능"),
}
ORDER = list(THRESHOLDS)

SIDE = {"l": r"(left|^l[_.:\s]|[_.:\s]l$|[_.]l[_.]|_l\b|\.l\b)", "r": r"(right|^r[_.:\s]|[_.:\s]r$|[_.]r[_.]|_r\b|\.r\b)"}
PART = {"hand": r"hand(?!.*(thumb|index|middle|ring|pinky|end))", "foot": r"(foot|ankle)(?!.*end)"}


def find_bone(names, side, part):
    hits = [n for n in names if re.search(PART[part], n, re.I) and re.search(SIDE[side], n, re.I)]
    return min(hits, key=len) if hits else None


def find_hips(names):
    for pat in (r"^(mixamorig:)?hips$", r"pelvis", r"hips?", r"root"):
        hits = [n for n in names if re.search(pat, n, re.I)]
        if hits:
            return min(hits, key=len)
    return None


def axes(up):
    """Return (up index, horizontal index pair)."""
    return (2, (0, 1)) if up == "z" else (1, (0, 2))


def load(path):
    with open(path, encoding="utf-8") as fp:
        d = json.load(fp)
    d["_dir"] = os.path.dirname(os.path.abspath(path))
    d["_path"] = path
    return d


def quat_angle(a, b):
    a, b = np.asarray(a, float), np.asarray(b, float)
    dot = abs(float(np.dot(a / np.linalg.norm(a), b / np.linalg.norm(b))))
    return math.degrees(2 * math.acos(min(1.0, dot)))


def contact_slide(pos, ui, hi, eps):
    """Max horizontal drift (m) inside each contact span. Contact = within eps of the foot's lowest height."""
    h = pos[:, ui]
    contact = h <= h.min() + eps
    best, start = 0.0, None
    for t in range(len(pos)):
        if contact[t]:
            if start is None:
                start = t
            d = float(np.linalg.norm(pos[t, list(hi)] - pos[start, list(hi)]))
            best = max(best, d)
        else:
            start = None
    return best


def raw_metrics(d, ref, opt):
    m, notes = {}, []
    ui, hi = axes(d.get("up", "y"))
    bones = {k: np.asarray(v, float) for k, v in d.get("bones", {}).items()}
    names = list(bones)
    hips = find_hips(names)
    eff = d.get("effectors") or {}
    for side in "lr":
        for part in ("hand", "foot"):
            eff.setdefault(f"{part}_{side}", find_bone(names, side, part))

    # effector error vs reference (hip-relative, scaled by hip height ratio)
    if ref is not None and hips:
        rb = {k: np.asarray(v, float) for k, v in ref.get("bones", {}).items()}
        rui, _ = axes(ref.get("up", "y"))
        rh = find_hips(list(rb))
        reff = ref.get("effectors") or {}
        errs = []
        if rh:
            n = min(len(bones[hips]), len(rb[rh]))
            ti = np.linspace(0, len(bones[hips]) - 1, n).round().astype(int)
            ri = np.linspace(0, len(rb[rh]) - 1, n).round().astype(int)
            s = bones[hips][0, ui] / rb[rh][0, rui] if rb[rh][0, rui] else 1.0
            for key, bn in eff.items():
                side, part = key.split("_")[1], key.split("_")[0]
                rn = reff.get(key) or find_bone(list(rb), side, part)
                if not bn or not rn or bn not in bones:
                    continue
                c = bones[bn][ti] - bones[hips][ti]
                r = (rb[rn][ri] - rb[rh][ri]) * s
                if ui != rui:  # bring reference to candidate up axis (z-up <-> y-up, right-handed)
                    r = r[:, [0, 2, 1]] * (np.array([1, 1, -1]) if rui == 2 else np.array([1, -1, 1]))
                errs.append(float(np.linalg.norm(c - r, axis=1).max()))
            if errs:
                m["effector_err_max_m"] = max(errs)
                notes.append("위치 오차는 골반 기준·골반 높이 비율로 맞춘 값")
    # foot slide
    slides = [contact_slide(bones[b], ui, hi, opt.contact_eps) for k, b in eff.items()
              if k.startswith("foot") and b in bones]
    if slides:
        m["foot_slide_cm"] = max(slides) * 100
    # stretch
    mesh = d.get("mesh") or {}
    if mesh.get("frames") and mesh.get("edges"):
        fr = np.asarray(mesh["frames"], float)
        e = np.asarray(mesh["edges"], int)
        base = np.asarray(mesh["rest"], float) if mesh.get("rest") else fr[0]
        l0 = np.linalg.norm(base[e[:, 0]] - base[e[:, 1]], axis=1)
        lt = np.linalg.norm(fr[:, e[:, 0]] - fr[:, e[:, 1]], axis=2)
        dl = np.clip(lt - l0, 0, None).max(axis=0) * 1000  # elongation only; rest = bind pose
        m["stretch_max_mm"] = float(dl.max())
        top = []
        for g, idx in (mesh.get("edge_groups") or {}).items():
            if idx:
                top.append((float(dl[idx].max()), g))
        top.sort(reverse=True)
        if top:
            notes.append("늘어남 상위: " + ", ".join(f"{g} {v:.1f}mm" for v, g in top[:3]))
    # ground
    lows = None
    if mesh.get("min_up"):
        lows = np.asarray(mesh["min_up"], float)
    elif mesh.get("frames"):
        lows = np.asarray(mesh["frames"], float)[:, :, ui].min(axis=1)
    if lows is not None:
        g = opt.ground
        m["ground_penetration_cm"] = max(0.0, g - float(lows.min())) * 100
        m["ground_float_cm"] = max(0.0, float(lows.min()) - g) * 100
    # loop seam
    if d.get("loop") and bones:
        hp = bones.get(hips)
        pos = [(float(np.linalg.norm((v[0] - v[-1]) if (k == hips or hp is None)
                                     else ((v[0] - hp[0]) - (v[-1] - hp[-1])))), k)
               for k, v in bones.items()]
        best = max(pos)
        m["seam_pos_cm"] = best[0] * 100
        rots = d.get("rotations") or {}
        if rots:
            ang = max((quat_angle(v[0], v[-1]), k) for k, v in rots.items())
            m["seam_rot_deg"] = ang[0]
            notes.append(f"이음새 최대: 위치 {best[1]}, 회전 {ang[1]}")
    for k in ("open_edges", "triangles", "file_mb"):
        if k in (d.get("stats") or {}):
            m[k] = d["stats"][k]
    ren = d.get("renders")
    if ren is not None:
        have = [v for v in ("front", "side", "back") if ren.get(v) and os.path.exists(os.path.join(d["_dir"], ren[v]))]
        m["renders"] = len(have)
    return m, notes


def unity_rows(d, keys):
    """Map EmoteCompare metrics.json fields to the standard keys. Definitions differ - see notes."""
    rows = []
    for c in d:
        if keys and c.get("key") not in keys:
            continue
        m = {
            "foot_slide_cm": max(c.get("slideL", 0), c.get("slideR", 0)) * 100,
            "ground_penetration_cm": max(0.0, -c.get("minMeshY", 0)) * 100,
            "ground_float_cm": max(0.0, c.get("minMeshY", 0)) * 100,
        }
        if c.get("loop"):
            m["seam_rot_deg"] = c.get("seamRotDeg", 0.0)
            m["seam_pos_cm"] = c.get("seamHip", 0.0) * 100
        rows.append((c.get("key", "?"), m, [f"clip {c.get('clip')}", f"{c.get('length', 0):.2f}s"]))
    return rows


def flag(key, v, th):
    lim, how = th[key][2], th[key][3]
    if v is None or lim is None:
        return False
    return v > lim if how == "max" else v < lim


def fmt(v):
    if v is None:
        return "측정 불가"
    if isinstance(v, int):
        return str(v)
    return f"{v:.3f}" if abs(v) < 1 else f"{v:.1f}"


def table(cols, th):
    used = [k for k in ORDER if any(k in m for _, m, _ in cols)]
    head = "| 지표 | 단위 | 임시 기준 | " + " | ".join(n for n, _, _ in cols) + " |"
    out = [head, "|" + "---|" * (3 + len(cols))]
    over = False
    for k in used:
        lab, unit, lim, how, basis = th[k]
        limtxt = ("측정만" if lim is None else (f"≤{lim}" if how == "max" else f"≥{lim}")) + (" [확인 필요]" if "확인 필요" in basis else "")
        cells = []
        for _, m, _ in cols:
            v = m.get(k)
            f = flag(k, v, th)
            over |= f
            cells.append(fmt(v) + (" **초과**" if f else ""))
        out.append(f"| {lab} | {unit} | {limtxt} | " + " | ".join(cells) + " |")
    return "\n".join(out), over, bool(used)


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("candidates", nargs="*")
    p.add_argument("--ref")
    p.add_argument("--unity-metrics", action="append", default=[])
    p.add_argument("--keys", default="")
    p.add_argument("--thresholds")
    p.add_argument("--ground", type=float, default=0.0)
    p.add_argument("--contact-eps", type=float, default=0.03, help="m above the foot's lowest height counted as contact")
    p.add_argument("--md")
    p.add_argument("--out")
    a = p.parse_args()

    th = dict(THRESHOLDS)
    if a.thresholds:
        with open(a.thresholds, encoding="utf-8") as fp:
            for k, v in json.load(fp).items():
                if k in th:
                    lab, unit, _, how, _ = th[k]
                    th[k] = (lab, unit, v.get("limit"), v.get("direction", how), v.get("basis", "프로젝트 지정"))

    cols = []
    ref = load(a.ref) if a.ref else None
    for c in a.candidates:
        d = load(c)
        m, notes = raw_metrics(d, ref, a)
        cols.append((d.get("candidate") or os.path.basename(c), m, [f"clip {d.get('clip', '?')}"] + notes))
    keys = set(filter(None, a.keys.split(",")))
    for u in a.unity_metrics:
        with open(u, encoding="utf-8") as fp:
            rows = unity_rows(json.load(fp), keys)
        tag = os.path.basename(os.path.dirname(os.path.abspath(u)))
        cols += [(f"{tag}:{k}" if len(a.unity_metrics) > 1 else k, m, n) for k, m, n in rows]
    if not cols:
        print("측정 불가: 입력 없음", file=sys.stderr)
        sys.exit(3)

    md, over, any_m = table(cols, th)
    lines = ["# Probe 지표 비교", "", md, "", "## 메모"]
    for n, _, notes in cols:
        lines.append(f"- {n}: " + "; ".join(notes))
    if a.unity_metrics:
        lines.append("- Unity 요약 입력: 발 미끄러짐=max(slideL,slideR), 이음새 위치=seamHip. 원시 프레임 입력과 정의가 다를 수 있다.")
    lines.append("- 임시 기준은 표시용이다. 채택은 렌더와 함께 사람이 정한다. 수치 하나로 결론 내지 않는다.")
    text = "\n".join(lines)
    print(text)
    if a.md:
        with open(a.md, "w", encoding="utf-8") as fp:
            fp.write(text + "\n")
    if a.out:
        with open(a.out, "w", encoding="utf-8") as fp:
            json.dump({"candidates": [{"name": n, "metrics": m, "notes": no} for n, m, no in cols],
                       "exceeded": over}, fp, ensure_ascii=False, indent=1)
    if not any_m:
        sys.exit(3)
    sys.exit(1 if over else 0)


if __name__ == "__main__":
    main()
