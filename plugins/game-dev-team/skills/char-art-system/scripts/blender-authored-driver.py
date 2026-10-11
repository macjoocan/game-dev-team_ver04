"""Render a licensed authored animation as a motion driver, without inventing a gait."""
import argparse
import hashlib
import json
import math
import sys
from pathlib import Path
import bpy
from mathutils import Vector, Matrix

def material(name,color):
    mat=bpy.data.materials.new(name);mat.diffuse_color=(*color,1);return mat

def cylinder(name,radius,mat):
    bpy.ops.mesh.primitive_cylinder_add(vertices=12,radius=radius,depth=1)
    obj=bpy.context.object;obj.name=name;obj.data.materials.append(mat);return obj

def segment(obj,a,b):
    obj.location=(a+b)/2;obj.rotation_euler=(b-a).to_track_quat('Z','Y').to_euler();obj.scale.z=(b-a).length

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--source',required=True);parser.add_argument('--clip',default='Sword_Attack_RM')
    parser.add_argument('--out',required=True);parser.add_argument('--frames',type=int,default=25)
    parser.add_argument('--size',type=int,default=512);parser.add_argument('--yaw',type=float,default=90)
    parser.add_argument('--in-place',action='store_true')
    parser.add_argument('--headgear',choices=['none','feathered-hat'],default='none')
    args=parser.parse_args(sys.argv[sys.argv.index('--')+1:])
    source=Path(args.source).resolve();out=Path(args.out).resolve();out.mkdir(parents=True,exist_ok=True)
    bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
    bpy.ops.import_scene.gltf(filepath=str(source))
    rig=next(o for o in bpy.data.objects if o.type=='ARMATURE')
    action=next(a for a in bpy.data.actions if a.name==args.clip)
    rig.animation_data_create()
    for track in rig.animation_data.nla_tracks:track.mute=True
    rig.animation_data.action=action;rig.animation_data.action_slot=action.slots[0]
    # Object animation may key the armature rotation. Rotate a separate parent
    # so sampling the authored action cannot overwrite the requested view.
    bpy.ops.object.empty_add(type='PLAIN_AXES')
    view_root=bpy.context.object;view_root.name='authored-view-root'
    rig.parent=view_root
    view_root.rotation_euler.z=math.radians(args.yaw)
    body=material('authored-control-body',(.18,.5,.66));steel=material('rigid-blade',(.83,.85,.87));gold=material('guard',(.64,.43,.10))
    for obj in bpy.data.objects:
        if obj.type=='MESH':obj.data.materials.clear();obj.data.materials.append(body)
    sword=[cylinder('blade',.014,steel),cylinder('grip',.025,gold),cylinder('guard',.016,gold)]
    headgear=[]
    if args.headgear=='feathered-hat':
        red=material('hat-red',(.55,.08,.045));white=material('hat-feather',(.92,.86,.72))
        height=rig.pose.bones['DEF-head'].length
        for name,radius,depth,y in [('hat-brim',.235,.025,height-.015),('hat-crown',.135,.16,height+.06)]:
            obj=cylinder(name,radius,red)
            local=Matrix.Translation(Vector((0,y,0)))@Matrix.Rotation(math.pi/2,4,'X')@Matrix.Diagonal(Vector((1,1,depth,1)))
            headgear.append((obj,local))
        bpy.ops.mesh.primitive_uv_sphere_add(segments=12,ring_count=8,radius=1)
        obj=bpy.context.object;obj.name='hat-feather';obj.data.materials.append(white)
        local=Matrix.Translation(Vector((-.095,height+.23,.015)))@Matrix.Rotation(-.45,4,'Z')@Matrix.Diagonal(Vector((.035,.20,.025,1)))
        headgear.append((obj,local))
    scene=bpy.context.scene;scene.render.engine='BLENDER_WORKBENCH'
    scene.render.resolution_x=scene.render.resolution_y=args.size;scene.render.resolution_percentage=100
    scene.render.film_transparent=True;scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGBA'
    scene.display.shading.light='STUDIO';scene.display.shading.color_type='MATERIAL';scene.display.shading.show_shadows=False
    scene.frame_start=0;scene.frame_end=math.ceil(action.frame_range[1]);scene.render.fps=24
    def point(name):return rig.matrix_world@rig.pose.bones[name].head
    def pose(t):
        view_root.location.x=0
        scene.frame_set(int(t),subframe=t-int(t));bpy.context.view_layer.update()
        root_travel=point('root').x
        if args.in_place:
            view_root.location.x=-root_travel;bpy.context.view_layer.update()
        # A gripped blade points toward the thumb side, across the curled fingers.
        index=point('DEF-f_index.01.R');pinky=point('DEF-f_pinky.01.R')
        direction=(index-pinky).normalized()
        hand=(index+pinky)/2
        hilt=hand+direction*.07;tip=hilt+direction*.64
        fore=(hand-point('DEF-forearm.R')).normalized()
        guard=direction.cross(fore).normalized()*.075
        segment(sword[0],hilt,tip);segment(sword[1],hand-direction*.05,hilt);segment(sword[2],hilt-guard,hilt+guard)
        joints={name:list(rig.matrix_world@bone.head) for name,bone in rig.pose.bones.items() if not name.startswith('DEF-f_') and not name.startswith('DEF-thumb')}
        hat_points=[]
        for obj,local in headgear:
            obj.matrix_world=rig.matrix_world@rig.pose.bones['DEF-head'].matrix@local
            hat_points.extend(list(obj.matrix_world@Vector(corner)) for corner in obj.bound_box)
        return {'time':t,'root_travel':root_travel,'joints':joints,'headgear_bounds':hat_points,'weapon':{'hand':list(hand),'hilt':list(hilt),'tip':list(tip),'blade_length':.64}}
    lo,hi=action.frame_range
    poses=[pose(lo+(hi-lo)*n/(args.frames-1)) for n in range(args.frames)]
    points=[p for f in poses for p in [*f['joints'].values(),*f['weapon'].values(),*f['headgear_bounds']] if isinstance(p,list)]
    min_x,max_x=min(p[0] for p in points),max(p[0] for p in points)
    min_z,max_z=min(p[2] for p in points),max(p[2] for p in points)
    center_x,center_z=(min_x+max_x)/2,(min_z+max_z)/2
    scale=max(max_x-min_x,max_z-min_z)*1.35
    bpy.ops.object.camera_add(location=(center_x,-6,center_z));camera=bpy.context.object
    camera.rotation_euler=(Vector((center_x,0,center_z))-camera.location).to_track_quat('-Z','Y').to_euler()
    camera.data.type='ORTHO';camera.data.ortho_scale=scale;scene.camera=camera
    for n,f in enumerate(poses):
        pose(f['time']);scene.render.filepath=str(out/'frames'/f'frame_{n:04d}.png');bpy.ops.render.render(write_still=True)
    meta={'status':'concept-control','source':str(source),'source_sha256':hashlib.sha256(source.read_bytes()).hexdigest(),
          'author':'Quaternius','license':'CC0-1.0','clip':args.clip,'headgear':args.headgear,'view_yaw_degrees':args.yaw,'in_place':args.in_place,'source_frames':list(action.frame_range),
          'source_fps':24,'duration_seconds':(hi-lo)/24,'frames':args.frames,'preview_fps':round((args.frames-1)/((hi-lo)/24),3),
          'projection':{'center_x':center_x,'center_z':center_z,'ortho_scale':scale},'motion':poses}
    (out/'motion.json').write_text(json.dumps(meta,indent=2));bpy.ops.wm.save_as_mainfile(filepath=str(out/'authored-driver.blend'))

if __name__=='__main__':main()
