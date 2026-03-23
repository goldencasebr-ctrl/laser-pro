/**
 * Flood fill algorithm to remove white/light background
 */
export const removeWhiteBackground = (
  canvas: HTMLCanvasElement,
  tolerance: number
): void => {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return;

  const width = canvas.width;
  const height = canvas.height;
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;

  // Start flood fill from all four corners
  const stack: [number, number][] = [
    [0, 0],
    [width - 1, 0],
    [0, height - 1],
    [width - 1, height - 1]
  ];
  const visited = new Uint8Array(width * height);

  while (stack.length > 0) {
    const [x, y] = stack.pop()!;
    if (x < 0 || x >= width || y < 0 || y >= height) continue;
    
    const vIdx = y * width + x;
    if (visited[vIdx]) continue;
    visited[vIdx] = 1;

    const idx = vIdx * 4;
    const r = data[idx];
    const g = data[idx + 1];
    const b = data[idx + 2];
    
    // Average brightness
    const brightness = (r + g + b) / 3;

    if (brightness >= tolerance) {
      data[idx + 3] = 0; // Set alpha to 0

      stack.push([x + 1, y]);
      stack.push([x - 1, y]);
      stack.push([x, y + 1]);
      stack.push([x, y - 1]);
    }
  }

  ctx.putImageData(imageData, 0, 0);
};

/**
 * Cleans background from an image by making pixels near (0,0) transparent
 */
export const cleanBackground = async (
  imageBase64: string,
  tolerance: number = 240
): Promise<string> => {
  const img = await loadImage(imageBase64);
  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return imageBase64;

  ctx.drawImage(img, 0, 0);
  removeWhiteBackground(canvas, tolerance);
  return canvas.toDataURL('image/png');
};

export const loadImage = (src: string): Promise<HTMLImageElement> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
};
