"""Install external sprite backends with revision/hash provenance; resumable HF downloads."""
import argparse
import hashlib
import json
import subprocess
import sys
import time
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
import requests

if sys.platform == "win32":
    try:
        import truststore
        truststore.inject_into_ssl()
    except ImportError:
        pass  # certifi verification remains enabled

NODES = {
    "animatediff": "https://github.com/Kosinkadink/ComfyUI-AnimateDiff-Evolved.git",
    "controlnet": "https://github.com/Kosinkadink/ComfyUI-Advanced-ControlNet.git",
    "pixel": "https://github.com/KohakuBlueleaf/PixelOE.git",
    "alpha": "https://github.com/1038lab/ComfyUI-RMBG.git",
    "sam2": "https://github.com/kijai/ComfyUI-segment-anything-2.git",
}
# Official model distributions. No model weights are vendored into the plugin.
MODELS = {
    "vace": [("Comfy-Org/Wan_2.1_ComfyUI_repackaged", "split_files/diffusion_models/wan2.1_vace_1.3B_fp16.safetensors", "diffusion_models"),
             ("Comfy-Org/Wan_2.1_ComfyUI_repackaged", "split_files/text_encoders/umt5_xxl_fp8_e4m3fn_scaled.safetensors", "text_encoders"),
             ("Comfy-Org/Wan_2.1_ComfyUI_repackaged", "split_files/vae/wan_2.1_vae.safetensors", "vae")],
    "wan-animate2": [("Comfy-Org/Wan-Animate-2", "diffusion_models/wan_animate_2_int8_convrot.safetensors", "diffusion_models")],
    "wan-animate2-fast": [("Comfy-Org/Wan-Animate-2", "loras/lightx2v_I2V_14B_480p_cfg_step_distill_rank64_bf16.safetensors", "loras")],
    "scail2": [("Comfy-Org/SCAIL-2", "diffusion_models/wan2.1_14B_SCAIL_2_int8_convrot.safetensors", "diffusion_models")],
    "scail2-fast": [("Comfy-Org/SCAIL-2", "loras/wan2.1_SCAIL_2_DPO_lora_bf16.safetensors", "loras")],
    "wan-alpha": [("Comfy-Org/Wan_2.1_ComfyUI_repackaged", "split_files/diffusion_models/wan2.1_t2v_14B_fp8_scaled.safetensors", "diffusion_models"),
                  ("Comfy-Org/Wan_2.1_ComfyUI_repackaged", "split_files/vae/wan_alpha_2.1_vae_rgb_channel.safetensors", "vae"),
                  ("Comfy-Org/Wan_2.1_ComfyUI_repackaged", "split_files/vae/wan_alpha_2.1_vae_alpha_channel.safetensors", "vae"),
                  ("Comfy-Org/Wan_2.1_ComfyUI_repackaged", "split_files/loras/wan_alpha_2.1_rgba_lora.safetensors", "loras")],
    "animatediff": [("guoyww/animatediff", "mm_sd_v15_v2.ckpt", "animatediff_models"),
                   ("Comfy-Org/stable-diffusion-v1-5-archive", "v1-5-pruned-emaonly-fp16.safetensors", "checkpoints"),
                   ("lllyasviel/ControlNet-v1-1", "control_v11p_sd15_canny.pth", "controlnet")],
    "identity-sd15": [("h94/IP-Adapter", "models/ip-adapter-plus_sd15.bin", "ipadapter")],
    "ssd-base": [("stable-diffusion-v1-5/stable-diffusion-v1-5", "unet/config.json", "ssd/base/unet"),
                 ("stable-diffusion-v1-5/stable-diffusion-v1-5", "unet/diffusion_pytorch_model.bin", "ssd/base/unet"),
                 ("stabilityai/sd-vae-ft-mse", "config.json", "ssd/vae"),
                 ("stabilityai/sd-vae-ft-mse", "diffusion_pytorch_model.bin", "ssd/vae"),
                 ("lambda/sd-image-variations-diffusers", "image_encoder/config.json", "ssd/vision"),
                 ("lambda/sd-image-variations-diffusers", "image_encoder/pytorch_model.bin", "ssd/vision")],
}


