'use strict';
// Transport-independent, fail-closed primitives. Not wired into the app yet.
// The caller must only supply an authenticated, membership-checked transport
// and must durably save both local bytes and the prepared reference before use.
const ALLOWED = new Set(['application/pdf','image/jpeg','image/png','image/webp']);
const MAX_SIZE = 1024 * 1024;
const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const HASH = /^[0-9a-f]{64}$/;
const ORG = /^[A-Za-z0-9_-]{1,128}$/;
function validateReference(ref) {
  if (!ref || typeof ref !== 'object' || !ID.test(ref.id) || !HASH.test(ref.sha256) || !ALLOWED.has(ref.contentType) || !Number.isSafeInteger(ref.size) || ref.size <= 0 || ref.size > MAX_SIZE) throw Error('Invalid receipt reference');
  return ref;
}
function pathFor(orgId, ref) {
  if (typeof orgId !== 'string' || !ORG.test(orgId)) throw Error('Invalid organization');
  validateReference(ref);
  return `organizations/${orgId}/receipts/${ref.id}`;
}
function verifyScope(scope, isCurrent) {
  if (!scope || typeof scope.uid !== 'string' || !scope.uid || typeof scope.orgId !== 'string' || !ORG.test(scope.orgId) || typeof isCurrent !== 'function' || !isCurrent(scope)) throw Error('Workspace or access changed');
}
async function digest(bytes, crypto) {
  const result = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(result), b => b.toString(16).padStart(2,'0')).join('');
}
function contentLooksValid(bytes, type) {
  const starts = array => array.every((byte,i)=>bytes[i]===byte);
  if(type==='application/pdf') return starts([37,80,68,70,45]); // %PDF-
  if(type==='image/jpeg') return starts([255,216,255]);
  if(type==='image/png') return starts([137,80,78,71,13,10,26,10]);
  if(type==='image/webp') return bytes.length>=12 && starts([82,73,70,70]) && [87,69,66,80].every((b,i)=>bytes[i+8]===b);
  return false;
}
function checkedBytes(input, contentType) {
  if (!(input instanceof Uint8Array) || !ALLOWED.has(contentType) || !input.length || input.length > MAX_SIZE || !contentLooksValid(input,contentType)) throw Error('Invalid receipt file');
  return input;
}
async function prepareReceipt(input, contentType, crypto) {
  const bytes=checkedBytes(input,contentType);
  if (!crypto?.subtle || typeof crypto.randomUUID !== 'function') throw Error('Secure receipt creation is unavailable');
  const ref={id:crypto.randomUUID(),sha256:await digest(bytes,crypto),size:bytes.length,contentType};
  validateReference(ref);
  return ref;
}
async function verifyBytes(bytes, ref, crypto) {
  validateReference(ref);
  checkedBytes(bytes,ref.contentType);
  if (bytes.length!==ref.size || await digest(bytes,crypto)!==ref.sha256) throw Error('Receipt content does not match its reference');
}
// create must be create-only; stat must return null only for not-found and
// otherwise throw on authorization/network failures. On an uncertain upload,
// a later attempt verifies the existing immutable object's bytes, never trusts
// caller-supplied metadata alone, and never overwrites it.
async function uploadReceipt({scope, ref, bytes, crypto, transport, isCurrent}) {
  verifyScope(scope,isCurrent);const path=pathFor(scope.orgId,ref);await verifyBytes(bytes,ref,crypto);verifyScope(scope,isCurrent);
  const existing=await transport.stat(path);verifyScope(scope,isCurrent);
  if(existing){const remote=await transport.read(path,MAX_SIZE);verifyScope(scope,isCurrent);await verifyBytes(remote,ref,crypto);verifyScope(scope,isCurrent);return 'already-uploaded';}
  await transport.create(path,bytes,{contentType:ref.contentType,sha256:ref.sha256});
  verifyScope(scope,isCurrent);
  return 'uploaded';
}
// No download URL: read through an authenticated transport, validate bytes,
// and discard the result if the active account/workspace changed meanwhile.
async function downloadReceipt({scope, ref, crypto, transport, isCurrent}) {
  verifyScope(scope,isCurrent);const path=pathFor(scope.orgId,ref);
  const bytes=await transport.read(path,MAX_SIZE);verifyScope(scope,isCurrent);
  await verifyBytes(bytes,ref,crypto);verifyScope(scope,isCurrent);return bytes;
}
module.exports={MAX_SIZE,validateReference,pathFor,prepareReceipt,uploadReceipt,downloadReceipt};
