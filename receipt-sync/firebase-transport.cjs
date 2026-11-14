'use strict';
// SDK injected by the host. This is not initialized or used by the app yet.
// firebase/storage getBytes requires bucket CORS configuration on the web.
const PATH = /^organizations\/[A-Za-z0-9_-]{1,128}\/receipts\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
function createFirebaseTransport(storage, sdk) {
  if (!storage || !sdk || !['ref','getMetadata','uploadBytes','getBytes'].every(k=>typeof sdk[k]==='function')) throw Error('Incomplete storage transport');
  const objectRef=path=>{if(typeof path!=='string'||!PATH.test(path))throw Error('Invalid receipt path');return sdk.ref(storage,path)};
  return {
    async stat(path){
      try { return await sdk.getMetadata(objectRef(path)); }
      catch(e) { if(e?.code==='storage/object-not-found')return null;throw e; }
    },
    async create(path,bytes,metadata){
      if(!(bytes instanceof Uint8Array)||bytes.length===0||bytes.length>1048576||!metadata||!['application/pdf','image/jpeg','image/png','image/webp'].includes(metadata.contentType)||!/^[0-9a-f]{64}$/.test(metadata.sha256))throw Error('Invalid upload');
      // Immutability is enforced by Storage rules, not by the SDK. A retry
      // must stat and verify bytes instead of issuing an overwrite.
      await sdk.uploadBytes(objectRef(path),bytes,{contentType:metadata.contentType,customMetadata:{sha256:metadata.sha256}});
    },
    async read(path,maxBytes){
      if(!Number.isSafeInteger(maxBytes)||maxBytes<=0||maxBytes>1048576)throw Error('Invalid download limit');
      const bytes=await sdk.getBytes(objectRef(path),maxBytes);
      return new Uint8Array(bytes);
    }
  };
}
module.exports={createFirebaseTransport};
