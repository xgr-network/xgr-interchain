import test from "node:test";
import assert from "node:assert/strict";
import {deflateSync} from "node:zlib";
import {normalizeLogoPng} from "./creator-logo-png.mjs";
const SIG=Buffer.from([137,80,78,71,13,10,26,10]);
function crc(data){
 let v=0xffffffff;
 for(const b of data){v^=b;for(let j=0;j<8;j++)v=(v>>>1)^((v&1)?0xedb88320:0)}
 return (v^0xffffffff)>>>0;
}
function part(name,body){
 const x=Buffer.from(name,"ascii"),n=Buffer.alloc(4),c=Buffer.alloc(4);
 n.writeUInt32BE(body.length);const source=Buffer.concat([x,body]);
 c.writeUInt32BE(crc(source));return Buffer.concat([n,source,c]);
}
function png({width=1,height=1,type=6,extra=false}={}){
 const h=Buffer.alloc(13);h.writeUInt32BE(width,0);h.writeUInt32BE(height,4);
 h[8]=8;h[9]=type;
 const bpp=type===6?4:3,scan=Buffer.alloc(height*(width*bpp+1));
 for(let row=0;row<height;row++)scan[row*(width*bpp+1)+1]=255;
 return Buffer.concat([SIG,part("IHDR",h),...(extra?[part("tEXt",Buffer.from("Copyright\0metadata"))]:[]),
  part("IDAT",deflateSync(scan)),part("IEND",Buffer.alloc(0))]);
}
export const exampleLogo=()=>png().toString("base64");
test("canonical PNG is immutable, content-addressed, stripped and always safe RGB/RGBA",()=>{
 const original=png(),x=normalizeLogoPng(original.toString("base64"));
 assert.equal(x.width,1);assert.equal(x.height,1);assert.match(x.hash,/^[0-9a-f]{64}$/);
 assert.ok(x.bytes.subarray(0,8).equals(SIG));
 assert.deepEqual(normalizeLogoPng(x.bytes.toString("base64")).bytes,x.bytes);
 assert.deepEqual(normalizeLogoPng(x.bytes.toString("base64")).hash,x.hash);
});
test("reject malicious uploads and unsupported metadata, size and pixel formats",()=>{
 for(const bad of [
  "",Buffer.from("<svg onload=alert(1)/>").toString("base64"),
  png({extra:true}).toString("base64"),
  png({width:513}).toString("base64"),
  png({type:0}).toString("base64"),
  Buffer.concat([png(),Buffer.from("evil")]).toString("base64"),
  Buffer.from("a".repeat(130000)).toString("base64")
 ])assert.throws(()=>normalizeLogoPng(bad));
 const checksum=png();checksum[checksum.length-10]^=1;
 assert.throws(()=>normalizeLogoPng(checksum.toString("base64")),/checksum/);
});
