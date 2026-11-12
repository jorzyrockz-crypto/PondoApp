const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),zlib=require('node:zlib');
const manifest=JSON.parse(fs.readFileSync('manifest.webmanifest','utf8'));
// Decode our non-interlaced 8-bit RGBA PNGs, including all standard row filters.
function png(path){
 const b=fs.readFileSync(path);assert.equal(b.toString('hex',0,8),'89504e470d0a1a0a');
 const width=b.readUInt32BE(16),height=b.readUInt32BE(20);assert.equal(b[24],8);assert.equal(b[25],6);assert.equal(b[28],0);
 let chunks=[],offset=8;while(offset<b.length){let len=b.readUInt32BE(offset),type=b.toString('ascii',offset+4,offset+8);if(type==='IDAT')chunks.push(b.subarray(offset+8,offset+8+len));offset+=12+len;if(type==='IEND')break;}
 let raw=zlib.inflateSync(Buffer.concat(chunks)),stride=width*4,out=Buffer.alloc(height*stride);
 const paeth=(a,b,c)=>{let p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);return pa<=pb&&pa<=pc?a:pb<=pc?b:c};
 for(let y=0;y<height;y++){let filter=raw[y*(stride+1)],row=y*stride;for(let x=0;x<stride;x++){let a=x>=4?out[row+x-4]:0,up=y?out[row-stride+x]:0,ul=y&&x>=4?out[row-stride+x-4]:0;let v=raw[y*(stride+1)+1+x];if(filter===1)v+=a;else if(filter===2)v+=up;else if(filter===3)v+=Math.floor((a+up)/2);else if(filter===4)v+=paeth(a,up,ul);else assert.equal(filter,0);out[row+x]=v&255;}}
 return {width,height,pixel:(x,y)=>Array.from(out.subarray((y*width+x)*4,(y*width+x)*4+4))};
}
test('all app, favicon, touch, and Windows tile PNGs have their advertised sizes',()=>{
 for(const icon of [...manifest.icons,...manifest.shortcuts.flatMap(s=>s.icons)]){let img=png(icon.src),[w,h]=icon.sizes.split('x').map(Number);assert.equal(img.width,w,icon.src);assert.equal(img.height,h,icon.src);}
 for(const size of [16,32,48])for(const dir of ['icons','icons/rounded']){let img=png(`${dir}/favicon-${size}x${size}.png`);assert.equal(img.width,size);assert.equal(img.height,size);}
 for(const [path,w,h] of [['icons/apple-touch-icon.png',180,180],['icons/mstile-70x70.png',70,70],['icons/mstile-150x150.png',150,150],['icons/mstile-310x310.png',310,310],['icons/mstile-310x150.png',310,150]]){let img=png(path);assert.equal(img.width,w);assert.equal(img.height,h);}
});
test('new artwork keeps transparent corners and maskable artwork in the safe zone',()=>{
 const img=png('icons/rounded/icon-512.png');assert.equal(img.pixel(0,0)[3],0);assert.equal(img.pixel(256,256)[3],255);
 const upper=img.pixel(256,90),middle=img.pixel(256,256),lower=img.pixel(256,450);assert.ok(upper[0]>200&&upper[1]>150&&upper[2]<180);assert.ok(middle[2]>middle[1]);assert.ok(lower[0]<100&&lower[1]<100&&lower[2]<100);
 for(const size of [192,512]){const mask=png(`icons/icon-${size}-maskable.png`),edge=mask.pixel(0,0);assert.equal(edge[3],255);for(let y=0;y<size;y++)for(let x=0;x<size;x++){const dx=x+.5-size/2,dy=y+.5-size/2;if(Math.hypot(dx,dy)>size*.4+1)assert.deepEqual(mask.pixel(x,y),edge);}}
});
test('both ICO files have 16, 32, 48, 64, 128 and 256 pixel variants',()=>{
 for(const path of ['favicon.ico','icons/rounded/favicon.ico']){const b=fs.readFileSync(path);assert.equal(b.readUInt16LE(0),0);assert.equal(b.readUInt16LE(2),1);const n=b.readUInt16LE(4);assert.equal(n,6);let sizes=[];for(let i=0;i<n;i++)sizes.push(b[6+i*16]||256);assert.deepEqual(sizes,[16,32,48,64,128,256]);}
});
