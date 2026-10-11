"""GameDevTeam sprite stages. No generation result is automatically approved.

Python 3.10+, Pillow, numpy, requests. Models/nodes are external dependencies.
"""
import argparse
import hashlib
import json
import os
import subprocess
import sys
import time
from pathlib import Path

import numpy as np
import requests
from PIL import Image, ImageDraw


def write_json(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2, ensure_ascii=False), encoding="utf-8")


def sha(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(4 * 1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def read_json(path):
    return json.loads(Path(path).read_text(encoding="utf-8-sig"))


def images(folder):
    files = sorted(Path(folder).glob("*.png"))
    if not files:
        raise ValueError(f"No PNG frames: {folder}")
    return files


def ffmpeg():
    import imageio_ffmpeg
    return imageio_ffmpeg.get_ffmpeg_exe()


def extract(video, out, fps):
    Path(out).mkdir(parents=True, exist_ok=True)
    subprocess.run([ffmpeg(), "-y", "-i", str(video), "-vf", f"fps={fps}",
                    str(Path(out) / "frame_%04d.png")], check=True)


class Comfy:
    def __init__(self, host):
        self.base = host.rstrip("/")
        self.s = requests.Session()

    def get(self, endpoint):
        r = self.s.get(self.base + endpoint, timeout=30)
        r.raise_for_status()
        return r.json()

    def upload(self, path):
        with open(path, "rb") as f:
            r = self.s.post(self.base + "/upload/image", files={"image": f},
                            data={"type": "input", "overwrite": "false"}, timeout=120)
        r.raise_for_status()
        data = r.json()
        return "/".join(filter(None, [data.get("subfolder"), data["name"]]))

    def run(self, graph, out, timeout):
        job_file = Path(out) / "job.json"
        if job_file.exists():
            job = read_json(job_file)
            if job.get("host") != self.base:
                raise ValueError("Existing job belongs to a different server")
            return self.collect(job["prompt_id"], out, timeout)
        r = self.s.post(self.base + "/prompt", json={"prompt": graph,
                        "client_id": "gdt-sprite-lab"}, timeout=30)
        r.raise_for_status()
        body = r.json()
        if body.get("node_errors"):
            raise ValueError(json.dumps(body["node_errors"]))
        pid = body["prompt_id"]
        write_json(Path(out) / "job.json", {"prompt_id": pid, "host": self.base})
        return self.collect(pid, out, timeout)

    def collect(self, pid, out, timeout):
        end = time.monotonic() + timeout
        while time.monotonic() < end:
            entry = self.get("/history/" + pid).get(pid)
            if entry and entry.get("status", {}).get("status_str") == "error":
                write_json(Path(out) / "history.json", entry)
                raise RuntimeError("Comfy execution error; see history.json")
            if entry and entry.get("status", {}).get("completed"):
                write_json(Path(out) / "history.json", entry)
                saved = []
                for node, result in entry.get("outputs", {}).items():
                    for key in ("images", "gifs", "videos"):
                        for index, item in enumerate(result.get(key, [])):
                            if not isinstance(item, dict) or not item.get("filename"):
                                continue
                            name = Path(item["filename"]).name
                            dest = Path(out) / "raw" / f"{node}_{index:04d}_{name}"
                            dest.parent.mkdir(parents=True, exist_ok=True)
                            response = self.s.get(self.base + "/view", params={
                                "filename": item["filename"], "subfolder": item.get("subfolder", ""),
                                "type": item.get("type", "output")}, timeout=180)
                            response.raise_for_status()
                            dest.write_bytes(response.content)
                            saved.append({"path": str(dest), "sha256": sha(dest), "node": node})
                if not saved:
                    raise RuntimeError("Job completed without downloadable image/video outputs")
                return saved
            time.sleep(2)
        raise TimeoutError(f"Job {pid} still queued/running; resume using job.json, not a new submission")


def build_graph(spec, info):
    """Construct native API graph from explicit model choices, not widget positions."""
    g = {}

    def add(kind, **inputs):
        if kind not in info:
            raise LookupError(f"Missing Comfy node: {kind}")
        schema = info[kind].get("input", {})
        for key, desc in schema.get("required", {}).items():
            if key in inputs:
                continue
            options = desc[1] if len(desc) > 1 and isinstance(desc[1], dict) else {}
            if "default" in options:
                inputs[key] = options["default"]
            else:
                raise ValueError(f"Required input missing: {kind}.{key}")
        declared = {**schema.get("required", {}), **schema.get("optional", {})}
        for key, value in inputs.items():
            if key not in declared:
                raise ValueError(f"Unknown input: {kind}.{key}")
            desc = declared[key]
            choices = desc[0] if isinstance(desc[0], list) else (
                desc[1].get("options") if len(desc) > 1 and isinstance(desc[1], dict) else None)
            # Uploads add filenames after object_info was read; server validates the file on submission.
            if kind != "LoadImage" and isinstance(value, str) and choices is not None and value not in choices:
                raise FileNotFoundError(f"Model/choice unavailable: {kind}.{key}={value}")
        nid = str(len(g) + 1)
        g[nid] = {"class_type": kind, "inputs": inputs}
        return [nid, 0]

    backend = spec["backend"]
    models = spec.get("models", {})
    frame_count = spec.get("frames", 25)
    width, height = spec.get("canvas", [512, 512])
    if backend != "animatediff" and (frame_count - 1) % 4:
        raise ValueError("Wan frame count must be 4n+1")
    ref = add("LoadImage", image=spec["reference_server"]) if spec.get("reference_server") else None
    motion = None
    if spec.get("driver"):
        motion = add("VHS_LoadImagesPath", directory=str(Path(spec["driver"]).resolve()),
                     image_load_cap=frame_count, skip_first_images=0, select_every_nth=1)
    if backend == "animatediff":
        ckpt = add("CheckpointLoaderSimple", ckpt_name=models["checkpoint"])
        clip, vae = [ckpt[0], 1], [ckpt[0], 2]
        base_model = ckpt
        if models.get("ipadapter"):
            if not ref:
                raise ValueError("IP-Adapter requires an explicit reference")
            adapter = add("IPAdapterModelLoader", ipadapter_file=models["ipadapter"])
            vision = add("CLIPVisionLoader", clip_name=models["vision"])
            base_model = add("IPAdapterAdvanced", model=base_model, ipadapter=adapter, image=ref,
                             clip_vision=vision, weight=spec.get("reference_weight", .75),
                             weight_type="linear", combine_embeds="concat", start_at=0.0, end_at=1.0,
                             embeds_scaling="V only")
        mm = add("ADE_LoadAnimateDiffModel", model_name=models["motion"])
        applied = add("ADE_ApplyAnimateDiffModelSimple", motion_model=mm)
        model = add("ADE_UseEvolvedSampling", model=base_model, m_models=applied, beta_schedule="autoselect")
        positive = add("CLIPTextEncode", clip=clip, text=spec["prompt"])
        negative = add("CLIPTextEncode", clip=clip, text=spec.get("negative", ""))
        if motion:
            # A canny ControlNet needs actual edge frames, not the driver RGB.
            edges = add("Canny", image=motion, low_threshold=0.1, high_threshold=0.3)
            cn = add("ControlNetLoader", control_net_name=models["controlnet"])
            controlled = add("ControlNetApplyAdvanced", positive=positive, negative=negative,
                             control_net=cn, image=edges, strength=spec.get("control_strength", 0.8),
                             start_percent=0.0, end_percent=1.0)
            positive, negative = controlled, [controlled[0], 1]
            latent = add("VAEEncode", pixels=motion, vae=vae)
        else:
            latent = add("EmptyLatentImage", width=width, height=height, batch_size=frame_count)
    else:
        model = add("UNETLoader", unet_name=models["diffusion"], weight_dtype="default")
        if models.get("lora"):
            model = add("LoraLoaderModelOnly", model=model, lora_name=models["lora"],
                        strength_model=spec.get("lora_strength", 1.0))
        if models.get("acceleration_lora"):
            model = add("LoraLoaderModelOnly", model=model, lora_name=models["acceleration_lora"],
                        strength_model=spec.get("acceleration_strength", .8))
        model = add("ModelSamplingSD3", model=model, shift=spec.get("shift", 5.0))
        clip = add("CLIPLoader", clip_name=models["text"], type="wan", device="cpu")
        vae = add("VAELoader", vae_name=models["vae"])
        positive = add("CLIPTextEncode", clip=clip, text=spec["prompt"])
        negative = add("CLIPTextEncode", clip=clip, text=spec.get("negative", ""))
        if backend == "wan-alpha":
            latent = add("EmptyHunyuanLatentVideo", width=width, height=height,
                         length=frame_count, batch_size=1)
        else:
            if not ref or not motion:
                raise ValueError("Motion backend needs reference and driver frames")
            conditions = dict(positive=positive, negative=negative, vae=vae,
                              width=width, height=height, length=frame_count, batch_size=1,
                              reference_image=ref)
            if backend == "vace":
                cond = add("WanVaceToVideo", **conditions, control_video=motion,
                           strength=spec.get("control_strength", 1.0))
            elif backend == "wan-animate2":
                cv = add("CLIPVisionLoader", clip_name=models["vision"])
                enc = add("CLIPVisionEncode", clip_vision=cv, image=ref, crop="center")
                first_motion = add("ImageFromBatch", image=motion, batch_index=0, length=1)
                motion_enc = add("CLIPVisionEncode", clip_vision=cv, image=first_motion, crop="center")
                motion_prompt = add("CLIPTextEncode", clip=clip, text=spec.get("motion_prompt", "A person walking to the right, side view, fixed camera"))
                cond = add("WanAnimate2ToVideo", **conditions, pose_video=motion,
                           clip_vision_output=enc, clip_vision_output_pose=motion_enc,
                           positive_pose=motion_prompt, video_frame_offset=0)
            elif backend == "scail2":
                # Explicit user-authored/tracked color correspondence masks are mandatory.
                if not spec.get("reference_mask_server") or not spec.get("driver_masks"):
                    raise ValueError("SCAIL2 requires colored reference_mask and driver_masks")
                rm = add("LoadImage", image=spec["reference_mask_server"])
                dm = add("VHS_LoadImagesPath", directory=str(Path(spec["driver_masks"]).resolve()),
                         image_load_cap=frame_count, skip_first_images=0, select_every_nth=1)
                cv = add("CLIPVisionLoader", clip_name=models["vision"])
                enc = add("CLIPVisionEncode", clip_vision=cv, image=ref, crop="none")
                cond = add("WanSCAILToVideo", **conditions, pose_video=motion, pose_video_mask=dm,
                           reference_image_mask=rm, replacement_mode=False,
                           clip_vision_output=enc, video_frame_offset=0, previous_frame_count=5)
            else:
                raise ValueError(f"Unknown backend: {backend}")
            positive, negative, latent = cond, [cond[0], 1], [cond[0], 2]
    samples = add("KSampler", model=model, positive=positive, negative=negative, latent_image=latent,
                  seed=spec.get("seed", 42), steps=spec.get("steps", 20), cfg=spec.get("cfg", 6.0),
                  sampler_name=spec.get("sampler", "uni_pc"), scheduler=spec.get("scheduler", "simple"),
                  denoise=spec.get("denoise", 1.0))
    if backend in ("vace", "wan-animate2"):
        samples = add("TrimVideoLatent", samples=samples, trim_amount=[cond[0], 3])
    rgb = add("VAEDecodeTiled", samples=samples, vae=vae, tile_size=256, overlap=64,
              temporal_size=16, temporal_overlap=4)
    if backend == "wan-alpha":
        alpha_vae = add("VAELoader", vae_name=models["alpha_vae"])
        decoded = add("VAEDecodeTiled", samples=samples, vae=alpha_vae, tile_size=256,
                      overlap=64, temporal_size=16, temporal_overlap=4)
        mask = add("ImageToMask", image=decoded, channel="red")
        mask = add("InvertMask", mask=mask)
        rgb = add("JoinImageWithAlpha", image=rgb, alpha=mask)
    add("SaveImage", images=rgb, filename_prefix="sprite_lab/" + backend)
    return g


def pixellab(spec, out, execute, timeout):
    # Save a reviewable request descriptor, never tokens or the full image payload.
    operation = spec.get("operation", "animate-with-text-v3")
    allowed = {"animate-with-text-v3", "animate-with-skeleton-v3", "interpolation-v2", "estimate-skeleton"}
    if operation not in allowed:
        raise ValueError("Unsupported PixelLab operation")
    payload = dict(spec.get("request", {}))
    if spec.get("reference"):
        import base64
        with Image.open(spec["reference"]) as im:
            if max(im.size) > 256:
                raise ValueError("PixelLab reference exceeds 256px; export/unzoom first")
        payload[spec.get("image_field", "first_frame")] = {
            "base64": "data:image/png;base64," + base64.b64encode(Path(spec["reference"]).read_bytes()).decode()}
    write_json(Path(out) / "request-preview.json", {"operation": operation,
               "reference": spec.get("reference"), "request": spec.get("request", {}),
               "external": True, "paid": True})
    if not execute:
        return []
    token = os.environ.get("PIXELLAB_API_KEY")
    credential_file = spec.get("credentials_file")
    if not token and credential_file:
        # Values never enter saved specs, errors, or manifests.
        for line in Path(credential_file).read_text(encoding="utf-8-sig").splitlines():
            if line.strip().startswith("PIXELLAB_API_KEY="):
                token = line.split("=", 1)[1].strip().strip("\"'")
    if not token:
        raise LookupError("PIXELLAB_API_KEY not configured")
    session = requests.Session()
    session.headers["Authorization"] = "Bearer " + token
    base = "https://api.pixellab.ai/v2"
    job_file = Path(out) / "job.json"
    if job_file.exists():
        job = read_json(job_file)
        if job.get("operation") != operation:
            raise ValueError("Existing PixelLab job has a different operation")
        pid = job["background_job_id"]
        result = {}
    else:
        response = session.post(base + "/" + operation, json=payload, timeout=180)
        if not response.ok:
            raise RuntimeError(f"PixelLab HTTP {response.status_code}; request was not retried")
        result = response.json()
        pid = result.get("background_job_id")
    if pid:
        write_json(Path(out) / "job.json", {"background_job_id": pid, "operation": operation})
        end = time.monotonic() + timeout
        while time.monotonic() < end:
            response = session.get(base + "/background-jobs/" + pid, timeout=30)
            response.raise_for_status()
            result = response.json()
            if result.get("status") in ("failed", "error", "cancelled"):
                raise RuntimeError("PixelLab job failed")
            if result.get("status") == "completed":
                break
            time.sleep(5)
        else:
            raise TimeoutError(f"PixelLab job {pid} pending; do not resubmit")
    write_json(Path(out) / "response.json", result)
    saved = []

    def collect(value):
        import base64
        if isinstance(value, dict):
            if isinstance(value.get("base64"), str):
                data = value["base64"].split(",", 1)[-1]
                dest = Path(out) / "raw" / f"frame_{len(saved):04d}.png"
                dest.parent.mkdir(parents=True, exist_ok=True)
                dest.write_bytes(base64.b64decode(data, validate=True))
                with Image.open(dest) as im:
                    im.verify()
                saved.append({"path": str(dest), "sha256": sha(dest)})
                return
            for child in value.values():
                collect(child)
        elif isinstance(value, list):
            for child in value:
                collect(child)
    collect(result.get("last_response", result))
    # estimate-skeleton legitimately returns JSON without frames.
    if not saved and operation != "estimate-skeleton":
        raise RuntimeError("PixelLab completed but no base64 frame payload found; see response.json")
    return saved


def alpha_stage(source, out, method):
    Path(out).mkdir(parents=True, exist_ok=True)
    if method in ("birefnet", "ben2"):
        import torch
        from transformers import AutoModelForImageSegmentation
        from torchvision import transforms
        repo = "ZhengPeng7/BiRefNet" if method == "birefnet" else "PramaLLC/BEN2"
        metadata = requests.get("https://huggingface.co/api/models/" + repo, timeout=30)
        metadata.raise_for_status()
        revision = metadata.json()["sha"]
        if method == "ben2":
            from ben2 import AutoModel
            model = AutoModel.from_pretrained(repo, revision=revision).eval()
        else:
            model = AutoModelForImageSegmentation.from_pretrained(repo, revision=revision, trust_remote_code=True).eval()
        device = "cuda" if torch.cuda.is_available() else "cpu"
        model.to(device)
        transform = transforms.Compose([transforms.Resize((1024, 1024)), transforms.ToTensor(),
                                        transforms.Normalize([.485, .456, .406], [.229, .224, .225])])
        for file in images(source):
            im = Image.open(file).convert("RGB")
            with torch.inference_mode():
                if method == "ben2":
                    result = model.inference(im)
                else:
                    dtype = next(model.parameters()).dtype
                    mask = model(transform(im).unsqueeze(0).to(device=device, dtype=dtype))[-1].sigmoid()[0, 0].float().cpu().numpy()
                    result = im.convert("RGBA")
                    result.putalpha(Image.fromarray((mask * 255).astype("uint8")).resize(im.size))
            result.save(Path(out) / file.name)
        del model
        if device == "cuda":
            torch.cuda.empty_cache()
        from huggingface_hub.constants import HF_HUB_CACHE
        cache = Path(HF_HUB_CACHE) / ("models--" + repo.replace("/", "--")) / "snapshots" / revision
        weights = [{"file":f.name,"sha256":sha(f)} for f in cache.rglob("*")
                   if f.is_file() and f.suffix in (".safetensors", ".bin", ".pth", ".py")]
        return {"repo":repo, "revision":revision,"weights":weights, "device":device,
                "license":metadata.json().get("cardData",{}).get("license")}
    elif method == "sam2":
        raise LookupError("Use alpha-comfy stage with a SAM2 tracking spec")
    else:
        raise ValueError("Use birefnet, ben2, or sam2")


def export_stage(source, out, size, colors, fps, pixel, use_pixeloe, clean=0, asset_id=None):
    files = images(source)
    frames = [Image.open(f).convert("RGBA") for f in files]
    if len({im.size for im in frames}) != 1:
        raise ValueError("Mixed source canvases; normalize before export")
    folder = Path(out)
    folder.mkdir(parents=True, exist_ok=True)
    resized = []
    for im in frames:
        if use_pixeloe:
            from pixeloe.legacy.pixelize import pixelize
            rgb = pixelize(np.array(im.convert("RGB"))[:, :, ::-1].copy(), target_size=size, patch_size=4)
            if isinstance(rgb, np.ndarray):
                rgb = Image.fromarray(rgb[:, :, ::-1].copy())
            im_alpha = im.getchannel("A").resize(rgb.size, Image.Resampling.NEAREST)
            im = rgb.convert("RGBA")
            im.putalpha(im_alpha)
        im.thumbnail((size, size), Image.Resampling.NEAREST if pixel else Image.Resampling.LANCZOS)
        canvas = Image.new("RGBA", (size, size))
        canvas.paste(im, ((size - im.width) // 2, (size - im.height) // 2))
        if pixel:
            canvas.putalpha(canvas.getchannel("A").point(lambda a: 255 if a >= 128 else 0))
        resized.append(canvas)
    if pixel:
        # Fit one palette from opaque pixels of the entire sheet. Background never joins the fit.
        opaque = np.concatenate([np.array(im)[np.array(im)[:, :, 3] == 255, :3] for im in resized])
        if not len(opaque):
            raise ValueError("No opaque pixels to fit palette")
        samples = Image.fromarray(opaque.reshape(1, -1, 3).astype("uint8"), "RGB")
        pal = samples.quantize(colors=colors, method=Image.Quantize.MEDIANCUT)
        write_json(folder / "palette.json", {"colors": np.array(pal.getpalette()).reshape(-1, 3)[:colors].tolist()})
        for i, im in enumerate(resized):
            quantized = im.convert("RGB").quantize(palette=pal, dither=Image.Dither.NONE).convert("RGBA")
            quantized.putalpha(im.getchannel("A"))
            # Remove isolated colors within the silhouette; never alter alpha or fit per-frame palettes.
            data = np.array(quantized)
            for _ in range(clean):
                nxt = data.copy()
                for y in range(size):
                    for x in range(size):
                        if data[y,x,3] != 255:
                            continue
                        neighbors = [tuple(data[ny,nx,:3]) for nx,ny in ((x-1,y),(x+1,y),(x,y-1),(x,y+1))
                                     if 0 <= nx < size and 0 <= ny < size and data[ny,nx,3] == 255]
                        if neighbors and tuple(data[y,x,:3]) not in neighbors:
                            nxt[y,x,:3] = max(dict.fromkeys(neighbors), key=neighbors.count)
                data = nxt
            quantized = Image.fromarray(data)
            resized[i] = quantized
    sheet = Image.new("RGBA", (size * len(resized), size))
    for i, im in enumerate(resized):
        im.save(folder / f"frame_{i:04d}.png")
        sheet.paste(im, (i * size, 0))
    sheet.save(folder / "sheet.png")
    for candidate in (Path(source)/"manifest.json", Path(source).parent/"manifest.json"):
        if not asset_id and candidate.exists():
            asset_id = read_json(candidate).get("id")
    write_json(folder / "manifest.json", {"id":asset_id or "chr.sprite-lab." + folder.name,
               "status": "concept", "frames": len(resized), "fps": fps,
               "canvas": [size, size], "pivot": [.5, 1], "source": str(Path(source).resolve()),
               "source_hashes": [sha(f) for f in files], "pixel": pixel, "pixeloe": use_pixeloe, "clean":clean,
               "approval": "pending-human-motion-review", "sheet": "sheet.png",
               "files":[{"path":f.name,"sha256":sha(f)} for f in sorted(folder.glob("frame_*.png"))] +
                        [{"path":"sheet.png","sha256":sha(folder/"sheet.png")}],
               "palette":"palette.json" if pixel else None, "tool_sha256":sha(__file__)})
    review = """<!doctype html><meta charset=utf-8><title>Sprite motion review</title>
<style>body{background:#172029;color:#eee;font:16px sans-serif}canvas{background:repeating-conic-gradient(#303b44 0% 25%,#24313b 0% 50%) 0/24px 24px;image-rendering:pixelated}button,input{margin:8px}</style>
<h1>Concept · 모션 검수</h1><p>접지 · 발 교차 · 체중 이동 · 장비 · 루프 경계를 확인하세요.</p>
<canvas id=c></canvas><br><button id=p>일시정지</button><button id=b>이전</button><button id=n>다음</button><br>
<label>프레임 <input id=s type=range min=0></label><span id=t></span><br>
<label>재생 속도 <input id=rate type=range min=4 max=30><span id=rt></span> FPS</label><br>
<label>확대 <select id=z><option value=1>1× 실제 크기</option><option value=2>2×</option><option value=3 selected>3×</option><option value=6>6×</option></select></label>
<label>배경 <select id=bg><option value=checker>체커</option><option value=dark>어두움</option><option value=light>밝음</option></select></label>
<script>
const count=COUNT,size=SIZE;let fps=FPS,f=0,playing=true,last=0;
const c=document.querySelector('#c'),ctx=c.getContext('2d'),s=document.querySelector('#s'),t=document.querySelector('#t'),p=document.querySelector('#p');
c.width=size;c.height=size;s.max=count-1;ctx.imageSmoothingEnabled=false;
function zoom(){const z=+document.querySelector('#z').value;c.style.width=(size*z)+'px';c.style.height=(size*z)+'px'}zoom();
document.querySelector('#z').onchange=zoom;
document.querySelector('#bg').onchange=e=>{c.style.background=e.target.value==='dark'?'#111923':e.target.value==='light'?'#dfd8ca':''};
const rate=document.querySelector('#rate'),rt=document.querySelector('#rt');rate.value=fps;rt.textContent=fps;rate.oninput=()=>{fps=+rate.value;rt.textContent=fps};
const img=new Image();img.src='sheet.png';
function draw(){ctx.clearRect(0,0,size,size);ctx.drawImage(img,f*size,0,size,size,0,0,size,size);s.value=f;t.textContent=(f+1)+' / '+count}
function pause(){playing=false;p.textContent='재생'}img.onload=draw;p.onclick=()=>{playing=!playing;p.textContent=playing?'일시정지':'재생'};
document.querySelector('#b').onclick=()=>{pause();f=(f+count-1)%count;draw()};document.querySelector('#n').onclick=()=>{pause();f=(f+1)%count;draw()};
s.oninput=()=>{pause();f=+s.value;draw()};
function tick(now){if(playing&&img.complete&&img.naturalWidth&&now-last>=1000/fps){f=(f+1)%count;draw();last=now}requestAnimationFrame(tick)}requestAnimationFrame(tick);
</script>"""
    (folder / "review.html").write_text(review.replace("COUNT", str(len(resized))).replace("SIZE", str(size)).replace("FPS", str(fps)), encoding="utf-8")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("stage", choices=["doctor", "generate", "alpha", "alpha-comfy", "scail-masks", "pose-driver", "export", "extract", "ssd"])
    parser.add_argument("--spec")
    parser.add_argument("--id", help="Stable asset ID for standalone alpha/export stages")
    parser.add_argument("--host", default="http://127.0.0.1:8188")
    parser.add_argument("--out", default="sprite-lab-out")
    parser.add_argument("--source")
    parser.add_argument("--method", default="birefnet")
    parser.add_argument("--size", type=int, default=128)
    parser.add_argument("--colors", type=int, default=24)
    parser.add_argument("--clean", type=int, default=0)
    parser.add_argument("--fps", type=float, default=12)
    parser.add_argument("--pixel", action="store_true")
    parser.add_argument("--pixeloe", action="store_true")
    parser.add_argument("--execute", action="store_true")
    parser.add_argument("--timeout", type=int, default=3600)
    args = parser.parse_args()
    Path(args.out).mkdir(parents=True, exist_ok=True)
    try:
        if args.stage == "doctor":
            c = Comfy(args.host)
            info = c.get("/object_info")
            report = {"system": c.get("/system_stats"), "pixellab_key_present": bool(os.getenv("PIXELLAB_API_KEY")),
                      "nodes": {n: n in info for n in ["WanAnimate2ToVideo", "WanSCAILToVideo", "WanVaceToVideo",
                                "ADE_LoadAnimateDiffModel", "VHS_LoadImagesPath", "PixelOE", "Sam2Segmentation"]}}
            write_json(Path(args.out) / "doctor.json", report)
            print(json.dumps(report["nodes"], indent=2))
        elif args.stage == "generate":
            spec = read_json(args.spec)
            old_spec = Path(args.out) / "spec.json"
            if (Path(args.out) / "job.json").exists() and old_spec.exists() and read_json(old_spec) != spec:
                raise ValueError("Output already owns another request; use a new output directory")
            write_json(Path(args.out) / "spec.json", spec)
            started = time.monotonic()
            if spec["backend"] == "pixellab":
                saved = pixellab(spec, args.out, args.execute, args.timeout)
            else:
                c = Comfy(args.host)
                info = c.get("/object_info")
                if args.execute:
                    for local, remote in [("reference", "reference_server"), ("reference_mask", "reference_mask_server")]:
                        if spec.get(local):
                            spec[remote] = c.upload(spec[local])
                else:
                    spec.setdefault("reference_server", Path(spec.get("reference", "reference.png")).name)
                    if spec.get("reference_mask"):
                        spec.setdefault("reference_mask_server", Path(spec["reference_mask"]).name)
                graph = build_graph(spec, info)
                write_json(Path(args.out) / "graph.api.json", graph)
                saved = c.run(graph, args.out, args.timeout) if args.execute else []
            write_json(Path(args.out) / "manifest.json", {"id": spec.get("id", "chr.sprite-lab"),
                       "status": "concept", "stage": "generated" if args.execute else "prepared",
                       "backend": spec["backend"], "seed": spec.get("seed", spec.get("request", {}).get("seed")), "files": saved,
                       "reference_sha256": sha(spec["reference"]) if spec.get("reference") else None,
                       "tool_sha256": sha(__file__), "model_manifest": spec.get("model_manifest"),
                       "seconds": time.monotonic() - started, "approved": False})
        elif args.stage == "alpha":
            provenance = alpha_stage(args.source, args.out, args.method)
            write_json(Path(args.out) / "manifest.json", {"id":args.id or "chr.sprite-lab." + Path(args.out).name,
                       "status": "concept", "stage": "alpha", "method": args.method,
                       "source": args.source, "source_hashes": [sha(f) for f in images(args.source)],
                       "model":provenance, "files":[{"path":str(f),"sha256":sha(f)} for f in images(args.out)]})
        elif args.stage == "pose-driver":
            motion = read_json(args.source)
            projection = motion["projection"]
            scale, center_z = projection["ortho_scale"], projection["center_z"]
            center_x = projection.get("center_x", 0)
            colors = [(255,0,0),(255,85,0),(255,170,0),(255,255,0),(170,255,0),
                      (85,255,0),(0,255,0),(0,255,85),(0,255,170),(0,255,255),
                      (0,170,255),(0,85,255),(0,0,255),(85,0,255)]
            def point(p):
                return ((.5 + (p[0]-center_x) / scale) * args.size, (.5 - (p[2]-center_z) / scale) * args.size)
            for frame in motion["motion"]:
                im = Image.new("RGB", (args.size, args.size))
                draw = ImageDraw.Draw(im)
                legs = frame["legs"]
                points = [frame["head"],frame["neck"]]
                for limb in legs:
                    points.extend([limb["shoulder"],limb["elbow"],limb["hand"],limb["hip"],limb["knee"],limb["ankle"]])
                links = [(1,2),(2,3),(3,4),(1,8),(8,9),(9,10),(1,5),(5,6),(6,7),(1,11),(11,12),(12,13),(1,0)]
                for color, (a,b) in zip(colors, links):
                    draw.line([point(points[a]),point(points[b])], fill=color, width=max(2,args.size//100))
                for p,c in zip(points,colors):
                    x,y=point(p); r=max(2,args.size//90)
                    draw.ellipse((x-r,y-r,x+r,y+r), fill=c)
                im.save(Path(args.out) / f"frame_{frame['frame']:04d}.png")
            write_json(Path(args.out) / "manifest.json", {"status":"concept-control", "source":args.source,
                       "format":"authored OpenPose-style body; no detected hands/face", "source_sha256":sha(args.source)})
        elif args.stage == "scail-masks":
            # Single identity: saturated red foreground, black invisible background.
            # Input must already have verified RGBA, not an opaque RGB guess.
            for source in images(args.source):
                im = Image.open(source).convert("RGBA")
                alpha = np.array(im.getchannel("A"))
                if alpha.min() == 255:
                    raise ValueError("SCAIL mask source is opaque; segment it first")
                data = np.zeros((*alpha.shape, 3), dtype=np.uint8)
                data[alpha >= 128, 0] = 255
                Image.fromarray(data).save(Path(args.out) / source.name)
        elif args.stage == "alpha-comfy":
            spec = read_json(args.spec)
            c = Comfy(args.host)
            info = c.get("/object_info")
            if spec.get("graph"):
                graph = read_json(spec["graph"])
            else:
                if not spec.get("positive_points"):
                    raise ValueError("SAM2 needs positive_points; do not guess an object")
                graph = {
                    "1": {"class_type": "VHS_LoadImagesPath", "inputs": {"directory": str(Path(spec["source"]).resolve()),
                          "image_load_cap": 0, "skip_first_images": 0, "select_every_nth": 1}},
                    "2": {"class_type": "DownloadAndLoadSAM2Model", "inputs": {"model": spec.get("model", "sam2.1_hiera_tiny.safetensors"),
                          "segmentor": "video", "device": "cuda", "precision": "bf16"}},
                    "3": {"class_type": "Sam2Segmentation", "inputs": {"sam2_model": ["2", 0], "image": ["1", 0],
                          "keep_model_loaded": False, "coordinates_positive": json.dumps(spec["positive_points"]),
                          **({"coordinates_negative": json.dumps(spec["negative_points"])} if spec.get("negative_points") else {})}},
                    "4": {"class_type": "InvertMask", "inputs": {"mask": ["3", 0]}},
                    "5": {"class_type": "JoinImageWithAlpha", "inputs": {"image": ["1", 0], "alpha": ["4", 0]}},
                    "6": {"class_type": "SaveImage", "inputs": {"images": ["5", 0], "filename_prefix": "sprite_lab/sam2"}}
                }
            for binding, value in spec.get("bindings", {}).items():
                node, key = binding.split(".", 1)
                graph[node]["inputs"][key] = value
            for node in graph.values():
                if node["class_type"] not in info:
                    raise LookupError("Missing node: " + node["class_type"])
            write_json(Path(args.out) / "graph.api.json", graph)
            if args.execute:
                saved = c.run(graph, args.out, args.timeout)
                write_json(Path(args.out) / "manifest.json", {"status": "concept", "backend": "sam2", "files": saved})
        elif args.stage == "export":
            if args.size < 1 or not 2 <= args.colors <= 256 or args.fps <= 0 or not 0 <= args.clean <= 4:
                raise ValueError("Invalid export size/colors/fps")
            export_stage(args.source, args.out, args.size, args.colors, args.fps, args.pixel, args.pixeloe, args.clean, args.id)
        elif args.stage == "extract":
            extract(args.source, args.out, args.fps)
        elif args.stage == "ssd":
            spec = read_json(args.spec)
            # Separate research checkout/environment; upstream README declares MIT.
            root = Path(spec["repo"]).resolve()
            if spec.get("command"):
                command = spec["command"]
            else:
                models = spec["models"]
                required = ["pretrained_base_model_path", "pretrained_vae_path", "image_encoder_path",
                            "denoising_unet_path", "reference_unet_path", "pose_guider_path", "motion_module_path"]
                missing = [key for key in required if not Path(models.get(key, "__missing__")).exists()]
                if missing:
                    raise FileNotFoundError("SSD assets missing: " + ", ".join(missing))
                if not Path(spec["python"]).exists():
                    raise FileNotFoundError("SSD isolated Python is missing")
                data = Path(args.out).resolve() / "dataset" / "character" / "motions" / "walk"
                import shutil
                (data / "ground_truth").mkdir(parents=True, exist_ok=True)
                (data / "poses").mkdir(parents=True, exist_ok=True)
                shutil.copyfile(spec["reference"], data / "ground_truth" / "frame_0000.png")
                for index, frame in enumerate(images(spec["driver"])):
                    if index >= spec.get("frames", 25):
                        break
                    shutil.copyfile(frame, data / "poses" / f"frame_{index:04d}.png")
                config = {**{k:str(Path(models[k]).resolve()) for k in required},
                          "inference_config":str(root / "configs/inference/inference_v2.yaml"),
                          "weight_dtype":"fp16", "test_dir":str(data.parents[2]), "output_format":"image"}
                config_file = Path(args.out).resolve() / "inference.yaml"
                write_json(config_file, config)  # JSON is valid YAML for OmegaConf.
                command = [spec["python"], str(root / "inference.py"), "--config", str(config_file),
                           "-W",str(args.size),"-H",str(args.size),"--fps",str(int(args.fps)),
                           "--seed",str(spec.get("seed",42)),"--steps",str(spec.get("steps",25))]
                command += ["-L", str(spec.get("frames", 25)), "--cfg", str(spec.get("cfg", 3.5))]
            if not isinstance(command, list) or not command:
                raise ValueError("SSD command must be an explicit argv list")
            write_json(Path(args.out) / "command.json", {"repo": str(root), "command": command,
                       "status": "research-only", "license": "MIT declared in upstream README; component terms separate"})
            if args.execute:
                started = time.time()
                subprocess.run(command, cwd=root, check=True, timeout=args.timeout)
                if spec.get("frames_dir"):
                    frames_dir = Path(spec["frames_dir"])
                else:
                    candidates = [d for d in (root / "output").glob("*/*/character/motions/walk/predict")
                                  if any(p.stat().st_mtime >= started-2 for p in d.glob("*.png"))]
                    if not candidates:
                        raise RuntimeError("SSD produced no fresh frames")
                    frames_dir = max(candidates,key=lambda d:d.stat().st_mtime)
                export_stage(frames_dir, args.out, spec.get("export_size", args.size), args.colors, args.fps, args.pixel, False, asset_id=spec.get("id"))
    except (LookupError, FileNotFoundError, requests.ConnectionError) as e:
        write_json(Path(args.out) / "result.json", {"status": "unavailable", "reason": str(e)})
        print(f"UNAVAILABLE: {e}", file=sys.stderr)
        return 3
    except Exception as e:
        write_json(Path(args.out) / "result.json", {"status": "failed", "reason": str(e)})
        print(f"FAILED: {e}", file=sys.stderr)
        return 1
    result_path = Path(args.out) / "result.json"
    if result_path.exists():
        result_path.unlink()
    print(f"OK {args.stage}: {args.out} (concept; motion approval not implied)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
