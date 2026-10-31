// Restrictive PNG decoder/re-encoder for public token logos.
// Rejects ancillary metadata, APNG, ICC profiles, scripts, excessive dimensions
// and decompression bombs. Output is canonical 8-bit RGB/RGBA PNG only.
import {createHash} from "node:crypto";
import {inflateSync,deflateSync} from "node:zlib";
const SIG=Buffer.from([137,80,78,71,13,10,26,10]);
const MAX_BYTES=128*1024,MAX_SIZE=512,MAX_DECODE=MAX_SIZE*MAX_SIZE*4+MAX_SIZE;
const CRC_TABLE=Array.from({length:256},(_,i)=>{
 let c=i;
 for(let j=0;j<8;j++)c=c&1?(c>>>1)^0xedb88320:c>>>1;
 return c>>>0;
});
function crc(buf){
 let c=0xffffffff;
 for(const b of buf)c=CRC_TABLE[(c^b)&255]^(c>>>8);
 return (c^0xffffffff)>>>0;
}
function chunk(type,body){
 const label=Buffer.from(type,"ascii"),data=Buffer.concat([label,body]);
 const out=Buffer.alloc(12+body.length);
 out.writeUInt32BE(body.length,0);data.copy(out,4);
 out.writeUInt32BE(crc(data),8+body.length);
 return out;
}
function paeth(a,b,c){
 const p=a+b-c,aa=Math.abs(p-a),bb=Math.abs(p-b),cc=Math.abs(p-c);
 return aa<=bb&&aa<=cc?a:bb<=cc?b:c;
}
export function normalizeLogoPng(b64){
 if(typeof b64!=="string"||b64.length>Math.ceil(MAX_BYTES*4/3)+4||
   !/^[A-Za-z0-9+/]+={0,2}$/.test(b64)||b64.length%4!==0)
  throw Error("Upload a PNG logo of at most 128 KB");
 const original=Buffer.from(b64,"base64");
 if(original.length<67||original.length>MAX_BYTES||
   original.toString("base64")!==b64||!original.subarray(0,8).equals(SIG))
  throw Error("Invalid PNG logo");
 let off=8,width=0,height=0,bpp=0,parts=[],seenIHDR=false,seenIDAT=false,seenEND=false;
 while(off<original.length){
  if(off+12>original.length)throw Error("Invalid PNG chunks");
  const n=original.readUInt32BE(off),end=off+12+n;
  if(n>MAX_BYTES||end>original.length)throw Error("Invalid PNG chunk length");
  const kind=original.toString("ascii",off+4,off+8);
  const body=original.subarray(off+8,off+8+n);
  if(crc(original.subarray(off+4,off+8+n))!==original.readUInt32BE(off+8+n))
   throw Error("Invalid PNG checksum");
  if(!seenIHDR&&kind!=="IHDR")throw Error("PNG header required");
  if(kind==="IHDR"){
   if(seenIHDR||n!==13)throw Error("Invalid PNG header");
   seenIHDR=true;width=body.readUInt32BE(0);height=body.readUInt32BE(4);
   if(!width||!height||width>MAX_SIZE||height>MAX_SIZE||
      body[8]!==8||![2,6].includes(body[9])||body[10]||body[11]||body[12])
    throw Error("Only non-interlaced RGB or RGBA PNG logos up to 512 x 512 are supported");
   bpp=body[9]===6?4:3;
  }else if(kind==="IDAT"){
   if(seenEND)throw Error("Invalid PNG sequence");
   seenIDAT=true;parts.push(body);
  }else if(kind==="IEND"){
   if(n!==0||seenEND||!seenIDAT||end!==original.length)
    throw Error("Invalid PNG ending");
   seenEND=true;
  }else throw Error("PNG metadata, animation and unknown chunks are not permitted");
  off=end;
 }
 if(!seenEND)throw Error("Incomplete PNG");
 const stride=width*bpp,expected=height*(stride+1);
 const inflated=inflateSync(Buffer.concat(parts),{maxOutputLength:Math.min(MAX_DECODE,expected+1)});
 if(inflated.length!==expected)throw Error("Invalid PNG pixel data");
 const output=Buffer.alloc(expected),prior=Buffer.alloc(stride),reconstructed=Buffer.alloc(stride);
 for(let row=0;row<height;row++){
  const at=row*(stride+1),filter=inflated[at];
  if(filter>4)throw Error("Invalid PNG row filter");
  output[at]=0;
  for(let col=0;col<stride;col++){
   const raw=inflated[at+1+col],a=col>=bpp?reconstructed[col-bpp]:0,
    b=prior[col],c=col>=bpp?prior[col-bpp]:0;
   const predictor=filter===0?0:filter===1?a:filter===2?b:
    filter===3?Math.floor((a+b)/2):paeth(a,b,c);
   reconstructed[col]=(raw+predictor)&255;
  }
  reconstructed.copy(output,at+1);
  reconstructed.copy(prior);
 }
 const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(width,0);
 ihdr.writeUInt32BE(height,4);ihdr[8]=8;ihdr[9]=bpp===4?6:2;
 const bytes=Buffer.concat([SIG,chunk("IHDR",ihdr),
  chunk("IDAT",deflateSync(output,{level:9})),chunk("IEND",Buffer.alloc(0))]);
 if(bytes.length>MAX_BYTES)throw Error("Normalized PNG exceeds the 128 KB logo limit");
 return {bytes,hash:createHash("sha256").update(bytes).digest("hex"),width,height};
}
