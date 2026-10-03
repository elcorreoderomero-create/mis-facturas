# Mis facturas

Aplicación personal para clientes y facturas, con cálculo desde el total o la base imponible y descarga en PDF. Interfaz adaptable al teléfono, tableta y ordenador.

El programa público no contiene datos de clientes, facturas, datos fiscales ni bancarios. La información se almacena en Cloud Firestore, protegida por Firebase Authentication y reglas por cuenta. El PDF se genera en el dispositivo.

## Estado

La conexión con Firebase está pendiente de completar. `firebase-config.js` permanece vacío y la aplicación no permite guardar hasta configurarlo. Publicar estos archivos no activa por sí solo la sincronización.

## Despliegue

1. Configurar un proyecto Firebase en el plan gratuito Spark, con acceso mediante Google.
2. Crear Firestore y publicar las reglas privadas preparadas con este proyecto.
3. Completar los identificadores web públicos en `firebase-config.js`. No usar claves de administrador.
4. Autorizar en Firebase el dominio donde se publique la aplicación.
5. Activar GitHub Pages desde la rama principal y la carpeta raíz.

Los datos iniciales y las copias JSON se importan desde la aplicación después de iniciar sesión. No deben subirse al repositorio.

La aplicación requiere conexión para guardar y cargar. Un concepto global y un tipo de IVA por factura, sin retención de IRPF. No envía datos a Hacienda.

PDF: pdf-lib, licencia MIT incluida en `LICENSE-pdf-lib.txt`.
