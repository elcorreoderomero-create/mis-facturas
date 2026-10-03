# Mis facturas

Aplicación personal para clientes y facturas, con cálculo desde el total o la base imponible y descarga en PDF. Se adapta al teléfono, la tableta y el ordenador.

[Abrir Mis facturas](https://elcorreoderomero-create.github.io/mis-facturas/)

## Uso

1. Entrar con la misma cuenta de Google en todos los dispositivos.
2. Configurar los datos del emisor una vez, o importar el archivo privado de datos iniciales desde «Copia y ayuda».
3. Añadir los clientes y seleccionarlos al crear cada factura.
4. Introducir el total con IVA o la base imponible; el programa calcula los otros importes.
5. Guardar un borrador para revisarlo, emitir la factura cuando esté lista y descargar su PDF.

En iPhone o iPad, abrir el enlace en Safari y elegir Compartir → Añadir a pantalla de inicio.

## Documentos

Los borradores se pueden modificar, mover a la papelera y recuperar. Al emitir una factura se conserva su contenido. Las devoluciones completas o parciales generan una rectificativa de la serie R, vinculada a la original. Los PDF de borradores están identificados como documentos no emitidos.

## Datos privados

El programa público no contiene datos fiscales, bancarios, de clientes ni facturas. La información se guarda en Cloud Firestore y está protegida mediante el acceso con Google y reglas privadas por cuenta. El PDF se genera en el dispositivo. Los archivos privados y las copias JSON se importan desde la aplicación y nunca deben subirse a este repositorio.

Los cambios se sincronizan entre sesiones. Si hay cambios simultáneos, la aplicación pide actualizar antes de guardar. Hace falta conexión a internet para cargar y guardar; un formulario abierto se conserva si falla el guardado.

Desde «Copia y ayuda» se puede descargar una copia JSON. Cada importación admite hasta 400 registros nuevos o modificados y conserva los registros ya guardados.

## Alcance

Un concepto global y un tipo de IVA por factura, sin retención de IRPF. No realiza envíos a Hacienda.

Alojamiento: GitHub Pages. Datos y acceso: Firebase Spark. No activar servicios de pago para usar esta configuración.

PDF: pdf-lib, licencia MIT incluida en `LICENSE-pdf-lib.txt`.
