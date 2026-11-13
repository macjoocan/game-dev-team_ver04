async (page) => {
 const root='C:/00.SVN/game-dev-team_ver04/out/experiments/silver-impact-20261113';
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('file:///C:/00.SVN/game-dev-team_ver04/out/experiments/silver-impact-20261113/preview.html');await page.bringToFront();await page.waitForFunction(()=>window.impactDemo?.ready);await page.setViewportSize({width:1280,height:960});
 const normal=await page.evaluate(()=>window.impactDemo.seek(150,{target:true,feedback:true,reduced:false,light:false}));
 await page.screenshot({path:root+'/review-150ms.png',fullPage:true});
 const cases={normal,whiff:await page.evaluate(()=>window.impactDemo.seek(180,{target:false})),noFeedback:await page.evaluate(()=>window.impactDemo.seek(180,{target:true,feedback:false})),reduced:await page.evaluate(()=>window.impactDemo.seek(150,{feedback:true,reduced:true}))};
 await page.setViewportSize({width:390,height:844});await page.evaluate(()=>window.impactDemo.seek(240,{reduced:false,light:true}));await page.screenshot({path:root+'/review-mobile.png',fullPage:true});
 const mobileOverflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
 await page.setViewportSize({width:1280,height:960});
 await page.locator('#after').evaluate(el=>{el.style.width='600px';el.style.height='400px';});
 for(const [mode,opts] of [['normal',{light:false,reduced:false}],['reduced',{light:false,reduced:true}],['light',{light:true,reduced:false}]]){
  for(let i=0;i<60;i++){
   await page.evaluate(({t,opts})=>window.impactDemo.seek(t,{...opts,target:true,feedback:true}),{t:i*20,opts});
   await page.locator('#after').screenshot({path:root+'/capture-v8/'+mode+'/frame_'+String(i).padStart(4,'0')+'.png',scale:'css'});
  }
 }
 await page.evaluate(()=>window.impactDemo.seek(0,{light:false,reduced:false,target:true,feedback:true}));await page.getByRole('button',{name:'베기 · J',exact:true}).click();await page.waitForTimeout(1350);
 const once=await page.evaluate(()=>window.impactDemo.state());
 const result={cases,mobileOverflow,once:{time:once.time,playing:once.playing,frame:once.states[1].frame},errors,export:{width:600,height:400,fps:50,frameCount:60,cycleMs:1200,modes:['normal','reduced','light']}};
 await page.locator('#after').evaluate(el=>{el.style.width='';el.style.height='';});
 await page.evaluate(()=>window.impactDemo.start(true));return result;
}
