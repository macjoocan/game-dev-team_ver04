import {readPNG} from '../../../scripts/lib-png-read.mjs';
const im=readPNG('out/experiments/silver-reference-slash-20261111/raw/silver-slash-v4.png');
console.log('size',im.width,im.height);
for(const boundary of [384,768,1152]){
 const rows=[];
 for(let y=boundary-30;y<boundary+30;y++){let count=0;for(let x=0;x<im.width;x++)if(im.data[(y*im.width+x)*4+3]>=128)count++;rows.push([y,count]);}
 console.log('boundary',boundary,JSON.stringify(rows));
}
