# Regenerate the concept idle

Run from repository root after model restore and node setup.

```powershell
blender -b --python skills/char-art-system/scripts/blender-authored-driver.py -- --source samples/motion-court/source-motion/AnimationLibrary_Godot_Standard.glb --clip Sword_Idle --headgear feathered-hat --frames 25 --out out/company-idle-driver
python skills/char-art-system/scripts/sprite-lab.py scail-masks --source samples/motion-court/drivers/idle/frames --out out/company-idle-mask
python skills/char-art-system/scripts/sprite-lab.py generate --spec samples/motion-court/idle-job.json --out out/company-idle --execute
```

The job uses the included evaluated driver for reproducibility. To compare a new Blender render, change its driver and regenerate masks together. The included reference remains concept art. Quaternius motion source is CC0; see source-motion/License.txt. See sprite-lab.md for alpha and export stages. PixelLab is separate and never invoked by these commands.
