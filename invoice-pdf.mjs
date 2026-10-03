import * as PDFLib from "./pdf-lib.mjs";
/* PDF files are generated on this device. All invoice data comes from the signed-in account. */
export async function invoicePDF(i){
 const {PDFDocument,StandardFonts,rgb}=PDFLib;
 const doc=await PDFDocument.create();
 const regular=await doc.embedFont(StandardFonts.Helvetica),bold=await doc.embedFont(StandardFonts.HelveticaBold);
 const ink=rgb(.13,.20,.28),muted=rgb(.4,.46,.53),line=rgb(.85,.88,.91),white=rgb(1,1,1);
 let page,y;const W=595.28,H=841.89,M=45,usable=W-2*M;
 const textSafe=t=>String(t??'').replace(/\t/g,'    ').replace(/\r/g,'');
 const price=n=>new Intl.NumberFormat('es-ES',{minimumFractionDigits:2,maximumFractionDigits:2}).format(n/100)+' €';
 const date=d=>d?d.split('-').reverse().join('/'):'';
 function addPage(){page=doc.addPage([W,H]);y=H-M;}
 function draw(t,x,top,size=10,font=regular,color=ink){page.drawText(textSafe(t),{x,y:top-size,font,size,color});}
 function right(t,x,top,size=10,font=regular,color=ink){draw(t,x-font.widthOfTextAtSize(textSafe(t),size),top,size,font,color);}
 function wrap(t,width,size=10,font=regular){const lines=[];for(const para of textSafe(t).split('\n')){let row='';for(const word of para.split(/ +/)){const test=row?row+' '+word:word;if(font.widthOfTextAtSize(test,size)<=width){row=test;continue;}if(row){lines.push(row);row='';}if(font.widthOfTextAtSize(word,size)<=width){row=word;continue;}let part='';for(const ch of word){if(font.widthOfTextAtSize(part+ch,size)>width){lines.push(part);part=ch;}else part+=ch;}row=part;}lines.push(row);}return lines;}
 function ensure(height){if(y-height<M+20){addPage();draw('Factura '+i.number+' · Continuación',M,y,10,bold);y-=35;}}
 function paragraph(t,width=usable,size=10,font=regular,x=M){for(const row of wrap(t,width,size,font)){ensure(size+5);draw(row,x,y,size,font);y-=size+5;}}
 addPage();
 const top=y;
 const nameLines=wrap(i.owner.name,310,20,bold);for(const row of nameLines){draw(row,M,y,20,bold);y-=25;}y-=6;
 for(const value of ['NIF: '+i.owner.taxId,i.owner.address,i.owner.city,i.owner.country,i.owner.email,i.owner.phone])if(value)paragraph(value,320,10);
 right(i.status==='draft'?'BORRADOR':'FACTURA',W-M,top,i.kind==='credit'?14:22,bold);
 if(i.kind==='credit')right('RECTIFICATIVA',W-M,top-18,14,bold);
 right(i.number,W-M,top-38,12,bold);right('Fecha: '+date(i.date),W-M,top-61,10);
 if(i.operationDate&&i.operationDate!==i.date)right('Operación: '+date(i.operationDate),W-M,top-78,10);
 y=Math.min(y,top-110)-20;page.drawLine({start:{x:M,y},end:{x:W-M,y},thickness:.8,color:line});y-=22;
 if(i.status==='draft'){paragraph('BORRADOR · No es una factura emitida',usable,11,bold);y-=12;}
 if(i.kind==='credit'){paragraph('Rectifica la factura '+i.rectifiesNumber+' de '+date(i.rectifiesDate),usable,11,bold);paragraph('Motivo: '+i.reason);paragraph('Rectificación por diferencias: devolución del importe indicado.');y-=15;}
 draw('FACTURAR A',M,y,9,bold,muted);y-=23;paragraph(i.client.name,usable,12,bold);paragraph('NIF: '+i.client.taxId);paragraph(i.client.address);y-=25;
 ensure(65);page.drawRectangle({x:M,y:y-29,width:usable,height:29,color:ink});draw('Concepto / servicio',M+10,y-8,10,bold,white);right('Cant.',W-M-145,y-8,9,bold,white);right('Precio sin IVA',W-M-69,y-8,9,bold,white);right('Base',W-M-10,y-8,9,bold,white);y-=43;
 const descriptionTop=y;const descLines=wrap(i.description,usable-220,10);
 right('1',W-M-145,descriptionTop,10);right(price(i.baseCents),W-M-69,descriptionTop,10);right(price(i.baseCents),W-M-10,descriptionTop,10);
 for(const row of descLines){ensure(17);draw(row,M+10,y,10);y-=15;}
 y-=20;page.drawLine({start:{x:M,y},end:{x:W-M,y},thickness:.8,color:line});y-=28;
 ensure(123);draw('Base imponible',W-M-235,y,11);right(price(i.baseCents),W-M-10,y,11);y-=24;draw('IVA ('+i.rate+' %)',W-M-235,y,11);right(price(i.vatCents),W-M-10,y,11);y-=35;
 page.drawRectangle({x:W-M-245,y:y-36,width:245,height:36,color:ink});draw('TOTAL',W-M-235,y-10,14,bold,white);right(price(i.totalCents),W-M-10,y-10,14,bold,white);y-=78;
 if(i.owner.payment){ensure(30);paragraph('Forma de pago: '+i.owner.payment,usable,10);}
 if(i.owner.iban){ensure(30);paragraph('IBAN: '+i.owner.iban,usable,10);}
 if(i.notes){y-=20;paragraph(i.notes,usable,10);}
 const pages=doc.getPages();pages.forEach((p,n)=>{p.drawText(`${n+1} / ${pages.length}`,{x:W-M-28,y:22,size:8,font:regular,color:muted});});
 doc.setTitle('Factura '+i.number);doc.setAuthor(i.owner.name);doc.setSubject('Factura');return await doc.save();
};
