// Shared Join form and backend validation. Textareas permit paragraph breaks,
// but reject markup and all other control characters before GitHub publication.
export function normalizeJoinDescription(value,min,max){
 if(typeof value!=="string")return null;
 const text=value.replace(/\r\n/g,"\n").trim();
 return text.length>=min&&text.length<=max&&
   !/[\u0000-\u0009\u000b-\u001f\u007f<>]/.test(text)?text:null;
}
