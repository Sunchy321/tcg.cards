function concatBytes(a: Uint8Array<ArrayBufferLike>, b: Uint8Array<ArrayBufferLike>): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(a.length + b.length);
  out.set(a);
  out.set(b, a.length);
  return out;
}

function readTarString(bytes: Uint8Array<ArrayBufferLike>, offset: number, length: number): string {
  const end = bytes.indexOf(0, offset);
  const slice = bytes.subarray(offset, end === -1 ? offset + length : end);
  return new TextDecoder().decode(slice);
}

function readTarOctal(bytes: Uint8Array<ArrayBufferLike>, offset: number, length: number): number {
  return Number.parseInt(readTarString(bytes, offset, length).trim(), 8) || 0;
}

/**
 * Stream JSONL from one entry inside a `.tar.gz` archive, yielding parsed objects.
 * The gzip stream is decompressed in Bun and the tar structure is walked in
 * 512-byte blocks, so the whole archive is never buffered in memory.
 */
export async function* readTarGzJsonl(
  archive: string,
  entryName: string,
): AsyncGenerator<Record<string, unknown>> {
  const stream = Bun.file(archive).stream().pipeThrough(new DecompressionStream('gzip'));
  const reader = stream.getReader();

  let buffer = new Uint8Array(0);

  const readExact = async (n: number): Promise<Uint8Array | null> => {
    while (buffer.length < n) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer = concatBytes(buffer, value!);
    }
    if (buffer.length < n) return null;
    const out = buffer.slice(0, n);
    buffer = buffer.slice(n);
    return out;
  };

  while (true) {
    const header = await readExact(512);
    if (header == null || header.every(byte => byte === 0)) break;

    const rawName = readTarString(header, 0, 100);
    const name = rawName.replace(/^\.\//, '');
    const size = readTarOctal(header, 124, 12);

    if (name === entryName) {
      const decoder = new TextDecoder();
      let text = '';
      let remaining = size;

      while (remaining > 0) {
        const block = await readExact(512);
        if (block == null) break;
        const take = Math.min(remaining, 512);
        text += decoder.decode(block.subarray(0, take), { stream: true });
        remaining -= take;

        let idx;
        while ((idx = text.indexOf('\n')) !== -1) {
          const line = text.slice(0, idx);
          text = text.slice(idx + 1);
          if (line.length === 0) continue;
          try {
            yield JSON.parse(line);
          } catch {
            // Skip malformed lines.
          }
        }
      }

      if (text.trim().length > 0) {
        try {
          yield JSON.parse(text);
        } catch {
          // Skip a trailing line without a newline.
        }
      }
      return;
    }

    // Skip a non-target entry, discarding its data in small chunks.
    let toSkip = Math.ceil(size / 512) * 512;
    while (toSkip > 0) {
      const chunk = await readExact(Math.min(512, toSkip));
      if (chunk == null) break;
      toSkip -= chunk.length;
    }
  }
}

/**
 * Counts JSONL lines inside the given entries with a single pass over the
 * archive. Each line corresponds to one importable row, so the counts can drive
 * bounded progress per file before the import runs.
 */
export async function countTarGzEntryLines(
  archive: string,
  entries: string[],
): Promise<Record<string, number>> {
  const stream = Bun.file(archive).stream().pipeThrough(new DecompressionStream('gzip'));
  const reader = stream.getReader();
  const wanted = new Set(entries);

  let buffer = new Uint8Array(0);

  const readExact = async (n: number): Promise<Uint8Array | null> => {
    while (buffer.length < n) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer = concatBytes(buffer, value!);
    }
    if (buffer.length < n) return null;
    const out = buffer.slice(0, n);
    buffer = buffer.slice(n);
    return out;
  };

  const counts: Record<string, number> = {};

  while (true) {
    const header = await readExact(512);
    if (header == null || header.every(byte => byte === 0)) break;

    const name = readTarString(header, 0, 100).replace(/^\.\//, '');
    const size = readTarOctal(header, 124, 12);

    if (wanted.has(name)) {
      let lines = 0;
      let trailing = '';
      let remaining = size;
      const decoder = new TextDecoder();
      while (remaining > 0) {
        const block = await readExact(512);
        if (block == null) break;
        const take = Math.min(remaining, 512);
        const chunk = decoder.decode(block.subarray(0, take), { stream: true });
        remaining -= take;
        const text = trailing + chunk;
        lines += text.split('\n').length - 1;
        trailing = text.slice(text.lastIndexOf('\n') + 1);
      }
      counts[name] = lines + (trailing.length > 0 ? 1 : 0);
    } else {
      let toSkip = Math.ceil(size / 512) * 512;
      while (toSkip > 0) {
        const chunk = await readExact(Math.min(512, toSkip));
        if (chunk == null) break;
        toSkip -= chunk.length;
      }
    }
  }

  return counts;
}
