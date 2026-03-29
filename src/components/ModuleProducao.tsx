import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Layout,
  Upload,
  Download,
  ZoomIn,
  RotateCw,
  RefreshCcw,
  Loader2,
  AlertCircle,
  History,
  FileCode,
  Settings2,
  Layers,
} from 'lucide-react';
import { motion } from 'motion/react';
// @ts-ignore
import ImageTracer from 'imagetracerjs';
import { removeWhiteBackground, loadImage } from '../utils/imageUtils';
import { validateImageFile } from '../utils/fileValidation';
import { useCanvasTransform } from '../hooks/useCanvasTransform';

interface Product {
  id: string;
  name: string;
  type: 'round' | 'rect';
  size: number | [number, number];
}

const PRODUCTS: Product[] = [
  { id: 'r15',      name: 'Redondo 15mm',       type: 'round', size: 15 },
  { id: 'r20',      name: 'Redondo 20mm',       type: 'round', size: 20 },
  { id: 'r25',      name: 'Redondo 25mm',       type: 'round', size: 25 },
  { id: 'r30',      name: 'Redondo 30mm',       type: 'round', size: 30 },
  { id: 'rect2135', name: 'Retangular 21x35mm', type: 'rect',  size: [21, 35] },
];

// ── Pure helper: raster canvas → SVG silhouette string ──────────────────────
function buildSilhouetteSvg(canvas: HTMLCanvasElement): string {
  const ctx  = canvas.getContext('2d')!;
  const outW = canvas.width;
  const outH = canvas.height;
  const outData = ctx.getImageData(0, 0, outW, outH);
  const d = outData.data;

  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] > 10) {
      d[i] = 0; d[i + 1] = 0; d[i + 2] = 0; d[i + 3] = 255;
    } else {
      d[i] = 255; d[i + 1] = 255; d[i + 2] = 255; d[i + 3] = 255;
    }
  }

  // @ts-ignore
  const tracer = ImageTracer.default || ImageTracer;
  return tracer.imagedataToSVG(outData, {
    colorsampling: 0, numberofcolors: 2, strokewidth: 0, pathomit: 8,
  }) as string;
}

// Inject physical mm dimensions into SVG string for print-ready download
function injectMmDimensions(svgStr: string, product: Product): string {
  const w = Array.isArray(product.size) ? product.size[0] : product.size;
  const h = Array.isArray(product.size) ? product.size[1] : product.size;
  return svgStr
    .replace(/width="[^"]*"/, `width="${w}mm"`)
    .replace(/height="[^"]*"/, `height="${h}mm"`);
}

