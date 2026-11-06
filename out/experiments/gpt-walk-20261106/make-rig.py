import json, math, pathlib
b=pathlib.Path(__file__).resolve().parent
pts={'hip':(275,304),'neck':(279,141),'head':(288,88),'hair_tie':(255,73),'hair_tip':(180,172),'cape_top':(263,158),'cape_tip':(132,298),'near_shoulder':(264,177),'near_elbow':(246,222),'near_hand':(228,275),'sword_tip':(388,376),'far_shoulder':(298,188),'far_elbow':(321,238),'far_hand':(351,272),'near_hip':(267,310),'near_knee':(207,379),'near_ankle':(154,448),'near_toe':(170,474),'far_hip':(290,310),'far_knee':(322,376),'far_ankle':(349,452),'far_toe':(392,467)}
specs=[('torso','hip','neck',33,None,5),('head','neck','head',30,'torso',6),('ponytail','hair_tie','hair_tip',27,'head',2),('cape','cape_top','cape_tip',24,'torso',1),('far_upper_arm','far_shoulder','far_elbow',13,'torso',3),('far_forearm','far_elbow','far_hand',11,'far_upper_arm',3),('near_upper_arm','near_shoulder','near_elbow',16,'torso',9),('near_forearm','near_elbow','near_hand',13,'near_upper_arm',10),('sword','near_hand','sword_tip',6,'near_forearm',11),('far_thigh','far_hip','far_knee',21,'torso',2),('far_shin','far_knee','far_ankle',17,'far_thigh',2),('far_foot','far_ankle','far_toe',13,'far_shin',2),('near_thigh','near_hip','near_knee',22,'torso',7),('near_shin','near_knee','near_ankle',17,'near_thigh',7),('near_foot','near_ankle','near_toe',13,'near_shin',7)]
points=[dict(id=n,name=n,kind='joint',x=x,y=y,confidence=0.7,source='manual-visible-landmark') for n,(x,y) in pts.items()]
bones=[dict(id=n,name=n,startPoint=a,endPoint=z,radius=r,parent=p,z=layer) for n,a,z,r,p,layer in specs]
frames=[]
for i in range(8):
    phase=i/8
    transforms=[dict(bone='near_upper_arm',rotate=10*math.sin(2*math.pi*phase)),dict(bone='near_forearm',rotate=3*math.sin(2*math.pi*phase)),dict(bone='far_upper_arm',rotate=-12*math.sin(2*math.pi*phase)),dict(bone='ponytail',rotate=3*math.sin(2*math.pi*phase-0.6)),dict(bone='cape',rotate=2.5*math.sin(2*math.pi*phase-0.9))]
    contacts=[]
    for side,offset in [('near',0.5),('far',0)]:
        t=(phase+offset)%1
        if t<0.5:
            x=315-80*(t/0.5);y=445
        else:
            u=(t-0.5)/0.5;x=235+80*u;y=445-28*math.sin(math.pi*u)
        contacts.append(dict(bone=side+'_shin',x=x,y=y,bend=-1))
    frames.append(dict(phase=f'walk-{i}',rootDx=0,rootDy=-3*(1-math.cos(4*math.pi*phase)),transforms=transforms,contacts=contacts))
rig=dict(id='silver-walk-probe',workspaceId='gpt-walk-20261106',worktreeId=None,assetId=None,name='Silver walk native mesh probe',morphology='biped',fps=8,looping=True,points=points,bones=bones,frames=frames,createdAt='2026-11-06',updatedAt='2026-11-06')
(b/'rig.json').write_text(json.dumps(rig,indent=2),encoding='utf-8')
(b/'experiment.json').write_text(json.dumps({'input':'input/master.png','source':'out/2d-gpt-20261106/silver-swordswoman-gpt-v1.png','status':'concept','humanApproved':False,'canvas':[512,512],'frames':8,'fps':8,'targetHeight':432,'baseline':480,'rigMode':'sprite-maker unchanged native flat-image mesh renderer; hand-authored landmarks and gait targets','frameMode':'built-in GPT image_gen single 4x2 sheet then sprite-gen slice-sheet','spriteMakerCommit':'9de73a6136a1a045af2e8769349fbadc17dbef69','spriteGenCommit':'4f5ccd55c7cf06685a41f954acc1e476b7772ece','limitations':['same image and output canvas; no shared random seed or identical poses across structurally different methods','desktop UI, automatic rig suggestion and cloud video providers not exercised']},indent=2),encoding='utf-8')
print('Rig: 21 landmarks, 15 bones, 8 frames; sword parent = near_forearm')