def digest(file):
    h = hashlib.sha256()
    with open(file, "rb") as stream:
        for chunk in iter(lambda: stream.read(8 * 1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def save(file, value):
    file.parent.mkdir(parents=True, exist_ok=True)
    file.write_text(json.dumps(value, indent=2), encoding="utf-8")


def windows_compat(folder, key):
    """Small recorded compatibility patches; never describe these as clean upstream."""
    patched = []
    if sys.platform != "win32":
        return patched
    if key == "alpha":
        file = folder / "__init__.py"
        old = file.read_text(encoding="utf-8")
        new = old.replace("Error loading {module_name}", "Error loading {file.stem}")
        if new != old:
            file.write_text(new, encoding="utf-8")
        if "Error loading {file.stem}" in new:
            patched.append({"path": str(file), "sha256": digest(file),
                            "reason": "Optional SAM3 import failure must not abort BiRefNet/BEN2 nodes"})
    if key == "pixel":
        file = folder / "src" / "pixeloe" / "torch" / "utils.py"
        old = file.read_text(encoding="utf-8")
        start = old.find("    compiled = torch.compile(")
        end = old.find("\n    def runner", start)
        if start >= 0 and end >= 0:
            old = old[:start] + "    compiled = func  # Windows: eager path, no unavailable Triton compiler\n" + old[end:]
            file.write_text(old, encoding="utf-8")
        if "Windows: eager path" in old:
            patched.append({"path": str(file), "sha256": digest(file),
                            "reason": "Use eager PixelOE on Windows without Triton"})
    return patched


def model(repo, name, category, root):
    meta = requests.get(f"https://huggingface.co/api/models/{repo}?blobs=true", timeout=30)
    meta.raise_for_status()
    revision = meta.json()["sha"]
    license_label = meta.json().get("cardData", {}).get("license")
    item = next((s for s in meta.json().get("siblings", []) if s["rfilename"] == name), None)
    if not item:
        raise FileNotFoundError(f"Model path absent in {repo}: {name}")
    expected_hash = item.get("lfs", {}).get("sha256")
    url = f"https://huggingface.co/{repo}/resolve/{revision}/{name}"
    target = root / "models" / category / Path(name).name
    target.parent.mkdir(parents=True, exist_ok=True)
    part = target.with_suffix(target.suffix + ".part")
    # Remote metadata is checked before treating an existing file as installed.
    head = requests.head(url, allow_redirects=True, timeout=90)
    head.raise_for_status()
    expected = head.headers.get("x-linked-size") or head.headers.get("Content-Length")
    expected = int(expected) if expected and expected.isdigit() else None
    if target.exists() and expected and target.stat().st_size == expected:
        actual_hash = digest(target)
        if expected_hash and actual_hash != expected_hash:
            raise RuntimeError("Existing model SHA256 mismatch; not overwritten")
        return {"repo": repo, "revision": revision, "path": str(target), "bytes": expected, "sha256": actual_hash,
                "upstream_sha256": expected_hash, "license":license_label, "terms_source":f"https://huggingface.co/{repo}/tree/{revision}"}
    offset = part.stat().st_size if part.exists() else 0
    # Bounded ranges avoid gateways that buffer multi-GB full responses.
    if expected:
        def fetch_range(bounds):
            start, end = bounds
            for attempt in range(3):
                try:
                    response = requests.get(url + f"?range_start={start}",
                                            headers={"Range": f"bytes={start}-{end}"}, timeout=90)
                    break
                except (requests.ConnectionError, requests.Timeout, requests.exceptions.ChunkedEncodingError):
                    if attempt == 2:
                        raise
                    time.sleep(attempt + 1)
            response.raise_for_status()
            full_small_file = response.status_code == 200 and start == 0 and end == expected-1
            if not full_small_file and (response.status_code != 206 or not response.headers.get("Content-Range", "").startswith(f"bytes {start}-{end}/")):
                raise RuntimeError("Server did not honor exact range; kept .part")
            if len(response.content) != end-start+1:
                raise RuntimeError("Short range response; kept .part")
            return response.content
        with open(part, "ab") as f, ThreadPoolExecutor(max_workers=4) as pool:
            while offset < expected:
                ranges = [(start, min(expected-1,start+32*1024*1024-1))
                          for start in range(offset, min(expected,offset+128*1024*1024),32*1024*1024)]
                # Commit only an ordered contiguous prefix; a restart resumes safely from its size.
                for bounds, data in zip(ranges, pool.map(fetch_range, ranges)):
                    f.write(data)
                    f.flush()
                    offset = bounds[1] + 1
                    if offset == expected or offset % (512*1024*1024) < 32*1024*1024:
                        print(f"  {target.name}: {offset}/{expected} bytes", flush=True)
    else:
        response = requests.get(url, stream=True, timeout=90)
        response.raise_for_status()
        with open(part, "wb") as f:
            for chunk in response.iter_content(4 * 1024 * 1024):
                if chunk:
                    f.write(chunk)
    if expected and part.stat().st_size != expected:
        raise RuntimeError(f"Size mismatch {target.name}; kept .part for resume")
    actual_hash = digest(part)
    if expected_hash and actual_hash != expected_hash:
        raise RuntimeError(f"Upstream SHA256 mismatch {target.name}; kept .part")
    part.replace(target)
    return {"repo": repo, "revision": revision, "path": str(target), "bytes": target.stat().st_size,
            "sha256": actual_hash, "upstream_sha256": expected_hash, "license":license_label,
            "terms_source":f"https://huggingface.co/{repo}/tree/{revision}"}


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--root", required=True, help="ComfyUI folder, not portable parent")
    p.add_argument("--nodes", nargs="*", choices=NODES, default=[])
    p.add_argument("--models", nargs="*", choices=MODELS, default=[])
    p.add_argument("--out", required=True)
    p.add_argument("--dependencies", action="store_true")
    args = p.parse_args()
    root, out = Path(args.root), Path(args.out)
    record = {"nodes": [], "models": [], "errors": []}
    out.mkdir(parents=True, exist_ok=True)
    for key in args.nodes:
        repo = NODES[key]
        folder = root / "custom_nodes" / repo.split("/")[-1].removesuffix(".git")
        try:
            if not folder.exists():
                subprocess.run(["git", "clone", "--depth", "1", repo, str(folder)], check=True)
            origin = subprocess.check_output(["git", "-C", str(folder), "remote", "get-url", "origin"], text=True).strip()
            if origin.rstrip(".git") != repo.rstrip(".git"):
                raise RuntimeError("Existing node has a different origin; not overwritten")
            revision = subprocess.check_output(["git", "-C", str(folder), "rev-parse", "HEAD"], text=True).strip()
            patches = windows_compat(folder, key)
            if args.dependencies and (folder / "requirements.txt").exists():
                subprocess.run([sys.executable, "-s", "-m", "pip", "install", "-r", str(folder / "requirements.txt")], check=True)
            if args.dependencies and key == "pixel":
                subprocess.run([sys.executable, "-s", "-m", "pip", "install", str(folder)], check=True)
            record["nodes"].append({"id": key, "repo": repo, "revision": revision, "path": str(folder),
                                    "activation": "restart-required", "local_patches": patches})
        except Exception as e:
            record["errors"].append({"node": key, "error": str(e)})
        save(out / "install.json", record)
    queue = []
    for key in args.models:
        queue.extend(MODELS[key])
    for entry in dict.fromkeys(queue):
        print("Downloading", entry[0], entry[1], flush=True)
        try:
            record["models"].append(model(*entry, root))
        except Exception as e:
            record["errors"].append({"model": entry[1], "error": str(e)})
        save(out / "install.json", record)
    print(json.dumps({"nodes": len(record["nodes"]), "models": len(record["models"]), "errors": record["errors"]}), flush=True)
    return 1 if record["errors"] else 0


if __name__ == "__main__":
    sys.exit(main())
