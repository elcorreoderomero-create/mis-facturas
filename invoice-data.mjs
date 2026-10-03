function canonical(v){if(v&&typeof v==='object'&&!Array.isArray(v))return Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])]));if(Array.isArray(v))return v.map(canonical);return v;}
export function sameValue(a,b){return JSON.stringify(canonical(a))===JSON.stringify(canonical(b));}
export const issued=i=>i.status!=='draft';
const text=(v,max,required=false)=>{if(typeof v!=='string'||v.length>max||(required&&!v.trim()))throw new Error('Completa los datos requeridos y revisa su longitud.');return v.trim();};
const date=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(new Date(v+'T12:00:00Z').getTime())&&new Date(v+'T12:00:00Z').toISOString().slice(0,10)===v;
const cents=v=>Number.isSafeInteger(v)&&Math.abs(v)<=99999999999;
function owner(v){if(!v||typeof v!=='object')throw new Error('Faltan tus datos.');return Object.fromEntries(['name','taxId','address','city','country','email','phone','iban','payment'].map(k=>[k,text(v[k]??'',500,['name','taxId','address','city','country'].includes(k))]));}
function client(v){if(!v||typeof v!=='object')throw new Error('Faltan los datos del cliente.');return {id:text(v.id,100,true),name:text(v.name,180,true),taxId:text(v.taxId,40,true),address:text(v.address,600,true),email:text(v.email??'',150),phone:text(v.phone??'',40)};}
export function remainingAmounts(original,invoices,excludeId=''){
 const result={totalCents:original.totalCents,baseCents:original.baseCents,vatCents:original.vatCents};
 for(const i of invoices)if(i.id!==excludeId&&i.kind==='credit'&&issued(i)&&i.rectifiesId===original.id)for(const k of Object.keys(result))result[k]+=i[k];
 return result;
}
export function refundAmounts(original,invoices,amount,mode='total',excludeId=''){
 const balance=remainingAmounts(original,invoices,excludeId);
 if(!cents(amount)||amount<=0)throw new Error('Escribe un importe de devolución mayor que cero.');
 const base=mode==='base'?amount:Math.round(amount*100/(100+original.rate));
 const vat=mode==='base'?Math.round(amount*original.rate/100):amount-base;
 let totals={baseCents:base,vatCents:vat,totalCents:base+vat};
 if(amount===balance[mode==='base'?'baseCents':'totalCents'])totals=balance;
 if(Object.keys(totals).some(k=>totals[k]>balance[k]||totals[k]<0))throw new Error('La devolución supera el importe pendiente de rectificar.');
 return Object.fromEntries(Object.entries(totals).map(([k,v])=>[k,-v]));
}
export function validatedData(v,previous){
 if(!v||v.version!==1||!Array.isArray(v.clients)||!Array.isArray(v.invoices))throw new Error('La copia no tiene un formato válido.');
 const clients=v.clients.map(client),clientIds=new Set(),taxIds=new Set();
 for(const c of clients){const tax=c.taxId.replace(/[\s.-]/g,'').toUpperCase();if(clientIds.has(c.id)||taxIds.has(tax))throw new Error('Hay un cliente duplicado.');clientIds.add(c.id);taxIds.add(tax);}
 const old=new Map(previous.invoices.map(i=>[i.id,i])),ids=new Set(),numbers=new Set();
 const invoices=v.invoices.map(i=>{
  const iid=text(i.id,100,true),number=text(i.number,50,true),existed=old.get(iid);
  if(ids.has(iid))throw new Error('Hay una factura duplicada.');ids.add(iid);
  if(issued(i)){const key=number.toLocaleLowerCase('es');if(numbers.has(key))throw new Error('Hay un número de factura duplicado.');numbers.add(key);}
  if(existed&&issued(existed)){
   const allKeys=new Set([...Object.keys(existed),...Object.keys(i)]);allKeys.delete('paid');allKeys.delete('deletedAt');
   for(const key of allKeys)if(!sameValue(i[key],existed[key]))throw new Error('Una factura emitida no se puede modificar. Usa «Devolución / rectificar».');
   const deletedAt=text(i.deletedAt??'',40);
   return {...existed,paid:!!i.paid,...(('deletedAt' in existed||deletedAt)?{deletedAt}:{})};
  }
  if(!date(i.date)||(i.operationDate&&!date(i.operationDate)))throw new Error('Revisa las fechas.');
  const status=i.status??'issued',kind=i.kind??'invoice',amountMode=i.amountMode??'total';
  if(!['draft','issued'].includes(status)||!['invoice','credit'].includes(kind)||!['base','total'].includes(amountMode))throw new Error('Revisa el tipo de documento.');
  if(![0,4,10,21].includes(i.rate)||!cents(i.totalCents))throw new Error('Revisa el importe y el IVA.');
  let baseCents,vatCents;
  if(kind==='credit'){
   if(!cents(i.baseCents)||!cents(i.vatCents)||i.totalCents>=0||i.baseCents>0||i.vatCents>0||i.baseCents+i.vatCents!==i.totalCents)throw new Error('Revisa los importes de la devolución.');
   baseCents=i.baseCents;vatCents=i.vatCents;
  }else{
   if(i.totalCents<0)throw new Error('El importe debe ser positivo.');
   if(amountMode==='base'&&(!cents(i.baseCents)||i.baseCents<0))throw new Error('Revisa la base imponible.');
   baseCents=amountMode==='base'?i.baseCents:Math.round(i.totalCents*100/(100+i.rate));
   vatCents=amountMode==='base'?Math.round(baseCents*i.rate/100):i.totalCents-baseCents;
   if(baseCents+vatCents!==i.totalCents)throw new Error('El total no coincide con la base y el IVA.');
  }
  const deletedAt=text(i.deletedAt??'',40);
  const result={id:iid,number,date:i.date,operationDate:i.operationDate||'',description:text(i.description,1500,true),notes:text(i.notes??'',1200),owner:owner(i.owner),client:client(i.client),totalCents:i.totalCents,rate:i.rate,baseCents,vatCents,amountMode,paid:status==='draft'?false:!!i.paid,createdAt:existed?.createdAt||text(i.createdAt,40,true),status,kind,deletedAt,issuedAt:status==='issued'?(i.issuedAt||new Date().toISOString()):'',rectifiesId:kind==='credit'?text(i.rectifiesId,100,true):'',rectifiesNumber:kind==='credit'?text(i.rectifiesNumber,50,true):'',rectifiesDate:kind==='credit'?text(i.rectifiesDate,10,true):'',reason:kind==='credit'?text(i.reason,800,true):''};
  if(kind==='credit'&&!number.startsWith('R-'))throw new Error('Las rectificativas usan la serie R-.');
  return result;
 });
 for(const id of old.keys())if(!ids.has(id))throw new Error('No se pueden eliminar facturas guardadas de la copia. Usa la papelera.');
 for(const i of invoices.filter(i=>i.kind==='credit'&&(issued(i)||!i.deletedAt))){
  const original=invoices.find(o=>o.id===i.rectifiesId);
  if(!original||!issued(original)||original.kind==='credit'||original.rate!==i.rate||original.number!==i.rectifiesNumber||original.date!==i.rectifiesDate||!sameValue(original.owner,i.owner)||!sameValue(original.client,i.client))throw new Error('La devolución debe identificar su factura original y conservar sus datos fiscales.');
  const balance=remainingAmounts(original,invoices,i.id);
  if(['totalCents','baseCents','vatCents'].some(k=>-i[k]>balance[k]))throw new Error('Las devoluciones superan el importe de la factura original.');
  const expected=refundAmounts(original,invoices,-i[i.amountMode==='base'?'baseCents':'totalCents'],i.amountMode,i.id);
  if(Object.keys(expected).some(k=>expected[k]!==i[k]))throw new Error('La base y el IVA de la devolución no coinciden.');
 }
 return {version:1,revision:previous.revision+1,updatedAt:new Date().toISOString(),owner:owner(v.owner),clients,invoices,draft:null,lastBackup:null};
}
