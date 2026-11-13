export const SCENARIOS={
 dust:{label:'걷기 · 달리기 · 멈추기',duration:2200,x:230,events:[[0,'move',1,false],[650,'move',1,true],[1400,'move',0,false]]},
 chain:{label:'달리기 · 3연타 · 백스텝',duration:2600,x:330,events:[[0,'move',1,true],[450,'move',0,false],[450,'act','combo1'],[460,'act','combo1'],[470,'act','combo1'],[1680,'act','evade']]},
 guard:{label:'올려 베기 · 대기 연결',duration:1400,x:470,events:[[0,'act','combo2']]},
 escape:{label:'베기 · 백스텝 · 달리기',duration:2000,x:450,events:[[0,'act','combo1'],[190,'act','evade'],[900,'move',1,true],[1450,'move',0,false]]}
};
export function applyEvent(model,event){const [,type,a,b]=event;if(type==='move')model.setMove(a,b);else if(a==='combo2')model.begin(a);else model.command(a);}
export function replay(model,id,time){const s=SCENARIOS[id];model.reset();model.x=s.x;let at=0;for(const event of s.events){if(event[0]>time)break;model.advance(event[0]-at);applyEvent(model,event);at=event[0];}model.advance(time-at);return model.state();}
