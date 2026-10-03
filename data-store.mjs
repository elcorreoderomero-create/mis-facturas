import { validatedData, sameValue } from './invoice-data.mjs';

export function blankData() {
  return { version: 1, revision: 0, owner: {
    name: '', taxId: '', address: '', city: '', country: 'España', email: '',
    phone: '', iban: '', payment: 'Transferencia bancaria'
  }, clients: [], invoices: [], draft: null, lastBackup: null };
}

export function mergeBackup(current, backup) {
  if (!backup || backup.version !== 1 || !Array.isArray(backup.clients) || !Array.isArray(backup.invoices))
    throw new Error('Selecciona una copia JSON de esta aplicación.');
  const clients = new Map(current.clients.map(c => [c.id, c]));
  const invoices = new Map(current.invoices.map(i => [i.id, i]));
  for (const c of backup.clients) {
    if (clients.has(c.id) && !sameValue(clients.get(c.id), c))
      throw new Error('Un cliente de la copia tiene cambios distintos a los guardados. Revisa su ficha antes de importar.');
    clients.set(c.id, c);
  }
  for (const i of backup.invoices) {
    if (invoices.has(i.id)) {
      const saved = invoices.get(i.id);
      for (const key of ['number', 'date', 'operationDate', 'description', 'notes', 'owner', 'client', 'totalCents', 'baseCents', 'vatCents', 'rate', 'createdAt']) {
        if (!sameValue(saved[key], i[key]))
          throw new Error('La copia contiene una versión distinta de una factura guardada. No se ha cambiado nada.');
      }
      continue; // Preserve the current payment status of invoices already in the account.
    }
    invoices.set(i.id, i);
  }
  const next = { ...current, owner: current.owner.name ? current.owner : backup.owner,
    clients: [...clients.values()], invoices: [...invoices.values()] };
  return validatedData(next, current);
}

export function createDataStore(sdk, db, uid) {
  if (!uid || uid.includes('/')) throw new Error('Inicia sesión para continuar.');
  const { doc, collection, getDocFromServer, getDocsFromServer, runTransaction } = sdk;
  const path = `accounts/${uid}`;
  const metaRef = doc(db, path);
  const clientRef = collection(db, path, 'clients');
  const invoiceRef = collection(db, path, 'invoices');
  const revision = snap => snap.exists() ? snap.data().revision : 0;
  async function load() {
    // All reads must come from the server. Recheck the revision to avoid a mixed snapshot.
    for (let attempt = 0; attempt < 4; attempt++) {
      const before = await getDocFromServer(metaRef);
      const [clients, invoices] = await Promise.all([getDocsFromServer(clientRef), getDocsFromServer(invoiceRef)]);
      const after = await getDocFromServer(metaRef);
      if (revision(before) !== revision(after)) continue;
      return { ...blankData(), ...(after.exists() ? after.data() : {}),
        clients: clients.docs.map(d => d.data()), invoices: invoices.docs.map(d => d.data()) };
    }
    throw new Error('Los datos están cambiando en otro dispositivo. Vuelve a actualizar.');
  }
  async function save(next, previous) {
    const clean = validatedData(next, previous);
    const writes = [];
    for (const kind of ['clients', 'invoices']) {
      const old = new Map(previous[kind].map(item => [item.id, item]));
      for (const item of clean[kind]) {
        if (!/^[A-Za-z0-9_-]{1,100}$/.test(item.id)) throw new Error('La copia contiene un identificador no válido.');
        if (!sameValue(old.get(item.id), item))
          writes.push([doc(db, path, kind, item.id), item]);
      }
      if (kind === 'clients' && previous.clients.some(c => !clean.clients.some(n => n.id === c.id)))
        throw new Error('La copia no puede eliminar clientes guardados.');
    }
    if (writes.length > 400) throw new Error('La copia contiene más de 400 registros nuevos. Es necesario dividir la importación; no se ha cambiado nada.');
    const { clients, invoices, draft, lastBackup, ...meta } = clean;
    await runTransaction(db, async transaction => {
      const current = await transaction.get(metaRef);
      if (revision(current) !== previous.revision)
        throw new Error('Hay cambios guardados desde otro dispositivo. Pulsa «Actualizar datos», revisa el formulario y vuelve a guardar.');
      transaction.set(metaRef, meta);
      for (const [ref, item] of writes) transaction.set(ref, item);
    });
    return clean;
  }
  return { load, save, metaRef };
}
