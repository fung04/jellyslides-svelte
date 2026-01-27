
import { decode } from 'blurhash';

export function applyBlurhash(blurhash: string, canvasInfo: HTMLCanvasElement): void {
    if (!blurhash) return;

    const pixels = decode(blurhash, 32, 32);
    const ctx = canvasInfo.getContext('2d');
    if (!ctx) return;

    const imageData = ctx.createImageData(32, 32);
    imageData.data.set(pixels);
    ctx.putImageData(imageData, 0, 0);
}

export function getDataUrlFromBlurhash(blurhash: string): string {
    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    applyBlurhash(blurhash, canvas);
    return canvas.toDataURL();
}
