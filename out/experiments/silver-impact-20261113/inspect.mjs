import fs from 'node:fs';
import {readPNG} from '../../../scripts/lib-png-read.mjs';
const im=readPNG('out/experiments/silver-impact-20261113/raw/slash-v7.png');
const bins=[0,0,0,0];for(let i=3;i<im.data.length;i+=4){const a=im.data[i];bins[a===0?0:a<128?1:a<255?2:3]++}
const rows=[];for(let y=0;y<im.height;y++){let n=0;for(let x=0;x<im.width;x++)if(im.data[(y*im.width+x)*4+3]>=128)n++;if([0,383,384,385,767,768,769,1151,1152,1153,1535].includes(y))rows.push([y,n]);}
console.log(JSON.stringify({width:im.width,height:im.height,bins,rows}));
