// Cada Excel se habilita solo tras su propia aceptación en vivo; Review es independiente.
const paymentExportReady = true;
const renditionExportReady = true;

export function isPaymentExportReady(): boolean {
  return paymentExportReady;
}

export function isRenditionExportReady(): boolean {
  return renditionExportReady;
}
