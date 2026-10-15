const fs = require('fs');
const crypto = require('crypto');
const { gzipSync } = require('zlib');
const { timelockEncrypt, defaultChainInfo, roundTime, Buffer } = require('tlock-js');

async function seal(input, output, when) {
  const chapter = JSON.parse(fs.readFileSync(input, 'utf8'));
  const release = Date.parse(when);
  if (!(release > Date.now())) throw Error('Release must be in the future');
  const round = Math.ceil((release / 1000 - defaultChainInfo.genesis_time) / defaultChainInfo.period) + 1;
  const client = { chain: () => ({ info: async () => defaultChainInfo }) };
  const key = crypto.randomBytes(32);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const plaintext = fs.readFileSync(input);
  const ciphertext = Buffer.concat([cipher.update(gzipSync(plaintext)), cipher.final(), cipher.getAuthTag()]);
  const lockedKey = await timelockEncrypt(round, key, client);
  const payload = output + '/s03.bin';
  fs.mkdirSync(output, { recursive: true });
  fs.writeFileSync(payload, ciphertext);
  const metadata = {
    id: chapter.id, title: chapter.title, group: chapter.group,
    ready: false, questions: [], questionCount: chapter.questions.length,
    releaseAt: new Date(roundTime(defaultChainInfo, round)).toISOString(),
    sealed: { format: 'tlock-aes256gcm-gzip-v1', round, chainHash: defaultChainInfo.hash, iv: iv.toString('base64'),
      key: lockedKey, url: 'assets/exams/sealed/s03.bin', sha256: crypto.createHash('sha256').update(ciphertext).digest('hex') }
  };
  // Verify AES payload before discarding the key. No key or plaintext enters the site repository.
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(ciphertext.subarray(-16));
  const zipped = Buffer.concat([decipher.update(ciphertext.subarray(0,-16)), decipher.final()]);
  if (!require('zlib').gunzipSync(zipped).equals(plaintext)) throw Error('Round trip mismatch');
  fs.writeFileSync(output + '/metadata.json', JSON.stringify(metadata, null, 2) + '\n');
  key.fill(0);
  console.log(JSON.stringify({ questions: metadata.questionCount, releaseAt: metadata.releaseAt, round, bytes: ciphertext.length }));
}
seal(process.argv[2], process.argv[3], process.argv[4]).catch(e => { console.error(e); process.exitCode = 1; });
