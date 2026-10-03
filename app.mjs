import {blankData,createDataStore,mergeBackup} from "./data-store.mjs";
import {remainingAmounts,refundAmounts} from "./invoice-data.mjs";

'use strict';
const STORE='mis-facturas-nube-v1',root=document.getElementById('root');
const embedded=blankData();
let busy=false,syncError='',data=embedded, page='invoices', selected=null, draft=null, filter='',statusFilter='all',toastTimer;

const $=id=>document.getElementById(id);
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=c=>new Intl.NumberFormat('es-ES',{style:'currency',currency:'EUR'}).format(c/100);
const today=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
const dateText=d=>{if(!/^\d{4}-\d{2}-\d{2}$/.test(d||''))return '';return d.split('-').reverse().join('/');};
const id=()=>globalThis.crypto?.randomUUID?.()||`${Date.now()}-${Math.random().toString(36).slice(2)}`;
function validDate(s){if(typeof s!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(s))return false;const d=new Date(s+'T12:00:00Z');return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===s;}
function validData(d){return !!d&&d.version===1&&Number.isInteger(d.revision)&&d.revision>=0&&d.owner&&typeof d.owner.name==='string'&&Array.isArray(d.clients)&&Array.isArray(d.invoices)&&d.clients.length<100000&&d.invoices.length<100000&&d.clients.every(c=>c&&typeof c.id==='string'&&typeof c.name==='string')&&d.invoices.every(i=>i&&typeof i.id==='string'&&typeof i.number==='string'&&validDate(i.date)&&i.owner&&typeof i.owner.name==='string'&&i.client&&typeof i.client.name==='string'&&typeof i.description==='string'&&Number.isSafeInteger(i.totalCents)&&(i.totalCents>=0||i.kind==='credit')&&Number.isFinite(i.rate)&&i.rate>=0&&i.rate<=100&&Number.isSafeInteger(i.baseCents)&&Number.isSafeInteger(i.vatCents)&&i.baseCents+i.vatCents===i.totalCents);}
function parseAmount(value){let v=String(value).trim().replace(/[\s€]/g,'');if(v.includes(',')){if(v.split(',').length!==2)return null;v=v.replace(/\./g,'').replace(',','.');}if(!/^\d+(\.\d{1,2})?$/.test(v))return null;const parts=v.split('.'),c=Number(parts[0])*100+Number((parts[1]||'').padEnd(2,'0'));return Number.isSafeInteger(c)&&c<=99999999999?c:null;}
function calculate(cents,rate,mode='total'){
 if(!Number.isSafeInteger(cents)||cents<0||!Number.isFinite(rate)||rate<0||rate>100||!['total','base'].includes(mode))return null;
 const baseCents=mode==='base'?cents:Math.round(cents*100/(100+rate));
 const vatCents=mode==='base'?Math.round(baseCents*rate/100):cents-baseCents;
 const totalCents=baseCents+vatCents;
 if(!Number.isSafeInteger(totalCents))return null;
 return {totalCents,baseCents,vatCents,rate};
}
function nextNumber(date=today()){const y=date.slice(0,4);let max=0;for(const i of data.invoices){const m=i.number.match(new RegExp('^'+y+'-(\\d+)$'));if(m)max=Math.max(max,Number(m[1]));}return `${y}-${String(max+1).padStart(3,'0')}`;}
function initialDraft(){return {number:nextNumber(),date:today(),operationDate:'',clientId:'',description:'',amountMode:'total',total:'',rate:'21',notes:''};}
function draftFromInvoice(i){const amountMode=i.amountMode==='base'?'base':'total';return {...initialDraft(),clientId:data.clients.some(c=>c.id===i.client.id)?i.client.id:'',description:i.description,amountMode,total:((amountMode==='base'?i.baseCents:i.totalCents)/100).toFixed(2).replace('.',','),rate:String(i.rate),notes:i.notes};}
function persist(){return false;}
function toast(s){$('toast').textContent=s;clearTimeout(toastTimer);toastTimer=setTimeout(()=>{$('toast').textContent='';},4200);}
function formField(label,name,value='',opts={}){return `<div class="${opts.span?'span':''}"><label ${opts.labelId?`id="${esc(opts.labelId)}"`:""} for="${esc(name)}">${label}</label><input id="${esc(name)}" name="${esc(name)}" value="${esc(value)}" ${opts.required?'required':''} ${opts.type?`type="${opts.type}"`:''} ${opts.max?`maxlength="${opts.max}"`:''} ${opts.placeholder?`placeholder="${esc(opts.placeholder)}"`:''}>${opts.hint?`<p class="hint">${opts.hint}</p>`:''}</div>`;}
function navigate(p){if(busy)return toast('Espera a que termine el guardado.');if(page==='new')readDraft();page=p;selected=null;render();}
function shell(content){return `<div class="app"><aside class="sidebar no-print"><div class="brand">Mis facturas<span>${esc(data.owner.name||'Tu cuenta privada')}</span></div><nav aria-label="Secciones"><button data-nav="invoices" class="${page==='invoices'||page==='detail'?'active':''}">Facturas</button><button data-nav="new" class="${page==='new'?'active':''}">Nueva factura</button><button data-nav="clients" class="${page==='clients'?'active':''}">Clientes</button><button data-nav="owner" class="${page==='owner'?'active':''}">Mis datos</button><button data-nav="backup" class="${page==='backup'?'active':''}">Copia y ayuda</button></nav><footer><strong>${esc(data.owner.name)}</strong>Acceso privado<br>IVA inicial: 21 %</footer></aside><main class="workspace"><div id="sync-message" class="no-print">${syncError?`<div class="notice" role="status">${esc(syncError)} <button class="small" data-action="refresh">Actualizar datos</button></div>`:''}</div>${content}<div class="storage-status no-print"><span>Cuenta: ${esc(currentUser?.email||'')}</span><div><button class="link" data-action="refresh">Actualizar datos</button><button class="link" data-action="logout">Cerrar sesión</button></div></div></main></div>`;}
function render(){if(!currentUser)return;let content='';if(!data.owner.name&&['invoices','new','clients'].includes(page))content=welcomePage();else if(page==='new')content=newPage();else if(page==='clients')content=clientsPage();else if(page==='owner')content=ownerPage();else if(page==='backup')content=backupPage();else if(page==='detail')content=detailPage();else content=listPage();root.innerHTML=shell(content);bind();if(page==='new')updateTotals();}
function welcomePage(){return `<header class="top"><div><h1>Prepara tus facturas</h1><p class="muted">Solo necesitas configurar tus datos una vez.</p></div></header><section class="card"><h2>Empieza con tus datos</h2><p>Importa el archivo de datos iniciales o una copia de tus facturas. También puedes rellenar tu ficha.</p><div class="actions" style="justify-content:flex-start"><button class="primary" data-nav="backup">Importar mis datos</button><button data-nav="owner">Rellenar mis datos</button></div><p class="hint">Después aparecerán automáticamente al entrar con esta misma cuenta en tus otros dispositivos.</p></section>`;}
function listPage(){const total=data.invoices.reduce((n,i)=>n+i.totalCents,0),pending=data.invoices.filter(i=>!i.paid).reduce((n,i)=>n+i.totalCents,0);return `<header class="top no-print"><div><h1>Tus facturas</h1><p class="muted">Consulta, busca e imprime tus facturas.</p></div><button class="primary" data-action="new">+ Nueva factura</button></header>${data.invoices.length?`<div class="summary no-print"><div class="card"><small>Facturas guardadas</small><strong>${data.invoices.length}</strong></div><div class="card"><small>Total facturado</small><strong>${money(total)}</strong></div><div class="card"><small>Pendiente de cobro</small><strong>${money(pending)}</strong></div></div><section class="card no-print"><div class="toolbar"><input id="search" aria-label="Buscar facturas" placeholder="Buscar por número, cliente o concepto" value="${esc(filter)}"><select id="status-filter" aria-label="Filtrar por cobro" style="width:auto"><option value="all" ${statusFilter==='all'?'selected':''}>Todos los cobros</option><option value="pending" ${statusFilter==='pending'?'selected':''}>Pendientes</option><option value="paid" ${statusFilter==='paid'?'selected':''}>Pagadas</option></select></div><div id="invoice-list">${invoiceRows()}</div></section>`:`<section class="card empty no-print"><div class="empty-icon" aria-hidden="true">№</div><h2>Tu primera factura empieza aquí</h2><p class="muted">Tus datos ya están preparados.<br>Añade un cliente, escribe el concepto e introduce el total o la base.</p><button class="primary" data-action="new">Crear mi primera factura</button></section>`}${draft?'<p class="help-line no-print">Tienes un borrador pendiente. <button class="link" data-nav="new">Continuar borrador</button></p>':''}<p class="help-line no-print">Introduce el total con IVA o la base imponible. Los otros importes se calculan automáticamente.</p>`;}
function invoiceRows(){const list=data.invoices.filter(i=>(statusFilter==='all'||(statusFilter==='paid'?i.paid:!i.paid))&&`${i.number} ${i.client.name} ${i.description}`.toLocaleLowerCase('es').includes(filter.toLocaleLowerCase('es'))).sort((a,b)=>b.date.localeCompare(a.date)||b.number.localeCompare(a.number,'es',{numeric:true}));if(!list.length)return '<p class="muted">No hay facturas que coincidan con la búsqueda.</p>';return `<div class="table-wrap"><table><thead><tr><th>Número</th><th>Cliente</th><th>Fecha</th><th class="right">Total</th><th>Cobro</th><th></th></tr></thead><tbody>${list.map(i=>`<tr><td><strong>${esc(i.number)}</strong></td><td>${esc(i.client.name)}</td><td>${dateText(i.date)}</td><td class="right" style="white-space:nowrap">${money(i.totalCents)}</td><td><span class="pill ${i.paid?'paid':''}">${i.paid?'Pagada':'Pendiente'}</span></td><td><button class="small" data-view="${esc(i.id)}">Ver / PDF</button></td></tr>`).join('')}</tbody></table></div>`;}
function newPage(){if(!draft)draft=initialDraft();return `<header class="top no-print"><div><h1>Nueva factura</h1><p class="muted">Elige cliente e introduce el total o la base imponible.</p></div></header><div class="split no-print"><form id="invoice-form" class="card"><div id="form-error" role="alert"></div><div class="step">1. DATOS DE LA FACTURA</div><div class="grid">${formField('Número','number',draft.number,{required:true,max:50,hint:'Propuesto automáticamente. Cámbialo si ya usas otra numeración.'})}${formField('Fecha de emisión','date',draft.date,{required:true,type:'date'})}<div class="span"><label for="clientId">Cliente</label><select id="clientId" name="clientId" required><option value="">Selecciona un cliente</option>${[...data.clients].sort((a,b)=>a.name.localeCompare(b.name,'es')).map(c=>`<option value="${esc(c.id)}" ${c.id===draft.clientId?'selected':''}>${esc(c.name)} · ${esc(c.taxId)}</option>`).join('')}</select><button class="link" type="button" data-action="add-client">+ Añadir cliente</button></div><div class="span"><label for="description">Concepto / servicio</label><textarea id="description" name="description" maxlength="1500" required placeholder="Por ejemplo: sesión fotográfica realizada el…">${esc(draft.description)}</textarea></div></div><div class="step" style="margin-top:25px">2. IMPORTE</div><div class="grid"><div class="span"><label for="amountMode">Quiero introducir</label><select id="amountMode" name="amountMode"><option value="total" ${draft.amountMode!=='base'?'selected':''}>El total con IVA incluido</option><option value="base" ${draft.amountMode==='base'?'selected':''}>La base imponible (sin IVA)</option></select></div>${formField(draft.amountMode==='base'?'Base imponible, sin IVA (€)':'Total con IVA incluido (€)','total',draft.total,{required:true,placeholder:draft.amountMode==='base'?'100,00':'121,00',max:18,labelId:'amount-label'})}<div><label for="rate">IVA (%)</label><select id="rate" name="rate">${[21,10,4,0].map(r=>`<option value="${r}" ${Number(draft.rate)===r?'selected':''}>${r} %</option>`).join('')}</select></div></div><div class="totals" aria-live="polite"><div><small>Base imponible</small><strong id="calc-base">—</strong></div><div><small>Cuota IVA</small><strong id="calc-vat">—</strong></div><div><small>Total</small><strong id="calc-total">—</strong></div></div><p class="hint">El total es el importe con IVA, sin retención de IRPF. Un concepto global y un tipo de IVA por factura.</p><details style="margin-top:23px"><summary style="cursor:pointer;font-size:14px">Fecha de operación y observaciones</summary><div class="grid" style="margin-top:16px">${formField('Fecha de operación (si es distinta)','operationDate',draft.operationDate,{type:'date',span:true})}<div class="span"><label for="notes">Observaciones / mención fiscal</label><textarea id="notes" name="notes" maxlength="1200" placeholder="Condiciones de pago u otra información que deba figurar en la factura">${esc(draft.notes)}</textarea></div></div></details><div class="actions"><button type="button" data-nav="invoices">Volver</button><button class="primary" type="submit">Guardar factura</button></div><p class="save-note">La factura conservará estos datos aunque después cambies un cliente o tus datos personales.</p></form><aside class="side-help"><section class="card"><h3>Tus datos ya están puestos</h3><p><strong>${esc(data.owner.name)}</strong><br>${esc(data.owner.taxId)}</p><p>${esc(data.owner.email)}<br>${esc(data.owner.phone)}</p><button class="link" data-nav="owner">Ver mis datos</button></section><section class="card"><h3>En tres pasos</h3><ol><li>Elige un cliente o añádelo aquí mismo.</li><li>Escribe el concepto y elige si introduces el total o la base.</li><li>Guarda la factura y pulsa «Descargar PDF».</li></ol><p>Abre este enlace con tu misma cuenta en el móvil, la tablet o el ordenador.</p></section></aside></div>`;}
function updateTotals(){
 const mode=$('amountMode')?.value||'total',amount=parseAmount($('total')?.value??''),rate=Number($('rate')?.value);
 if($('amount-label'))$('amount-label').textContent=mode==='base'?'Base imponible, sin IVA (€)':'Total con IVA incluido (€)';
 if($('total'))$('total').placeholder=mode==='base'?'100,00':'121,00';
 const result=amount===null?null:calculate(amount,rate,mode);
 for(const [el,key] of [['calc-base','baseCents'],['calc-vat','vatCents'],['calc-total','totalCents']])if($(el))$(el).textContent=result?money(result[key]):'—';
}
function readDraft(){if(!$('invoice-form'))return;draft=Object.fromEntries(new FormData($('invoice-form')).entries());try{sessionStorage.setItem(draftKey(),JSON.stringify(draft));}catch(e){}}
async function saveInvoice(e){e.preventDefault();readDraft();const fail=s=>{$('form-error').innerHTML=`<div class="error">${esc(s)}</div>`;$('form-error').scrollIntoView({block:'center'});};const c=data.clients.find(c=>c.id===draft.clientId),amount=parseAmount(draft.total),number=draft.number.trim();if(!number||!validDate(draft.date)||!draft.description.trim())return fail('Completa el número, la fecha y el concepto.');if(data.invoices.some(i=>i.number.toLocaleLowerCase('es')===number.toLocaleLowerCase('es')))return fail('Ese número de factura ya existe. Escribe el siguiente de tu serie.');if(!c)return fail('Elige un cliente o añádelo primero.');if(['name','taxId','address','city','country'].some(k=>!String(data.owner[k]||'').trim()))return fail('Completa tus datos fiscales en Mis datos antes de guardar.');if(['name','taxId','address'].some(k=>!String(c[k]||'').trim()))return fail('Completa el nombre, NIF y dirección del cliente.');if(amount===null)return fail('Escribe un importe válido, por ejemplo 100,00 o 121,00. Se admiten hasta dos decimales.');if(draft.operationDate&&!validDate(draft.operationDate))return fail('Revisa la fecha de operación.');const amountMode=draft.amountMode||'total',calc=calculate(amount,Number(draft.rate),amountMode);if(!calc)return fail('Revisa el tipo de IVA.');if(![0,4,10,21].includes(calc.rate))return fail('Elige un tipo de IVA de la lista.');const inv={id:id(),number,date:draft.date,operationDate:draft.operationDate,description:draft.description.trim(),notes:draft.notes.trim(),owner:{...data.owner},client:{...c},...calc,amountMode,paid:false,createdAt:new Date().toISOString()};try{await saveCloud({...data,invoices:[...data.invoices,inv]});draft=null;try{sessionStorage.removeItem(draftKey());}catch(e){}selected=inv.id;page='detail';render();toast('Factura guardada y sincronizada.');}catch(err){fail(err.message);}}
function clientsPage(){return `<header class="top no-print"><div><h1>Clientes</h1><p class="muted">Guárdalos una vez y elígelos en cada factura.</p></div><button class="primary" data-action="add-client">+ Añadir cliente</button></header><section class="card no-print">${!data.clients.length?'<div class="empty"><h2>Aún no hay clientes</h2><p class="muted">Añade su nombre, NIF y dirección fiscal.</p><button data-action="add-client">Añadir primer cliente</button></div>':`<div class="table-wrap"><table><thead><tr><th>Cliente</th><th>NIF / CIF</th><th>Email</th><th></th></tr></thead><tbody>${[...data.clients].sort((a,b)=>a.name.localeCompare(b.name,'es')).map(c=>`<tr><td><strong>${esc(c.name)}</strong><br><small class="muted breakable">${esc(c.address)}</small></td><td>${esc(c.taxId)}</td><td>${esc(c.email)}</td><td><button class="small" data-edit-client="${esc(c.id)}">Editar</button></td></tr>`).join('')}</tbody></table></div>`}</section><p class="help-line no-print">Los cambios en un cliente se aplican a las facturas nuevas. Las ya guardadas conservan sus datos.</p>`;}
function openClient(clientId){const c=data.clients.find(c=>c.id===clientId)||{name:'',taxId:'',address:'',email:'',phone:''};const d=$('client-dialog');d.innerHTML=`<form id="client-form" class="card"><div class="dialog-head"><h2>${c.id?'Editar cliente':'Añadir cliente'}</h2><button type="button" id="close-client" aria-label="Cerrar">×</button></div><div id="client-error" role="alert"></div><div class="grid">${formField('Nombre / razón social','client-name',c.name,{span:true,required:true,max:180})}${formField('NIF / CIF','client-taxId',c.taxId,{required:true,max:40})}${formField('Teléfono (opcional)','client-phone',c.phone,{max:40})}<div class="span"><label for="client-address">Dirección fiscal completa</label><textarea id="client-address" name="client-address" required maxlength="600" placeholder="Calle, número, código postal, localidad, provincia y país">${esc(c.address)}</textarea></div>${formField('Email (opcional)','client-email',c.email,{span:true,type:'email',max:150})}</div><div class="actions"><button type="button" id="cancel-client">Cancelar</button><button type="submit" class="primary">Guardar cliente</button></div></form>`;d.showModal();$('close-client').onclick=$('cancel-client').onclick=()=>d.close();$('client-form').onsubmit=async e=>{e.preventDefault();const next={id:c.id||id(),name:$('client-name').value.trim(),taxId:$('client-taxId').value.trim(),address:$('client-address').value.trim(),phone:$('client-phone').value.trim(),email:$('client-email').value.trim()};if(!next.name||!next.taxId||!next.address)return;const normalized=s=>s.replace(/[\s.-]/g,'').toUpperCase();if(data.clients.some(o=>o.id!==next.id&&normalized(o.taxId)===normalized(next.taxId))){$('client-error').innerHTML='<div class="error">Ya tienes un cliente con este NIF. Edita su ficha o selecciónalo en la factura.</div>';return;}try{await saveCloud({...data,clients:c.id?data.clients.map(o=>o.id===c.id?next:o):[...data.clients,next]});if(page==='new'){draft.clientId=next.id;try{sessionStorage.setItem(draftKey(),JSON.stringify(draft));}catch(e){}}d.close();render();toast('Cliente guardado y sincronizado.');}catch(err){$('client-error').innerHTML=`<div class="error">${esc(err.message)} <button type="button" id="refresh-client">Actualizar datos</button></div>`;$('refresh-client').onclick=()=>loadCloud(false).then(()=>toast('Datos actualizados. Revisa y vuelve a guardar.')).catch(()=>toast('No se han podido actualizar los datos.'));}};}
function ownerPage(){const o=data.owner;return `<header class="top no-print"><div><h1>Mis datos</h1><p class="muted">Aparecerán automáticamente en tus nuevas facturas.</p></div></header><form id="owner-form" class="card no-print" style="max-width:850px"><div class="grid">${formField('Nombre / razón social','name',o.name,{required:true,span:true,max:180})}${formField('NIF / CIF','taxId',o.taxId,{required:true,max:40})}${formField('Teléfono','phone',o.phone,{max:40})}${formField('Dirección fiscal','address',o.address,{required:true,span:true,max:250})}${formField('Código postal y localidad','city',o.city,{required:true,max:180})}${formField('País','country',o.country,{required:true,max:80})}${formField('Email','email',o.email,{type:'email',span:true,max:150})}${formField('IBAN','iban',o.iban,{span:true,max:50})}${formField('Forma de pago','payment',o.payment,{span:true,max:150})}</div><div class="actions"><button class="primary" type="submit">Guardar mis datos</button></div><p class="hint">Las facturas ya guardadas conservarán los datos con los que se crearon.</p></form>`;}
function invoiceHTML(i){const o=i.owner,c=i.client;return `<article class="invoice" aria-label="Factura ${esc(i.number)}"><div class="invoice-head"><div><h2>${esc(o.name)}</h2><p>NIF: ${esc(o.taxId)}</p><p>${esc(o.address)}</p><p>${esc(o.city)}</p><p>${esc(o.country)}</p>${o.email?`<p>${esc(o.email)}</p>`:''}${o.phone?`<p>${esc(o.phone)}</p>`:''}</div><div class="invoice-meta"><h2>FACTURA</h2><p><strong>${esc(i.number)}</strong></p><p>Fecha: ${dateText(i.date)}</p>${i.operationDate&&i.operationDate!==i.date?`<p>Operación: ${dateText(i.operationDate)}</p>`:''}</div></div><section class="invoice-to"><h3>FACTURAR A</h3><p><strong>${esc(c.name)}</strong></p><p>NIF: ${esc(c.taxId)}</p><p class="breakable">${esc(c.address)}</p></section><table><thead><tr><th style="width:55%">Concepto / servicio</th><th class="right">Cantidad</th><th class="right">Precio sin IVA</th><th class="right">Base</th></tr></thead><tbody><tr><td class="description">${esc(i.description)}</td><td class="right">1</td><td class="right" style="white-space:nowrap">${money(i.baseCents)}</td><td class="right" style="white-space:nowrap">${money(i.baseCents)}</td></tr></tbody></table><div class="invoice-totals"><div><span>Base imponible</span><span>${money(i.baseCents)}</span></div><div><span>IVA (${i.rate} %)</span><span>${money(i.vatCents)}</span></div><div class="grand"><span>TOTAL</span><span>${money(i.totalCents)}</span></div></div><footer class="invoice-footer">${o.payment?`<p><strong>Forma de pago:</strong> ${esc(o.payment)}</p>`:''}${o.iban?`<p><strong>IBAN:</strong> ${esc(o.iban)}</p>`:''}${i.notes?`<p class="invoice-notes">${esc(i.notes)}</p>`:''}</footer></article>`;}
function detailPage(){const i=data.invoices.find(o=>o.id===selected);if(!i){page='invoices';return listPage();}return `<header class="top no-print"><div><button class="link" data-nav="invoices">Volver a facturas</button><h1>Factura ${esc(i.number)}</h1><span class="pill ${i.paid?'paid':''}">${i.paid?'Pagada':'Pendiente de cobro'}</span></div><button class="primary" data-action="pdf">Descargar PDF</button></header>${invoiceHTML(i)}<div class="actions no-print"><button data-action="toggle-paid">${i.paid?'Marcar pendiente':'Marcar pagada'}</button><button data-action="duplicate">Duplicar factura</button><button data-action="print">Imprimir</button></div><p class="help-line no-print">Los datos de esta factura se conservan tal como se guardaron.</p>`;}
function backupPage(){return `<header class="top no-print"><div><h1>Copia y ayuda</h1><p class="muted">Tus facturas, también en el móvil y la tablet.</p></div></header><section class="card no-print" style="max-width:800px"><h2>La misma cuenta en todos tus dispositivos</h2><p>Abre este enlace e inicia sesión con la misma cuenta de Google. Tus clientes y facturas se guardan en tu cuenta y se cargan al abrir la aplicación.</p><p>Necesitas conexión para cargar y guardar. Si hay un fallo, el formulario se mantiene para que puedas volver a intentarlo.</p></section><section class="card no-print" style="max-width:800px"><h2>Poner un acceso en la pantalla de inicio</h2><p><strong>iPhone o iPad:</strong> abre el enlace en Safari, pulsa Compartir y elige «Añadir a pantalla de inicio».</p><p><strong>Android:</strong> abre el enlace en Chrome, abre el menú y busca «Añadir a pantalla de inicio» o «Instalar aplicación».</p><p><strong>Ordenador:</strong> guarda el enlace en favoritos o usa la opción del navegador para instalar la página como aplicación, si está disponible.</p></section><section class="card no-print" style="max-width:800px"><h2>Descargar una copia de tus datos</h2><p>Conserva una copia adicional con tus datos, clientes y facturas en formato JSON.</p><button class="primary" data-action="backup-now">Descargar copia de datos</button><p class="hint">Incluye ${data.invoices.length} facturas y ${data.clients.length} clientes. Los PDF se descargan desde cada factura.</p></section><section class="card no-print" style="max-width:800px"><h2>Importar datos o una copia anterior</h2><p>Selecciona el archivo JSON de tus datos iniciales o una copia descargada desde esta aplicación. Se añadirán los clientes y facturas nuevos sin eliminar los ya guardados.</p><input type="file" id="import-json" accept=".json,application/json" aria-label="Seleccionar copia JSON"><p class="hint">Los datos de la copia se guardarán en tu cuenta privada de Google.</p></section><section class="card no-print" style="max-width:800px"><h2>Cómo crear una factura</h2><p>En Nueva factura, elige un cliente, escribe la fecha, el concepto y el total con IVA o la base imponible. Revisa los datos, guarda y pulsa «Descargar PDF».</p><p class="hint">Un concepto global y un tipo de IVA por factura, sin retención de IRPF. No realiza envíos a Hacienda. Las facturas guardadas conservan sus datos originales.</p></section>`;}
function download(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),5000);}
function portableHTML(){return '';}
function saveBackup(){download(new Blob([JSON.stringify({...data,draft:null},null,2)],{type:'application/json'}),`Mis_facturas_${today()}.json`);toast('Copia de datos preparada para descargar.');}
function bind(){if($('import-json'))$('import-json').onchange=e=>importBackup(e.target.files[0]);root.querySelectorAll('[data-nav]').forEach(b=>b.onclick=()=>navigate(b.dataset.nav));root.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>{selected=b.dataset.view;page='detail';render();});root.querySelectorAll('[data-edit-client]').forEach(b=>b.onclick=()=>openClient(b.dataset.editClient));root.querySelectorAll('[data-action]').forEach(b=>b.onclick=async()=>{try{const a=b.dataset.action;if(busy)return toast('Espera a que termine el guardado.');if(a==='logout')return await logout();if(a==='pdf')return await downloadPDF(b);if(a==='new')navigate('new');if(a==='add-client')openClient();if(a==='backup-now')saveBackup();if(a==='refresh')await refreshData();if(a==='print'){const i=data.invoices.find(i=>i.id===selected),old=document.title;document.title=`Factura_${i.number}_${i.client.name}`;window.print();document.title=old;}if(a==='toggle-paid'){await saveCloud({...data,invoices:data.invoices.map(i=>i.id===selected?{...i,paid:!i.paid}:i)});render();}if(a==='duplicate'){const i=data.invoices.find(i=>i.id===selected);if(draft&&!await confirmAction('Ya hay un borrador. ¿Quieres sustituirlo por esta copia?'))return;draft=draftFromInvoice(i);page='new';render();}}catch(e){b.disabled=false;toast(e.message||'No se ha podido completar. Inténtalo de nuevo.');}});if($('invoice-form')){$('invoice-form').onsubmit=saveInvoice;$('invoice-form').oninput=()=>{readDraft();updateTotals();};$('invoice-form').onchange=()=>{readDraft();updateTotals();};$('total').setAttribute('inputmode','decimal');}if($('owner-form'))$('owner-form').onsubmit=async e=>{e.preventDefault();const next=Object.fromEntries([...new FormData($('owner-form')).entries()].map(([k,v])=>[k,v.trim()]));try{await saveCloud({...data,owner:next});render();toast('Datos guardados para las nuevas facturas.');}catch(err){toast(err.message);}};if($('search'))$('search').oninput=e=>{filter=e.target.value;$('invoice-list').innerHTML=invoiceRows();$('invoice-list').querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>{selected=b.dataset.view;page='detail';render();});};if($('status-filter'))$('status-filter').onchange=e=>{statusFilter=e.target.value;render();};}

