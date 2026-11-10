// Shared keyboard/touch double-tap recognizer; OS key-repeat cannot trigger sprint.
export function createMovement(windowMs){
  const held=new Set();let lastDirection=0,lastAt=-Infinity,sprint=0;
  const direction=key=>['KeyD','ArrowRight'].includes(key)?1:['KeyA','ArrowLeft'].includes(key)?-1:0;
  return {
    down(key,now){const d=direction(key);if(!d||held.has(key))return;
      if(d===lastDirection&&now-lastAt<=windowMs)sprint=d;else sprint=0;
      lastDirection=d;lastAt=now;held.add(key);
    },
    up(key){held.delete(key);if(![...held].some(k=>direction(k)===sprint))sprint=0;},
    reset(){held.clear();lastDirection=0;lastAt=-Infinity;sprint=0;},
    get state(){const values=[...held].map(direction);const move=Number(values.includes(1))-Number(values.includes(-1));return {move,run:move!==0&&move===sprint};}
  };
}