export default function ModuleProducao() {
  const [file, setFile]                       = useState<File | null>(null);
  const [img, setImg]                         = useState<HTMLImageElement | null>(null);
  const [processedImg, setProcessedImg]       = useState<HTMLImageElement | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<Product>(PRODUCTS[1]);
  const [tolerance, setTolerance]             = useState(200);
  const [loading, setLoading]                 = useState(false);
  const [error, setError]                     = useState<string | null>(null);
  const [isDragOver, setIsDragOver]           = useState(false);
  const [canvasSize, setCanvasSize]           = useState(400);

  // ── Matriz / silhouette state ────────────────────────────────────────────
  const [matrizGenerated, setMatrizGenerated] = useState(false);
  const [silhouetteUrl, setSilhouetteUrl]     = useState<string | null>(null);
  const [silhouetteLoading, setSilhouetteLoading] = useState(false);

  const canvasRef           = useRef<HTMLCanvasElement>(null);
  const containerRef        = useRef<HTMLDivElement>(null);
  const inputRef            = useRef<HTMLInputElement>(null);
  const toleranceTimer      = useRef<ReturnType<typeof setTimeout> | null>(null);
  const silhouetteTimer     = useRef<ReturnType<typeof setTimeout> | null>(null);
  const svgUrlRef           = useRef<string | null>(null);
  const svgStrRef           = useRef<string | null>(null);
  const matrizGeneratedRef  = useRef(false);

  const {
    offsetX, offsetY,
    zoom, setZoom,
    rotation, setRotation,
    handleMouseDown, handleMouseMove, handleMouseUp, handleWheel,
    reset: resetTransform,
  } = useCanvasTransform();

  // Keep ref in sync so ResizeObserver callback always reads current value
  useEffect(() => {
    matrizGeneratedRef.current = matrizGenerated;
  }, [matrizGenerated]);

  // ── Responsive canvas via ResizeObserver ───────────────────────────────────
  const recalcCanvasSize = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    // When showing two panels side by side, each panel gets roughly half the width
    const columns  = matrizGeneratedRef.current ? 2 : 1;
    const availW   = width / columns - (columns > 1 ? 32 : 0); // 32px gap
    const size     = Math.max(Math.min(Math.floor(Math.min(availW, height) * 0.88), 900), 260);
    setCanvasSize(size);
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(recalcCanvasSize);
    ro.observe(el);
    recalcCanvasSize();
    return () => ro.disconnect();
  }, [recalcCanvasSize]);

  // Re-calc when layout changes between 1-column and 2-column
  useEffect(() => {
    recalcCanvasSize();
  }, [matrizGenerated, recalcCanvasSize]);

  // ── Upload / drag-and-drop ─────────────────────────────────────────────────
  const handleFileAccepted = async (f: File) => {
    const validationError = validateImageFile(f);
    if (validationError) { setError(validationError); return; }
    setError(null);
    setFile(f);
    resetTransform();
    // Clear previous silhouette when a new image is loaded
    setMatrizGenerated(false);
    setSilhouetteUrl(null);
    if (svgUrlRef.current) { URL.revokeObjectURL(svgUrlRef.current); svgUrlRef.current = null; }
    const objectUrl = URL.createObjectURL(f);
    try {
      const loaded = await loadImage(objectUrl);
      setImg(loaded);
      processImage(loaded, tolerance);
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  };

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) handleFileAccepted(f);
  };

  const handleDragOver  = (e: React.DragEvent) => e.preventDefault();
  const handleDragEnter = (e: React.DragEvent) => { e.preventDefault(); setIsDragOver(true); };
  const handleDragLeave = (e: React.DragEvent) => { e.preventDefault(); setIsDragOver(false); };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFileAccepted(f);
  };

  // ── Image processing ───────────────────────────────────────────────────────
  const processImage = useCallback(async (baseImg: HTMLImageElement, tol: number) => {
    setLoading(true);
    const offCanvas = document.createElement('canvas');
    offCanvas.width  = baseImg.width;
    offCanvas.height = baseImg.height;
    const ctx = offCanvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(baseImg, 0, 0);
    removeWhiteBackground(offCanvas, tol);
    const processed = await loadImage(offCanvas.toDataURL());
    setProcessedImg(processed);
    setLoading(false);
  }, []);

  // Debounced tolerance: waits 180ms after last slider move
  useEffect(() => {
    if (!img) return;
    if (toleranceTimer.current) clearTimeout(toleranceTimer.current);
    toleranceTimer.current = setTimeout(() => {
      processImage(img, tolerance);
    }, 180);
    return () => {
      if (toleranceTimer.current) clearTimeout(toleranceTimer.current);
    };
  }, [tolerance, img, processImage]);

  // ── Canvas render (HiDPI-aware) ────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !processedImg) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width  = canvasSize * dpr;
    canvas.height = canvasSize * dpr;
    canvas.style.width  = `${canvasSize}px`;
    canvas.style.height = `${canvasSize}px`;
    ctx.scale(dpr, dpr);

    const W = canvasSize;
    const H = canvasSize;
    ctx.clearRect(0, 0, W, H);

    const previewRadius = W * 0.30;
    const previewRectW  = W * 0.375;
    const previewRectH  = previewRectW * (35 / 21);

    const baseScale = Math.min(W / processedImg.width, H / processedImg.height) * 0.8;

    ctx.save();
    ctx.beginPath();
    if (selectedProduct.type === 'round') {
      ctx.arc(W / 2, H / 2, previewRadius, 0, Math.PI * 2);
    } else {
      ctx.rect(W / 2 - previewRectW / 2, H / 2 - previewRectH / 2, previewRectW, previewRectH);
    }
    ctx.closePath();
    ctx.clip();

    ctx.save();
    ctx.translate(W / 2 + offsetX, H / 2 + offsetY);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.scale(baseScale * zoom, baseScale * zoom);
    ctx.drawImage(processedImg, -processedImg.width / 2, -processedImg.height / 2);
    ctx.restore();
    ctx.restore();

    ctx.save();
    ctx.strokeStyle = '#10b981';
    ctx.lineWidth   = 1.5;
    ctx.setLineDash([5, 5]);
    if (selectedProduct.type === 'round') {
      ctx.beginPath();
      ctx.arc(W / 2, H / 2, previewRadius, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      ctx.strokeRect(W / 2 - previewRectW / 2, H / 2 - previewRectH / 2, previewRectW, previewRectH);
    }
    ctx.restore();
  }, [processedImg, offsetX, offsetY, zoom, rotation, selectedProduct, canvasSize]);

  // ── Final export canvas ────────────────────────────────────────────────────
  const getFinalCanvas = (): HTMLCanvasElement | null => {
    if (!processedImg) return null;

    const maxDim = Math.max(processedImg.width, processedImg.height);
    const outCanvas = document.createElement('canvas');

    let outW: number, outH: number;
    if (selectedProduct.type === 'round') {
      outW = outH = maxDim;
    } else {
      outH = maxDim;
      outW = maxDim * (21 / 35);
    }

    outCanvas.width  = outW;
    outCanvas.height = outH;
    const ctx = outCanvas.getContext('2d');
    if (!ctx) return null;

    const previewRadius = canvasSize * 0.30;
    const previewRectW  = canvasSize * 0.375;
    const outScale  = outW / (selectedProduct.type === 'round' ? previewRadius * 2 : previewRectW);
    const baseScale = Math.min(canvasSize / processedImg.width, canvasSize / processedImg.height) * 0.8;

    ctx.save();
    ctx.translate(outW / 2 + offsetX * outScale, outH / 2 + offsetY * outScale);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.scale(baseScale * zoom * outScale, baseScale * zoom * outScale);
    ctx.drawImage(processedImg, -processedImg.width / 2, -processedImg.height / 2);
    ctx.restore();

    const clipCanvas = document.createElement('canvas');
    clipCanvas.width  = outW;
    clipCanvas.height = outH;
    const clipCtx = clipCanvas.getContext('2d')!;
    if (selectedProduct.type === 'round') {
      clipCtx.beginPath();
      clipCtx.arc(outW / 2, outH / 2, outW / 2, 0, Math.PI * 2);
      clipCtx.fill();
    } else {
      clipCtx.fillRect(0, 0, outW, outH);
    }

    ctx.globalCompositeOperation = 'destination-in';
    ctx.drawImage(clipCanvas, 0, 0);

    return outCanvas;
  };

  // ── Silhouette generation ──────────────────────────────────────────────────
  const applySilhouette = useCallback(() => {
    const canvas = getFinalCanvas();
    if (!canvas) return;
    setSilhouetteLoading(true);
    // Yield to browser before the heavy tracer call so loading state renders
    setTimeout(() => {
      try {
        const svgStr = buildSilhouetteSvg(canvas);
        svgStrRef.current = svgStr; // store raw for download
        if (svgUrlRef.current) URL.revokeObjectURL(svgUrlRef.current);
        const blob = new Blob([svgStr], { type: 'image/svg+xml' });
        const url  = URL.createObjectURL(blob);
        svgUrlRef.current = url;
        setSilhouetteUrl(url);
      } finally {
        setSilhouetteLoading(false);
      }
    }, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [processedImg, offsetX, offsetY, zoom, rotation, selectedProduct, canvasSize]);

  // Handle "Gerar Matriz" button
  const handleGerarMatriz = () => {
    setMatrizGenerated(true);
    applySilhouette();
  };

  // Reactively regenerate silhouette (debounced) when transforms or tolerance change
  useEffect(() => {
    if (!matrizGenerated || !processedImg) return;
    if (silhouetteTimer.current) clearTimeout(silhouetteTimer.current);
    silhouetteTimer.current = setTimeout(() => {
      applySilhouette();
    }, 250);
    return () => { if (silhouetteTimer.current) clearTimeout(silhouetteTimer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offsetX, offsetY, zoom, rotation, selectedProduct, processedImg, canvasSize]);

  // Cleanup blob URL on unmount
  useEffect(() => {
    return () => { if (svgUrlRef.current) URL.revokeObjectURL(svgUrlRef.current); };
  }, []);

  // ── Downloads ──────────────────────────────────────────────────────────────
  const downloadPNG = () => {
    setLoading(true);
    try {
      const canvas = getFinalCanvas();
      if (!canvas) return;
      const link = document.createElement('a');
      link.href     = canvas.toDataURL('image/png');
      link.download = `arte_${selectedProduct.name}.png`;
      link.click();
    } catch (err) {
      console.error('Erro ao baixar PNG:', err);
    } finally {
      setLoading(false);
    }
  };

  const downloadSVG = () => {
    if (!svgStrRef.current) return;
    // Inject physical mm dimensions for print-ready SVG
    const printSvg = injectMmDimensions(svgStrRef.current, selectedProduct);
    const blob = new Blob([printSvg], { type: 'image/svg+xml' });
    const url  = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href     = url;
    link.download = `silhueta_${selectedProduct.name}.svg`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 100);
  };

  const handleReset = () => {
    setFile(null);
    setImg(null);
    setProcessedImg(null);
    setError(null);
    setMatrizGenerated(false);
    setSilhouetteUrl(null);
    if (svgUrlRef.current) { URL.revokeObjectURL(svgUrlRef.current); svgUrlRef.current = null; }
    svgStrRef.current = null;
    resetTransform();
    if (inputRef.current) inputRef.current.value = '';
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 1.05 }}
      className="flex-1 flex overflow-hidden"
    >
      {/* ── Left: Controls ── */}
      <div className="w-80 border-r border-white/5 bg-[#111111] p-6 flex flex-col gap-6 overflow-y-auto">
        <div className="flex items-center gap-2 text-zinc-400 font-bold text-xs uppercase tracking-widest">
          <Settings2 size={16} /> <Layout size={16} /> Produção
        </div>

        {!img ? (
          <div
            onDragOver={handleDragOver}
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center text-center transition-colors cursor-pointer relative
              ${isDragOver
                ? 'border-emerald-500/60 bg-emerald-500/5'
                : 'border-white/10 bg-white/[0.02] hover:bg-white/[0.04]'
              }`}
          >
            <input
              ref={inputRef}
              type="file"
              accept=".png,.jpg,.jpeg,.webp"
              onChange={handleUpload}
              className="absolute inset-0 opacity-0 cursor-pointer"
            />
            <Upload className={`mb-2 transition-colors ${isDragOver ? 'text-emerald-400' : 'text-zinc-600'}`} />
            <p className="text-xs font-medium text-zinc-400">
              {isDragOver ? 'Solte a imagem aqui' : 'Carregar Matriz B&W'}
            </p>
            <p className="text-[10px] text-zinc-600 mt-1">PNG, JPG ou WEBP · Máx. 10 MB</p>
            {error && (
              <div className="mt-3 flex items-center gap-2 text-red-400 text-xs">
                <AlertCircle size={14} /> {error}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-6">
            <button
              onClick={handleReset}
              className="text-xs font-medium text-zinc-500 hover:text-zinc-300 flex items-center gap-1"
            >
              <RefreshCcw size={14} /> Novo Upload
            </button>

            <div className="space-y-2">
              <label className="text-xs font-medium text-zinc-500">Produto</label>
              <select
                value={selectedProduct.id}
                onChange={e => setSelectedProduct(PRODUCTS.find(p => p.id === e.target.value)!)}
                className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none"
              >
                {PRODUCTS.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between">
                <label className="text-xs font-medium text-zinc-500">Tolerância de Branco</label>
                <span className="text-xs font-mono text-emerald-400">{tolerance}</span>
              </div>
              <input
                type="range" min="150" max="254" value={tolerance}
                onChange={e => setTolerance(parseInt(e.target.value))}
                className="w-full accent-emerald-500"
              />
            </div>

            <div className="h-px bg-white/5" />

            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <label className="text-xs font-medium text-zinc-500">Zoom</label>
                <span className="text-xs font-mono text-zinc-400">{Math.round(zoom * 100)}%</span>
              </div>
              <input
                type="range" min="0.1" max="5" step="0.1" value={zoom}
                onChange={e => setZoom(parseFloat(e.target.value))}
                className="w-full accent-zinc-500"
              />

              <div className="flex justify-between items-center">
                <label className="text-xs font-medium text-zinc-500">Rotação</label>
                <span className="text-xs font-mono text-zinc-400">{rotation}°</span>
              </div>
              <input
                type="range" min="-180" max="180" value={rotation}
                onChange={e => setRotation(parseInt(e.target.value))}
                className="w-full accent-zinc-500"
              />

              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setRotation(r => (r + 90) % 360)}
                  className="bg-white/5 hover:bg-white/10 p-2 rounded-lg text-xs font-bold flex items-center justify-center gap-2 border border-white/10"
                >
                  <RotateCw size={14} /> +90°
                </button>
                <button
                  onClick={resetTransform}
                  className="bg-white/5 hover:bg-white/10 p-2 rounded-lg text-xs font-bold flex items-center justify-center gap-2 border border-white/10"
                >
                  <RefreshCcw size={14} /> Reset
                </button>
              </div>
            </div>

            <div className="h-px bg-white/5" />

            {/* Gerar Matriz button — always visible once image is loaded */}
            <button
              onClick={handleGerarMatriz}
              disabled={loading || silhouetteLoading}
              className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:bg-emerald-600/50 text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-500/10"
            >
              {silhouetteLoading
                ? <Loader2 className="animate-spin" size={20} />
                : <Layers size={20} />
              }
              Gerar Matriz
            </button>

            {/* Download buttons — only visible after "Gerar Matriz" */}
            {matrizGenerated && (
              <div className="space-y-3">
                <button
                  onClick={downloadPNG}
                  disabled={loading || silhouetteLoading}
                  className="w-full bg-zinc-800 hover:bg-zinc-700 disabled:bg-zinc-800/50 text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2 transition-all border border-white/10"
                >
                  {loading ? <Loader2 className="animate-spin" size={20} /> : <Download size={20} />}
                  Baixar PNG
                </button>

                <button
                  onClick={downloadSVG}
                  disabled={loading || silhouetteLoading || !silhouetteUrl}
                  className="w-full bg-zinc-800 hover:bg-zinc-700 disabled:bg-zinc-800/50 text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2 transition-all border border-white/10"
                >
                  {loading ? <Loader2 className="animate-spin" size={20} /> : <FileCode size={20} />}
                  Baixar SVG
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Center: Canvas(es) ── */}
      <div
        ref={containerRef}
        className="flex-1 bg-black relative flex items-center justify-center overflow-hidden"
      >
        {/* Top label */}
        <div className="absolute top-4 right-4 z-10">
          <div className="bg-black/50 backdrop-blur-md p-2 rounded-lg border border-white/10 text-[10px] text-zinc-500 uppercase tracking-widest font-bold">
            Preview Interativo
          </div>
        </div>

        <div className={`flex items-center justify-center ${matrizGenerated ? 'gap-6' : ''}`}>
          {/* Product preview canvas */}
          <div className="flex flex-col items-center gap-2">
            {matrizGenerated && (
              <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">
                Imagem no Produto
              </span>
            )}
            <canvas
              ref={canvasRef}
              style={{ width: canvasSize, height: canvasSize, cursor: 'move' }}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
              onWheel={handleWheel}
              className="shadow-2xl rounded-lg border border-white/5 bg-zinc-900"
            />
          </div>

          {/* Silhouette SVG preview */}
          {matrizGenerated && (
            <div className="flex flex-col items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">
                Silhueta SVG
              </span>
              <div
                style={{ width: canvasSize, height: canvasSize }}
                className="shadow-2xl rounded-lg border border-white/5 bg-white flex items-center justify-center overflow-hidden relative"
              >
                {silhouetteLoading ? (
                  <Loader2 className="animate-spin text-zinc-400" size={32} />
                ) : silhouetteUrl ? (
                  <img
                    src={silhouetteUrl}
                    alt="Silhueta SVG"
                    style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                  />
                ) : null}
              </div>
            </div>
          )}
        </div>

        {loading && (
          <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
            <Loader2 className="animate-spin text-emerald-400" size={40} />
          </div>
        )}

        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-black/50 backdrop-blur-md px-4 py-2 rounded-full border border-white/10 flex items-center gap-4 text-xs text-zinc-400">
          <div className="flex items-center gap-1">
            <History size={14} /> Arraste para Pan
          </div>
          <div className="w-px h-3 bg-white/10" />
          <div className="flex items-center gap-1">
            <ZoomIn size={14} /> Scroll para Zoom
          </div>
        </div>
      </div>
    </motion.div>
  );
}
