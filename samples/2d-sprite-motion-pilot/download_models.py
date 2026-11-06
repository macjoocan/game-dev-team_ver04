import os,json,sys,hashlib,time
from pathlib import Path
root=Path('out/moim-silver-pilot').resolve()
os.environ['HF_HOME']=str(root/'hf-cache')
os.environ['HF_HUB_DISABLE_TELEMETRY']='1'
from huggingface_hub import hf_hub_download
candidates=json.loads((root/'model-candidates.json').read_text(encoding='utf8'))
stage=sys.argv[1] if len(sys.argv)>1 else 'image'
pick={'image':['flux-2-klein-4b-fp8.safetensors','qwen_3_4b.safetensors','flux2-vae.safetensors','flux2_klein_4b_refcontrol_depth.safetensors'], 'video':['wan2.2_fun_control_high_noise_14B_fp8_scaled.safetensors','wan2.2_fun_control_low_noise_14B_fp8_scaled.safetensors','wan2.2_i2v_lightx2v_4steps_lora_v1_high_noise.safetensors','wan2.2_i2v_lightx2v_4steps_lora_v1_low_noise.safetensors'], 'small':['flux2-vae.safetensors','flux2_klein_4b_refcontrol_depth.safetensors','wan2.2_i2v_lightx2v_4steps_lora_v1_high_noise.safetensors','wan2.2_i2v_lightx2v_4steps_lora_v1_low_noise.safetensors'], 'video-low':['wan2.2_fun_control_low_noise_14B_fp8_scaled.safetensors']}[stage]
destinations={'flux-2-klein-4b-fp8.safetensors':'diffusion_models','qwen_3_4b.safetensors':'text_encoders','flux2-vae.safetensors':'vae','flux2_klein_4b_refcontrol_depth.safetensors':'loras','wan2.2_fun_control_high_noise_14B_fp8_scaled.safetensors':'diffusion_models','wan2.2_fun_control_low_noise_14B_fp8_scaled.safetensors':'diffusion_models','wan2.2_i2v_lightx2v_4steps_lora_v1_high_noise.safetensors':'loras','wan2.2_i2v_lightx2v_4steps_lora_v1_low_noise.safetensors':'loras'}
for name in pick:
    row=next((x for x in candidates if x['file'].split('/')[-1]==name),None)
    if not row:raise RuntimeError('missing metadata for '+name)
    dest=root/'models'/destinations[name]/name;dest.parent.mkdir(parents=True,exist_ok=True)
    def digest(path):
        h=hashlib.sha256()
        with path.open('rb') as f:
            for b in iter(lambda:f.read(4*1024*1024),b''):h.update(b)
        return h.hexdigest()
    if dest.exists():
        if dest.stat().st_size!=row['size'] or digest(dest)!=row['sha256']:raise RuntimeError('existing model hash mismatch; preserved '+str(dest))
        print('verified existing',name,flush=True);continue
    print('downloading',name,'bytes',row['size'],flush=True);started=time.monotonic()
    path=Path(hf_hub_download(repo_id=row['repo'],filename=row['file'],revision=row['revision'],local_dir=root/'downloads'))
    if path.stat().st_size!=row['size'] or digest(path)!=row['sha256']:raise RuntimeError('download hash mismatch '+name)
    path.replace(dest)
    print('verified',name,'seconds',round(time.monotonic()-started,1),flush=True)
