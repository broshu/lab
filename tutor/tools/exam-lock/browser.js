import { timelockDecrypt, defaultChainInfo } from 'tlock-js';

// drand signatures are public time beacons. Neither relay receives exam data.
const relays = ['https://api.drand.sh', 'https://api2.drand.sh', 'https://api3.drand.sh'];
const decode = (value) => Uint8Array.from(atob(value), c => c.charCodeAt(0));

async function beacon(round) {
  return Promise.any(relays.map(async base => {
    const res = await fetch(`${base}/${defaultChainInfo.hash}/public/${round}`, { signal: AbortSignal.timeout(10000), cache: 'no-store' });
    if (!res.ok) throw Error(`Beacon unavailable: ${res.status}`);
    const value = await res.json();
    if (value.round !== round) throw Error('Wrong beacon round');
    return value;
  }));
}

export async function unlock(chapter) {
  const meta = chapter.sealed;
  if (meta.format !== 'tlock-aes256gcm-gzip-v1' || meta.chainHash !== defaultChainInfo.hash) throw Error('Unknown exam lock');
  const client = {
    options: { disableBeaconVerification: false, noCache: true },
    chain: () => ({ info: async () => defaultChainInfo }),
    get: beacon
  };
  const keyBytes = await timelockDecrypt(meta.key, client);
  const response = await fetch(meta.url, { signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw Error('Exam download failed');
  const ciphertext = await response.arrayBuffer();
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', ciphertext)), x => x.toString(16).padStart(2, '0')).join('');
  if (hash !== meta.sha256) throw Error('Exam integrity mismatch');
  const key = await crypto.subtle.importKey('raw', new Uint8Array(keyBytes), 'AES-GCM', false, ['decrypt']);
  const zipped = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: decode(meta.iv) }, key, ciphertext);
  keyBytes.fill(0);
  const stream = new Blob([zipped]).stream().pipeThrough(new DecompressionStream('gzip'));
  const result = await new Response(stream).json();
  if (result.id !== chapter.id || result.questions.length !== chapter.questionCount) throw Error('Exam content mismatch');
  return result;
}
