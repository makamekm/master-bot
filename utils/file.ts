import { resolve } from 'path';
import { createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';

import type { FileFn } from "../drivers/bot";

export async function saveFile(file: FileFn) {
    const response = await fetch(file.url);
    const filePath = `./uploads/${file.filename}`;
    const fileName = resolve(filePath);
    const fileStream = createWriteStream(fileName);
    await pipeline(response.body as any, fileStream);
    return filePath;
}
