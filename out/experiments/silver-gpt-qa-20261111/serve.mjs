import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
const root=path.resolve('out/experiments/silver-gpt-qa-20261111');
http.createServer((req,res)=>{try{const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);const target=path.resolve(root,'.'+(pathname==='/'?'/review.html':pathname));if(!target.startsWith(root+path.sep)||!fs.existsSync(target)||!fs.statSync(target).isFile()){res.writeHead(404);res.end('Not found');return}const ext=path.extname(target);res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.png':'image/png','.json':'application/json; charset=utf-8','.md':'text/plain; charset=utf-8','.txt':'text/plain; charset=utf-8'})[ext]||'application/octet-stream');res.end(fs.readFileSync(target))}catch{res.writeHead(400);res.end('Invalid request')}}).listen(8231,'127.0.0.1',()=>console.log('http://127.0.0.1:8231'));
