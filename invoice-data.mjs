function canonical(v){if(v&&typeof v==='object'&&!Array.isArray(v))return Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])]));if(Array.isArray(v))return v.map(canonical);return v;}
export function sameValue(a,b){return JSON.stringify(canonical(a))===JSON.stringify(canonical(b));}
function string(v         , max        , required = false) {
  if (typeof v !== 'string' || v.length > max || (required && !v.trim())) throw new Error('Completa los datos requeridos y revisa su longitud.');
  return v.trim();
}
function validDate(d         ) {
  if (typeof d !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
  const parsed = new Date(`${d}T12:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === d;
}
function owner(v            ) {
  if (!v || typeof v !== 'object') throw new Error('Faltan los datos del emisor.');
  return Object.fromEntries(['name','taxId','address','city','country','email','phone','iban','payment'].map(k => [k,string(v[k] ?? '', 500, ['name','taxId','address','city','country'].includes(k))]));
}
function client(v            ) {
  if (!v || typeof v !== 'object') throw new Error('Faltan los datos del cliente.');
  return { id:string(v.id,100,true), name:string(v.name,180,true), taxId:string(v.taxId,40,true), address:string(v.address,600,true), email:string(v.email??'',150), phone:string(v.phone??'',40) };
}
export function validatedData(v            , previous            ) {
  if (!v || v.version !== 1 || !Array.isArray(v.clients) || !Array.isArray(v.invoices)) throw new Error('La copia no tiene un formato válido.');
  const clients=v.clients.map(client), clientIds=new Set(), taxIds=new Set();
  for(const c of clients){const normalized=c.taxId.replace(/[\s.-]/g,'').toUpperCase();if(clientIds.has(c.id)||taxIds.has(normalized))throw new Error('Hay un cliente duplicado.');clientIds.add(c.id);taxIds.add(normalized);}
  const old=new Map                   (previous.invoices.map((i           )=>[i.id,i]));
  const ids=new Set(), numbers=new Set();
  const invoices=v.invoices.map((i           )=>{
    const iid=string(i.id,100,true), number=string(i.number,50,true), numKey=number.toLocaleLowerCase('es');
    if(ids.has(iid)||numbers.has(numKey))throw new Error('Hay un número de factura duplicado.');ids.add(iid);numbers.add(numKey);
    const existed=old.get(iid);
    if(existed){
      for(const key of ['number','date','operationDate','description','notes','owner','client','totalCents','baseCents','vatCents','rate','amountMode','createdAt'])
        if(!sameValue(i[key],existed[key]))throw new Error('Una factura guardada no se puede modificar. Duplica la factura para crear otra.');
      return {...existed,paid:!!i.paid};
    }
    if(!validDate(i.date)||(i.operationDate&&!validDate(i.operationDate)))throw new Error('Revisa las fechas.');
    if(!Number.isSafeInteger(i.totalCents)||i.totalCents<0||i.totalCents>99999999999||![0,4,10,21].includes(i.rate))throw new Error('Revisa el importe y el IVA.');
    const amountMode=i.amountMode??'total';
    if(!['base','total'].includes(amountMode))throw new Error('Elige si introduces la base o el total.');
    if(amountMode==='base'&&(!Number.isSafeInteger(i.baseCents)||i.baseCents<0||i.baseCents>99999999999))throw new Error('Revisa la base imponible.');
    const baseCents=amountMode==='base'?i.baseCents:Math.round(i.totalCents*100/(100+i.rate));
    const vatCents=amountMode==='base'?Math.round(baseCents*i.rate/100):i.totalCents-baseCents;
    if(baseCents+vatCents!==i.totalCents)throw new Error('El total no coincide con la base y el IVA.');
    return {id:iid,number,date:i.date,operationDate:i.operationDate||'',description:string(i.description,1500,true),notes:string(i.notes??'',1200),owner:owner(i.owner),client:client(i.client),totalCents:i.totalCents,rate:i.rate,baseCents,vatCents,amountMode,paid:!!i.paid,createdAt:string(i.createdAt,40,true)};
  });
  for(const id of old.keys())if(!ids.has(id))throw new Error('No se pueden eliminar facturas guardadas al restaurar una copia.');
  return { version:1, revision:previous.revision+1, updatedAt:new Date().toISOString(), owner:owner(v.owner), clients, invoices, draft:null, lastBackup:null };
}
