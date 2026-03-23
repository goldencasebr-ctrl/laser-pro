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
  size: number | [number, number]; // mm
}

const PRODUCTS: Product[] = [
  { id: 'r15', name: 'Redondo 15mm', type: 'round', size: 15 },
  { id: 'r20', name: 'Redondo 20mm', type: 'round', size: 20 },
  { id: 'r25', name: 'Redondo 25mm', type: 'round', size: 25 },
  { id: 'r30', name: 'Redondo 30mm', type: 'round', size: 30 },
  { id: 'rect2135', name: 'Retangular 21x35mm', type: 'rect', size: [21, 35] },
];

export default function ModuleProducao() {
  const [file, setFile] = useState<File | null>(null);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [processedImg, setProcessedImg] = useState<HTMLImageElement | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<Product>(PRODUCTS[1]); // 20mm
  const [tolerance, setTolerance] = useState(200);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const {
    offsetX, offsetY,
    zoom, setZoom,
    rotation, setRotation,
    handleMouseDown, handleMouseMove, handleMouseUp, handleWheel,
    reset: resetTransform,
  } = useCanvasTransform();

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const validationError = validateImageFile(f);
    if (validationError) {
      setError(validationError);
      return;
    }
    setError(null);
    setFile(f);
    resetTransform();

    const objectUrl = URL.createObjectURL(f);
    try {
      const loaded = await loadImage(objectUrl);
      setImg(loaded);
      processImage(loaded, tolerance);
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  };

  const processImage = useCallback(async (baseImg: HTMLImageElement, tol: number) => {
    setLoading(true);
    const offCanvas = document.createElement('canvas');
    offCanvas.width = baseImg.width;
    offCanvas.height = baseImg.height;
    const ctx = offCanvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(baseImg, 0, 0);
    removeWhiteBackground(offCanvas, tol);
    const processed = await loadImage(offCanvas.toDataURL());
    setProcessedImg(processed);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (img) processImage(img, tolerance);
  }, [tolerance, img, processImage]);

  // Render preview on canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !processedImg) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    const baseScale = Math.min(W / processedImg.width, H / processedImg.height) * 0.8;

    ctx.save();
    ctx.beginPath();
    if (selectedProduct.type === 'round') {
      ctx.arc(W / 2, H / 2, 120, 0, Math.PI * 2);
    } else {
      const rw = 150;
      const rh = rw * (35 / 21);
      ctx.rect(W / 2 - rw / 2, H / 2 - rh / 2, rw, rh);
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

    // Stroke outline
    ctx.save();
    ctx.strokeStyle = '#10b981';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);
    if (selectedProduct.type === 'round') {
      ctx.beginPath();
      ctx.arc(W / 2, H / 2, 120, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      const rw = 150;
      const rh = rw * (35 / 21);
      ctx.strokeRect(W / 2 - rw / 2, H / 2 - rh / 2, rw, rh);
    }
    ctx.restore();
  }, [processedImg, offsetX, offsetY, zoom, rotation, selectedProduct]);

  const getFinalCanvas = (): HTMLCanvasElement | null => {
    if (!processedImg) return null;

    const maxDim = Math.max(processedImg.width, processedImg.height);
    const outCanvas = document.createElement('canvas');

    let outW: number;
    let outH: number;
    if (selectedProduct.type === 'round') {
      outW = outH = maxDim;
    } else {
      outH = maxDim;
      outW = maxDim * (21 / 35);
    }

    outCanvas.width = outW;
    outCanvas.height = outH;
    const ctx = outCanvas.getContext('2d');
    if (!ctx) return null;

    const outScale = outW / (selectedProduct.type === 'round' ? 240 : 150);
    const baseScale = Math.min(400 / processedImg.width, 400 / processedImg.height) * 0.8;

    ctx.save();
    ctx.translate(outW / 2 + offsetX * outScale, outH / 2 + offsetY * outScale);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.scale(baseScale * zoom * outScale, baseScale * zoom * outScale);
    ctx.drawImage(processedImg, -processedImg.width / 2, -processedImg.height / 2);
    ctx.restore();

    const clipCanvas = document.createElement('canvas');
    clipCanvas.width = outW;
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

  const downloadPNG = () => {
    setLoading(true);
    try {
      const canvas = getFinalCanvas();
      if (!canvas) return;
      const link = document.createElement('a');
      link.href = canvas.toDataURL('image/png');
      link.download = `arte_${selectedProduct.name}.png`;
      link.click();
    } catch (err) {
      console.error('Erro ao baixar PNG:', err);
    } finally {
      setLoading(false);
    }
  };

  const downloadSVG = () => {
    setLoading(true);
    try {
      const canvas = getFinalCanvas();
      if (!canvas) return;

      const ctx = canvas.getContext('2d')!;
      const outW = canvas.width;
      const outH = canvas.height;
      const outData = ctx.getImageData(0, 0, outW, outH);
      const d = outData.data;

      // Convert to solid black for tracing
      for (let i = 0; i < d.length; i += 4) {
        if (d[i + 3] > 10) {
          d[i] = 0; d[i + 1] = 0; d[i + 2] = 0; d[i + 3] = 255;
        } else {
          d[i] = 255; d[i + 1] = 255; d[i + 2] = 255; d[i + 3] = 255;
        }
      }

      // @ts-ignore
      const tracer = ImageTracer.default || ImageTracer;
      const svgStr = tracer.imagedataToSVG(outData, {
        colorsampling: 0,
        numberofcolors: 2,
        strokewidth: 0,
        pathomit: 8,
      });

      const sizeStr = Array.isArray(selectedProduct.size)
        ? `width="${selectedProduct.size[0]}mm" height="${selectedProduct.size[1]}mm"`
        : `width="${selectedProduct.size}mm" height="${selectedProduct.size}mm"`;

      const finalSvg = svgStr.replace('<svg ', `<svg ${sizeStr} `);

      const blob = new Blob([finalSvg], { type: 'image/svg+xml' });
      const svgUrl = URL.createObjectURL(blob);
      const svgLink = document.createElement('a');
      svgLink.href = svgUrl;
      svgLink.download = `silhueta_${selectedProduct.name}.svg`;
      svgLink.click();
      setTimeout(() => URL.revokeObjectURL(svgUrl), 100);
    } catch (err) {
      console.error('Erro ao baixar SVG:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setFile(null);
    setImg(null);
    setProcessedImg(null);
    setError(null);
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
      {/* Left: Controls */}
      <div className="w-80 border-r border-white/5 bg-[#111111] p-6 flex flex-col gap-6 overflow-y-auto">
        <div className="flex items-center gap-2 text-zinc-400 font-bold text-xs uppercase tracking-widest">
          <Settings2 size={16} /> <Layout size={16} /> Produção
        </div>

        {!img ? (
          <div className="border-2 border-dashed border-white/10 rounded-xl p-8 flex flex-col items-center justify-center text-center bg-white/[0.02] hover:bg-white/[0.04] cursor-pointer relative">
            <input
              ref={inputRef}
              type="file"
              accept=".png,.jpg,.jpeg,.webp"
              onChange={handleUpload}
              className="absolute inset-0 opacity-0 cursor-pointer"
            />
            <Upload className="text-zinc-600 mb-2" />
            <p className="text-xs font-medium text-zinc-400">Carregar Matriz B&W</p>
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

            <div className="space-y-3 mt-4">
              <button
                onClick={downloadPNG}
                disabled={loading}
                className="w-full bg-emerald-500 hover:bg-emerald-400 disabled:bg-emerald-500/50 text-black font-bold py-3 rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-500/10"
              >
                {loading ? <Loader2 className="animate-spin" size={20} /> : <Download size={20} />}
                Baixar PNG (Arte Recortada)
              </button>

              <button
                onClick={downloadSVG}
                disabled={loading}
                className="w-full bg-zinc-800 hover:bg-zinc-700 disabled:bg-zinc-800/50 text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2 transition-all border border-white/10"
              >
                {loading ? <Loader2 className="animate-spin" size={20} /> : <FileCode size={20} />}
                Baixar SVG da Silhueta
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Center: Canvas */}
      <div className="flex-1 bg-black relative flex items-center justify-center overflow-hidden">
        <div className="absolute top-4 right-4 z-10">
          <div className="bg-black/50 backdrop-blur-md p-2 rounded-lg border border-white/10 text-[10px] text-zinc-500 uppercase tracking-widest font-bold">
            Preview Interativo
          </div>
        </div>

        <canvas
          ref={canvasRef}
          width={400}
          height={400}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onWheel={handleWheel}
          className="cursor-move bg-zinc-900 shadow-2xl rounded-lg border border-white/5"
        />

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