const issued=i=>i.status!=='draft';
let pendingConfirmation=null;
function confirmAction(message){
 return new Promise(resolve=>{
  const dialog=$('confirm-dialog');
  const finish=value=>{dialog.close();pendingConfirmation=null;resolve(value);};
  pendingConfirmation=()=>finish(false);
  dialog.innerHTML=`<section class="card"><h2>Confirmar</h2><p>${esc(message)}</p><div class="actions"><button id="confirm-cancel">Cancelar</button><button id="confirm-ok" class="primary">Confirmar</button></div></section>`;
  $('confirm-cancel').onclick=()=>finish(false);$('confirm-ok').onclick=()=>finish(true);
  dialog.oncancel=e=>{e.preventDefault();finish(false);};dialog.showModal();
 });
}
const activeInvoices=()=>data.invoices.filter(i=>!i.deletedAt);
function numbered(kind='invoice'){
 const prefix=(kind==='credit'?'R-':'')+today().slice(0,4)+'-';let n=0;
 for(const i of data.invoices.filter(issued))if(i.number.startsWith(prefix)&&/^\d+$/.test(i.number.slice(prefix.length)))n=Math.max(n,Number(i.number.slice(prefix.length)));
 return prefix+String(n+1).padStart(3,'0');
}
const initialDraftV1=initialDraft;
initialDraft=()=>({...initialDraftV1(),number:numbered(),kind:'invoice',editId:'',rectifiesId:'',reason:''});
readDraft=()=>{if(!$('invoice-form'))return;draft={...draft,...Object.fromEntries(new FormData($('invoice-form')).entries())};try{sessionStorage.setItem(draftKey(),JSON.stringify(draft));}catch(e){}};
const newPageV1=newPage;
newPage=()=>{
 let html=newPageV1();
 html=html.replace('<button class="primary" type="submit">Guardar factura</button>','<button type="submit" data-save="draft">Guardar borrador</button><button class="primary" type="submit" data-save="issued">Emitir factura</button>');
 html=html.replace('La factura conservará estos datos aunque después cambies un cliente o tus datos personales.','Un borrador se puede modificar o borrar. Al emitir, se conserva la factura y las devoluciones se hacen con una rectificativa.');
 if(draft.editId)html=html.replace('<h1>Nueva factura</h1>','<h1>Modificar borrador</h1>');
 if(draft.kind==='credit'){
  const original=data.invoices.find(i=>i.id===draft.rectifiesId);
  html=html.replace('<h1>Nueva factura</h1>','<h1>Devolución / rectificativa</h1>').replace('<h1>Modificar borrador</h1>','<h1>Modificar rectificativa</h1>');
  html=html.replace('<div class="step">1. DATOS DE LA FACTURA</div>',`<div class="notice">Rectifica la factura <strong>${esc(original?.number)}</strong>. Introduce el importe que devuelves en positivo; el PDF lo reflejará en negativo.</div><label for="reason">Motivo de la rectificación</label><textarea id="reason" name="reason" required maxlength="800">${esc(draft.reason)}</textarea><div class="step" style="margin-top:20px">1. DATOS DE LA RECTIFICATIVA</div>`);
  html=html.replace('name="clientId" required','name="clientId" required disabled').replace('name="rate">','name="rate" disabled>');
  html=html.replace('Emitir factura</button>','Emitir rectificativa</button>');
 }
 return html;
};
const updateTotalsV1=updateTotals;
updateTotals=()=>{
 updateTotalsV1();if(draft?.kind!=='credit')return;
 const original=data.invoices.find(i=>i.id===draft.rectifiesId),amount=parseAmount($('total')?.value||'');
 try{const calc=refundAmounts(original,data.invoices,amount,$('amountMode')?.value||'total',draft.editId);for(const [element,key]of [['calc-base','baseCents'],['calc-vat','vatCents'],['calc-total','totalCents']])$(element).textContent=money(calc[key]);}
 catch(e){for(const name of ['calc-base','calc-vat','calc-total'])if($(name))$(name).textContent='—';}
};
saveInvoice=async e=>{
 e.preventDefault();readDraft();
 const fail=message=>{$('form-error').innerHTML=`<div class="error">${esc(message)}</div>`;$('form-error').scrollIntoView({block:'center'});};
 try{
  const amount=parseAmount(draft.total),status=e.submitter?.dataset.save==='issued'?'issued':'draft';
  if(amount===null)throw new Error('Escribe un importe válido con hasta dos decimales.');
  const original=draft.kind==='credit'?data.invoices.find(i=>i.id===draft.rectifiesId):null;
  const previous=draft.editId?data.invoices.find(i=>i.id===draft.editId):null;
  if(draft.editId&&(!previous||issued(previous)||previous.deletedAt))throw new Error('Este borrador ha cambiado. Actualiza los datos para continuar.');
  const client=original?.client||data.clients.find(c=>c.id===draft.clientId);
  if(!client)throw new Error('Selecciona un cliente.');
  if(!validDate(draft.date)||!draft.description.trim())throw new Error('Completa la fecha y el concepto.');
  const amountMode=draft.amountMode||'total',rate=original?.rate??Number(draft.rate);
  const amounts=original?refundAmounts(original,data.invoices,amount,amountMode,draft.editId):calculate(amount,rate,amountMode);
  if(!amounts)throw new Error('Revisa el importe.');
  const invoice={id:previous?.id||id(),number:draft.number.trim(),date:draft.date,operationDate:draft.operationDate||'',description:draft.description.trim(),notes:draft.notes?.trim()||'',owner:{...(original?.owner||data.owner)},client:{...client},...amounts,rate,amountMode,paid:false,createdAt:previous?.createdAt||new Date().toISOString(),status,kind:original?'credit':'invoice',deletedAt:'',issuedAt:status==='issued'?new Date().toISOString():'',rectifiesId:original?.id||'',rectifiesNumber:original?.number||'',rectifiesDate:original?.date||'',reason:original?draft.reason?.trim()||'':''};
  await saveCloud({...data,invoices:previous?data.invoices.map(i=>i.id===previous.id?invoice:i):[...data.invoices,invoice]});
  draft=null;sessionStorage.removeItem(draftKey());selected=invoice.id;page='detail';render();toast(status==='draft'?'Borrador guardado. Puedes modificarlo o borrarlo.':'Factura emitida y guardada.');
 }catch(err){fail(err.message);}
};
async function editSavedDraft(invoice){
 if(issued(invoice)||invoice.deletedAt)return;
 if(draft&&!await confirmAction('Hay otro formulario sin terminar. ¿Sustituirlo por este borrador?'))return;
 draft={...draftFromInvoice(invoice),number:invoice.number,date:invoice.date,operationDate:invoice.operationDate,editId:invoice.id,kind:invoice.kind||'invoice',rectifiesId:invoice.rectifiesId||'',reason:invoice.reason||'',total:(Math.abs(invoice.amountMode==='base'?invoice.baseCents:invoice.totalCents)/100).toFixed(2).replace('.',',')};
 page='new';render();readDraft();
}
async function startRefund(invoice){
 const balance=remainingAmounts(invoice,data.invoices);
 if(balance.totalCents<=0)return toast('Esta factura ya está rectificada por completo.');
 if(draft&&!await confirmAction('Hay un formulario sin terminar. ¿Sustituirlo por la devolución?'))return;
 draft={...initialDraft(),number:numbered('credit'),kind:'credit',rectifiesId:invoice.id,clientId:invoice.client.id,rate:String(invoice.rate),amountMode:'total',total:(balance.totalCents/100).toFixed(2).replace('.',','),operationDate:invoice.operationDate||invoice.date,description:'Devolución de '+invoice.description,reason:'Devolución del pedido'};
 page='new';render();readDraft();
}
const invoiceHTMLV1=invoiceHTML;
invoiceHTML=i=>{
 let html=invoiceHTMLV1(i);
 if(!issued(i))html=html.replace('<h2>FACTURA</h2>','<h2>BORRADOR</h2>').replace('<section class="invoice-to">','<p class="notice">Borrador · No es una factura emitida</p><section class="invoice-to">');
 if(i.kind==='credit')html=html.replace('<h2>FACTURA</h2>','<h2 style="font-size:18px">FACTURA<br>RECTIFICATIVA</h2>').replace('<section class="invoice-to">',`<p class="notice">Rectifica la factura ${esc(i.rectifiesNumber)} de ${dateText(i.rectifiesDate)}.<br>Motivo: ${esc(i.reason)}<br>Rectificación por diferencias: devolución del importe indicado.</p><section class="invoice-to">`);
 return html;
};
function documentLabel(i){return i.deletedAt?'En la papelera':!issued(i)?'Borrador':i.kind==='credit'?'Rectificativa':data.invoices.some(c=>c.rectifiesId===i.id&&issued(c))?'Con devolución':i.paid?'Pagada':'Pendiente';}
detailPage=()=>{
 const i=data.invoices.find(i=>i.id===selected);if(!i){page='invoices';return listPage();}
 const related=data.invoices.filter(c=>c.rectifiesId===i.id&&issued(c));
 return `<header class="top no-print"><div><button class="link" data-nav="invoices">Volver a facturas</button><h1>${!issued(i)?'Borrador':i.kind==='credit'?'Rectificativa':'Factura'} ${esc(i.number)}</h1><span class="pill">${documentLabel(i)}</span></div>${i.deletedAt?'':`<button class="primary" data-action="pdf">${issued(i)?'Descargar PDF':'PDF del borrador'}</button>`}</header>${invoiceHTML(i)}<div class="actions no-print">${i.deletedAt?'<button class="primary" data-action="restore-draft">Recuperar borrador</button>':!issued(i)?'<button class="primary" data-action="edit-draft">Modificar</button><button data-action="trash-draft">Borrar borrador</button><button data-action="issue-draft">Emitir factura</button>':`<button data-action="toggle-paid">${i.kind==='credit'?(i.paid?'Marcar devolución pendiente':'Marcar importe devuelto'):(i.paid?'Marcar pendiente':'Marcar pagada')}</button>${i.kind!=='credit'?'<button data-action="refund">Devolución / rectificar</button><button data-action="duplicate">Duplicar factura</button>':''}`}<button data-action="print">Imprimir</button></div>${related.length?`<section class="card no-print" style="margin-top:20px"><h2>Devoluciones de esta factura</h2>${related.map(c=>`<p><button class="link" data-view="${esc(c.id)}">${esc(c.number)} · ${money(c.totalCents)}</button></p>`).join('')}<p>Importe tras devoluciones: <strong>${money(remainingAmounts(i,data.invoices).totalCents)}</strong></p></section>`:''}<p class="help-line no-print">${issued(i)?'La factura emitida se conserva. Para devolver un importe, crea una rectificativa vinculada.':'Puedes modificar o borrar este borrador antes de emitirlo.'}</p>`;
};
listPage=()=>{
 const list=activeInvoices().filter(issued),net=list.reduce((n,i)=>n+i.totalCents,0),pending=list.filter(i=>i.kind!=='credit'&&!i.paid).reduce((n,i)=>n+remainingAmounts(i,list).totalCents,0);
 return `<header class="top"><div><h1>Tus facturas</h1><p class="muted">Borradores, facturas y devoluciones.</p></div><button class="primary" data-action="new">+ Nueva factura</button></header><div class="summary no-print"><div class="card"><small>Documentos emitidos</small><strong>${list.length}</strong></div><div class="card"><small>Total neto emitido</small><strong>${money(net)}</strong></div><div class="card"><small>Pendiente de cobro</small><strong>${money(pending)}</strong></div></div><section class="card no-print"><div class="toolbar"><input id="search" aria-label="Buscar facturas" placeholder="Buscar por número, cliente o concepto" value="${esc(filter)}"><select id="status-filter" aria-label="Filtrar documentos" style="width:auto">${[['all','Todos'],['draft','Borradores'],['issued','Emitidas'],['credit','Rectificativas'],['trash','Papelera']].map(([value,label])=>`<option value="${value}" ${statusFilter===value?'selected':''}>${label}</option>`).join('')}</select></div><div id="invoice-list">${invoiceRows()}</div></section>${draft?'<p class="help-line"><button class="link" data-nav="new">Continuar formulario sin terminar</button></p>':''}`;
};
invoiceRows=()=>{
 const list=data.invoices.filter(i=>(statusFilter==='trash'?!!i.deletedAt:!i.deletedAt)&&(statusFilter==='draft'?!issued(i):statusFilter==='issued'?issued(i):statusFilter==='credit'?i.kind==='credit':true)&&`${i.number} ${i.client.name} ${i.description}`.toLocaleLowerCase('es').includes(filter.toLocaleLowerCase('es'))).sort((a,b)=>b.date.localeCompare(a.date)||b.number.localeCompare(a.number,'es',{numeric:true}));
 if(!list.length)return '<p class="muted">No hay documentos en esta vista.</p>';
 return `<div class="table-wrap"><table><thead><tr><th>Número</th><th>Cliente</th><th>Fecha</th><th class="right">Total</th><th>Estado</th><th></th></tr></thead><tbody>${list.map(i=>`<tr><td><strong>${esc(i.number)}</strong></td><td>${esc(i.client.name)}</td><td>${dateText(i.date)}</td><td class="right">${money(i.totalCents)}</td><td><span class="pill">${documentLabel(i)}</span></td><td><button class="small" data-view="${esc(i.id)}">${!issued(i)?'Ver / modificar':'Ver / PDF'}</button></td></tr>`).join('')}</tbody></table></div>`;
};
const bindV1=bind;
bind=()=>{
 bindV1();
 for(const button of root.querySelectorAll('[data-action]')){
  const action=button.dataset.action;
  if(!['edit-draft','trash-draft','restore-draft','issue-draft','refund'].includes(action))continue;
  button.onclick=async()=>{if(busy)return;const i=data.invoices.find(i=>i.id===selected);try{
   if(action==='edit-draft')return editSavedDraft(i);
   if(action==='refund')return startRefund(i);
   if(action==='trash-draft'&&!await confirmAction('¿Mover este borrador a la papelera? Podrás recuperarlo.'))return;
   if(action==='issue-draft'&&!await confirmAction('Al emitir, los datos se conservarán. Si hay una devolución, crearás una rectificativa. ¿Emitir factura?'))return;
   const changed=action==='issue-draft'?{...i,status:'issued',issuedAt:new Date().toISOString()}: {...i,deletedAt:action==='trash-draft'?new Date().toISOString():''};
   await saveCloud({...data,invoices:data.invoices.map(row=>row.id===i.id?changed:row)});render();toast(action==='trash-draft'?'Borrador en la papelera.':action==='restore-draft'?'Borrador recuperado.':'Factura emitida.');
  }catch(e){toast(e.message);}};
 }
};

