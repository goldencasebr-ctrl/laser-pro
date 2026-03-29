declare module '@netlify/edge-functions' {
  export interface Config {
    path?: string;
    cache?: 'manual' | 'off';
  }
}

declare const Deno: {
  env: {
    get(key: string): string | undefined;
  };
};

declare module 'imagetracerjs' {
  type ImageTracerApi = {
    imagedataToSVG(imageData: ImageData, options?: Record<string, unknown>): string;
  };

  const ImageTracer: ImageTracerApi & {
    default?: ImageTracerApi;
  };

  export default ImageTracer;
}
