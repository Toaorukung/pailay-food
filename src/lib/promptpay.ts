import generatePayload from 'promptpay-qr';
import QRCode from 'qrcode';
import { env } from './env';

/**
 * PromptPay QR generation, server-side only.
 *
 * The amount is embedded in the payload rather than left for the guest to
 * type. That single detail is what makes manual slip verification workable:
 * staff compare one number against one number, instead of trusting that the
 * guest typed the right total.
 */

export function normalisePromptPayId(raw: string): string {
  return raw.replace(/[^0-9]/g, '');
}

export function isValidPromptPayId(raw: string): boolean {
  const id = normalisePromptPayId(raw);
  // Mobile number (10) or national/tax ID (13). e-Wallet ids (15) also exist.
  return id.length === 10 || id.length === 13 || id.length === 15;
}

export interface PromptPayQr {
  payload: string;
  dataUrl: string;
  amount: number;
}

export async function promptPayQr(amount: number): Promise<PromptPayQr> {
  const id = normalisePromptPayId(env.promptPayId);
  if (!isValidPromptPayId(id)) {
    throw new Error(
      'PROMPTPAY_ID is missing or malformed. Set a 10-digit phone number or 13-digit national/tax ID.',
    );
  }
  if (!(amount > 0)) {
    throw new Error('PromptPay amount must be greater than zero.');
  }

  const payload = generatePayload(id, { amount });
  const dataUrl = await QRCode.toDataURL(payload, {
    errorCorrectionLevel: 'M',
    margin: 1,
    width: 512,
    color: { dark: '#0f172a', light: '#ffffff' },
  });

  return { payload, dataUrl, amount };
}

/** Masks the receiving account for display: 08XXXXX678. */
export function maskPromptPayId(raw = env.promptPayId): string {
  const id = normalisePromptPayId(raw);
  if (id.length < 6) return '';
  return `${id.slice(0, 3)}${'X'.repeat(Math.max(0, id.length - 6))}${id.slice(-3)}`;
}