let cloud=null,auth=null,currentUser=null,unsubscribe=null,sessionEpoch=0,remoteRevision=0,loading=null;
function draftKey(){return STORE+'-draft-'+currentUser.uid;}
function updateSyncMessage(){
 const target=$('sync-message');if(!target)return;
 target.innerHTML=syncError?`<div class="notice" role="status">${esc(syncError)} <button class="small" data-action="refresh">Actualizar datos</button></div>`:'';
 target.querySelector('button')?.addEventListener('click',()=>refreshData().catch(e=>toast(errorText(e))));
}
function errorText(e){
 if(e.code==='permission-denied')return 'Tu cuenta no tiene acceso. Revisa que hayas entrado con la cuenta correcta.';
 if(['unavailable','auth/network-request-failed'].includes(e.code))return 'No hay conexión. Revisa internet y vuelve a intentarlo. No se ha confirmado el guardado.';
 if(e.code==='auth/popup-blocked')return 'El navegador ha bloqueado el acceso con Google. Permite la ventana emergente y vuelve a pulsar Entrar.';
 if(e.code==='auth/popup-closed-by-user')return 'No se ha completado el acceso con Google. Puedes volver a intentarlo.';
 return e.message||'No se ha podido completar. Inténtalo de nuevo.';
}
async function saveCloud(next){
 if(!cloud||!currentUser)throw new Error('Inicia sesión para continuar.');
 if(busy)throw new Error('Espera a que termine el guardado.');
 if(remoteRevision>data.revision)throw new Error('Hay cambios en otro dispositivo. Pulsa «Actualizar datos», revisa y vuelve a guardar.');
 const epoch=sessionEpoch,previous=data,store=cloud;
 busy=true;document.querySelectorAll('button[type="submit"]').forEach(b=>b.disabled=true);
 try{
   const result=await store.save(next,previous);
   if(epoch!==sessionEpoch)throw new Error('La sesión ha cambiado. Entra de nuevo para ver la factura guardada.');
   data=result;syncError='';return result;
 }catch(e){syncError=errorText(e);updateSyncMessage();throw new Error(syncError);}
 finally{busy=false;document.querySelectorAll('button[type="submit"]').forEach(b=>b.disabled=false);}
}
async function loadCloud(show=true,automatic=false){
 if(!cloud)return;
 const epoch=sessionEpoch,store=cloud;
 const result=await store.load();
 if(epoch!==sessionEpoch)return;
 if(!validData(result))throw new Error('Los datos recibidos no son válidos.');
 if(automatic&&!canRefreshView()){
  remoteRevision=Math.max(remoteRevision,result.revision);
  if(result.revision>data.revision){syncError='Hay cambios guardados desde otro dispositivo. Actualiza antes de guardar.';updateSyncMessage();}
  return result;
 }
 if(result.revision>=data.revision)data=result;
 remoteRevision=Math.max(remoteRevision,data.revision);syncError='';
 if(show)render();return data;
}
async function refreshData(){
 if(busy)return;
 if(page==='new')readDraft();
 const ownerValues=$('owner-form')?Object.fromEntries(new FormData($('owner-form')).entries()):null;
 await loadCloud();
 if(ownerValues)for(const [k,v]of Object.entries(ownerValues))if($(k))$(k).value=v;
 toast(ownerValues||page==='new'?'Datos actualizados. Revisa el formulario antes de guardar.':'Datos actualizados.');
}
function canRefreshView(){return !busy&&!$('client-dialog').open&&!$('confirm-dialog')?.open&&['invoices','clients','detail','backup'].includes(page);}
async function applyRemote(rev){
 remoteRevision=Math.max(remoteRevision,rev);
 if(rev<=data.revision||!currentUser)return;
 if(!canRefreshView()){
  syncError='Hay cambios guardados desde otro dispositivo. Actualiza antes de guardar.';updateSyncMessage();return;
 }
 if(loading)return;
 const epoch=sessionEpoch;
 let succeeded=false;
 loading=loadCloud(true,true).then(()=>{succeeded=true;}).catch(e=>{if(epoch===sessionEpoch){syncError=errorText(e);updateSyncMessage();}}).finally(()=>{loading=null;});
 await loading;
 if(succeeded&&epoch===sessionEpoch&&remoteRevision>data.revision&&canRefreshView())await applyRemote(remoteRevision);
}
function loginPage(message=''){
 root.innerHTML=`<main class="workspace" style="max-width:620px;padding-top:12vh"><section class="card"><div class="step">MIS FACTURAS</div><h1>Tus facturas, contigo.</h1><p>Clientes, facturas y PDF en el ordenador, el iPhone y el iPad.</p><p class="muted">Entra con la misma cuenta de Google en todos tus dispositivos.</p>${message?`<p class="error" role="alert">${esc(message)}</p>`:''}<button id="google-login" class="primary">Entrar con Google</button><p class="hint">Solo tu cuenta puede acceder a tus datos. Necesitas conexión para cargar y guardar.</p></section></main>`;
 $('google-login').onclick=()=>{
   const provider=new authSDK.GoogleAuthProvider();provider.setCustomParameters({prompt:'select_account'});
   authSDK.signInWithPopup(auth,provider).catch(e=>{if(!currentUser)loginPage(errorText(e));});
 };
}
async function logout(){
 if(busy)return toast('Espera a que termine el guardado.');
 if(page==='new')readDraft();
 await authSDK.signOut(auth);
}
async function importBackup(file){
 if(!file)return;
 const epoch=sessionEpoch;
 try{
  if(file.size>20000000)throw new Error('La copia es demasiado grande.');
  const backup=JSON.parse(await file.text());
  if(epoch!==sessionEpoch)throw new Error('La sesión ha cambiado. Vuelve a seleccionar la copia.');
  const proposed=mergeBackup(data,backup);
  const added=proposed.invoices.length-data.invoices.length;
  if(!await confirmAction(`Se añadirán ${added} facturas y los clientes de la copia a tu cuenta de Google. Las facturas guardadas se conservarán. ¿Importar?`))return;
  if(epoch!==sessionEpoch)throw new Error('La sesión ha cambiado. Vuelve a seleccionar la copia.');
  await saveCloud(proposed);page='invoices';render();toast('Copia importada y sincronizada.');
 }catch(e){toast(errorText(e));}
}
async function downloadPDF(button){
 const invoice=data.invoices.find(i=>i.id===selected);if(!invoice)return;
 button.disabled=true;
 try{
  const {invoicePDF}=await import('./invoice-pdf.mjs');
  const bytes=await invoicePDF(invoice);
  download(new Blob([bytes],{type:'application/pdf'}),`Factura_${invoice.number.replace(/[^\p{L}\p{N}._-]/gu,'_')}.pdf`);
  toast('PDF preparado para descargar.');
 }finally{button.disabled=false;}
}
let authSDK,firestoreSDK;
async function initCloud(){
 root.innerHTML='<main class="workspace"><section class="card"><h1>Mis facturas</h1><p>Cargando acceso seguro…</p></section></main>';
 try{
  const {firebaseConfig}=await import('./firebase-config.js');
  if(!firebaseConfig)throw new Error('La aplicación está preparada, pero falta conectar su base de datos. Todavía no está disponible para guardar facturas.');
  const [appSDK,a,f]=await Promise.all([
   import('https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js'),
   import('https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js'),
   import('https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js')
  ]);
  authSDK=a;firestoreSDK=f;
  const app=appSDK.initializeApp(firebaseConfig);auth=a.getAuth(app);const db=f.getFirestore(app);
  await a.setPersistence(auth,a.browserLocalPersistence);
  a.onAuthStateChanged(auth,async user=>{
   const epoch=++sessionEpoch;unsubscribe?.();unsubscribe=null;
   pendingConfirmation?.();$('client-dialog').close();$('client-dialog').innerHTML='';
   data=blankData();draft=null;selected=null;filter='';statusFilter='all';page='invoices';syncError='';remoteRevision=0;loading=null;
   currentUser=user;cloud=null;
   if(!user){loginPage();return;}
   root.innerHTML='<main class="workspace"><section class="card"><h1>Mis facturas</h1><p>Cargando tus facturas…</p></section></main>';
   cloud=createDataStore(f,db,user.uid);
   try{draft=JSON.parse(sessionStorage.getItem(draftKey())||'null');}catch(e){}
   try{
    await loadCloud();if(epoch!==sessionEpoch)return;
    unsubscribe=f.onSnapshot(cloud.metaRef,snapshot=>{
     if(epoch!==sessionEpoch||snapshot.metadata.fromCache||snapshot.metadata.hasPendingWrites)return;
     if(snapshot.exists())applyRemote(snapshot.data().revision);
    },e=>{if(epoch===sessionEpoch){syncError=errorText(e);updateSyncMessage();}});
   }catch(e){
    if(epoch!==sessionEpoch)return;
    root.innerHTML=`<main class="workspace"><section class="card"><h1>No se han podido cargar tus datos</h1><p>${esc(errorText(e))}</p><button id="retry" class="primary">Reintentar</button> <button id="signout">Cambiar de cuenta</button></section></main>`;
    $('retry').onclick=()=>location.reload();$('signout').onclick=logout;
   }
  });
 }catch(e){root.innerHTML=`<main class="workspace"><section class="card"><h1>Mis facturas</h1><p>${esc(errorText(e))}</p><button id="retry">Reintentar</button></section></main>`;$('retry').onclick=initCloud;}
}
window.addEventListener('online',()=>{if(currentUser&&canRefreshView())loadCloud(true,true).catch(e=>{syncError=errorText(e);updateSyncMessage();});});
window.addEventListener('offline',()=>{if(currentUser){syncError='Sin conexión. Las nuevas facturas necesitan internet para guardarse.';updateSyncMessage();}});
window.addEventListener('focus',()=>{if(currentUser&&canRefreshView())loadCloud(true,true).catch(e=>{syncError=errorText(e);updateSyncMessage();});});
initCloud();
