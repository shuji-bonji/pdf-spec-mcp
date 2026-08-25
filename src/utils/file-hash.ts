/**
 * File hashing for the on-disk index cache key (Issue #6).
 *
 * The cache is keyed on the PDF's *content*, not its path: the same specification placed
 * under a different PDF_SPEC_DIR must hit the same index, and a replaced file under the
 * same name must miss. SHA-256 over a 32 MB file is ~100 ms — negligible next to the
 * 6-second index build it stands in for — and the caller memoises it per path anyway.
 */

import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';

export interface FileDigest {
  sha256: string;
  size: number;
}

/**
 * Stream a file through SHA-256. Rejects when the file cannot be read; the caller decides
 * whether that is a cache miss (it is) or an error (it is not — the PDF itself is opened
 * separately, and *that* failure is the one to report).
 */
export async function sha256File(path: string): Promise<FileDigest> {
  const { size } = await stat(path);
  const hash = createHash('sha256');
  await new Promise<void>((resolve, reject) => {
    createReadStream(path)
      .on('data', (chunk) => hash.update(chunk))
      .on('error', reject)
      .on('end', resolve);
  });
  return { sha256: hash.digest('hex'), size };
}
