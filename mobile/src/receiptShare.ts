/**
 * Creates a PDF receipt for an order and opens the system share sheet (WhatsApp, Mail, Files, AirDrop...).
 * The native modules are loaded on demand so the app starts as fast as before and the web preview never imports them.
 */
import { Platform } from 'react-native';
import { buildReceiptHtml, receiptNumber, type ReceiptInput } from './receipt';

const A4 = { width: 595, height: 842 };

export async function shareReceiptPdf(input: ReceiptInput): Promise<void> {
  const html = buildReceiptHtml(input);
  const Print = await import('expo-print');
  if (Platform.OS === 'web') {
    await Print.printAsync({ html }); // browsers: the print dialog offers "Save as PDF"
    return;
  }
  const { uri } = await Print.printToFileAsync({ html, ...A4 });
  // Give the file a readable name: it is what the buyer sees in WhatsApp, Mail or Files.
  let shareUri = uri;
  try {
    const { File, Paths } = await import('expo-file-system');
    const target = new File(Paths.cache, `Sokoni-Hub-Receipt-${receiptNumber(input.order).replace(/[^A-Za-z0-9-]/g, '')}.pdf`);
    if (target.exists) target.delete();
    new File(uri).move(target);
    shareUri = target.uri;
  } catch {
    // Keep the generated file name rather than failing the share.
  }
  const Sharing = await import('expo-sharing');
  if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing is not available on this device.');
  await Sharing.shareAsync(shareUri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: `Receipt ${receiptNumber(input.order)}` });
}
