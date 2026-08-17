import { addTabs, listTabs } from './client';

/**
 * Structural spreadsheet edits (deleting rows, creating tabs) go through the
 * spreadsheets.batchUpdate endpoint rather than the values endpoints. Kept in
 * its own module so the hot-path client stays small — this code runs during
 * admin edits and the seed script only.
 */

import { JWT } from 'google-auth-library';
import { env, serviceAccount } from '../env';

const API = 'https://sheets.googleapis.com/v4/spreadsheets';

let jwtClient: JWT | null = null;

async function token(): Promise<string> {
  if (!jwtClient) {
    const sa = serviceAccount();
    jwtClient = new JWT({
      email: sa.client_email,
      key: sa.private_key,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
  }
  const res = await jwtClient.getAccessToken();
  if (!res.token) throw new Error('Google returned no access token.');
  return res.token;
}

export interface SheetRequest {
  [key: string]: unknown;
}

export async function batchUpdateSpreadsheet(
  requests: SheetRequest[],
): Promise<void> {
  if (requests.length === 0) return;
  const res = await fetch(`${API}/${env.googleSheetId}:batchUpdate`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${await token()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ requests }),
    cache: 'no-store',
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Sheets batchUpdate ${res.status}: ${body}`);
  }
}

export { addTabs, listTabs };
