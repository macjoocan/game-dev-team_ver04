local root='C:/00.SVN/game-dev-team_ver04/out/experiments/silver-impact-20261113/'
local first=Image{fromFile=root..'capture-v8/normal/frame_0000.png'}
local spr=Sprite(first.width,first.height,ColorMode.RGB)
local layer=spr.layers[1]
for i=1,60 do
  if i>1 then spr:newEmptyFrame(i) end
  local im=Image{fromFile=root..string.format('capture-v8/normal/frame_%04d.png',i-1)}
  assert(im.width==spr.width and im.height==spr.height,'Mixed dimensions')
  local cel=layer:cel(i);if cel then spr:deleteCel(cel) end
  spr:newCel(layer,i,im,Point(0,0));spr.frames[i].duration=0.02
end
spr:saveCopyAs(root..'impact-v8.gif')
print(json.encode{output=root..'impact-v8.gif',width=spr.width,height=spr.height,frames=#spr.frames,cycleMs=1200})
spr:close()
