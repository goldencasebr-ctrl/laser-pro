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
  ArrowRight,
  ArrowLeft,
  Sparkles,
  Maximize2,
} from 'lucide-react';
import { motion } from 'motion/react';
import ImageTracer from 'imagetracerjs';
import { loadImage } from '../utils/imageUtils';
import { validateImageFile } from '../utils/fileValidation';
import { useCanvasTransform } from '../hooks/useCanvasTransform';
import { removeBackgroundAPI } from '../services/replicateService';

interface Product {
  id: string;
  name: string;
  type: 'round' | 'rect';
  size: number | [number, number];
}

type InputMode = 'remove-bg' | 'transparent';

const PRODUCTS: Product[] = [
  { id: 'r15',      name: 'Redondo 15mm',       type: 'round', size: 15 },
  { id: 'r20',      name: 'Redondo 20mm',       type: 'round', size: 20 },
  { id: 'r25',      name: 'Redondo 25mm',       type: 'round', size: 25 },
  { id: 'r30',      name: 'Redondo 30mm',       type: 'round', size: 30 },
  { id: 'rect2135', name: 'Retangular 21x35mm', type: 'rect',  size: [21, 35] },
];

const BG_STEPS = ['Enviando imagem...', 'Processando com IA...', 'Finalizando...'];

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

function getProductMmDimensions(product: Product): [number, number] {
  if (Array.isArray(product.size)) return product.size;
  return [product.size, product.size];
}

function getProductAspectRatio(product: Product): number {
  const [widthMm, heightMm] = getProductMmDimensions(product);
  return heightMm / widthMm;
}

// ── Pure helper: raster canvas → SVG silhouette string ──────────────────────
// Works cleanly with BIRefNet output: alpha > 0 = subject, alpha = 0 = background
function buildSilhouetteSvg(canvas: HTMLCanvasElement): string {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Nao foi possivel ler o canvas final.');
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

  const tracer = ImageTracer.default || ImageTracer;
  return tracer.imagedataToSVG(outData, {
    colorsampling: 0, numberofcolors: 2, strokewidth: 0, pathomit: 8,
  }) as string;
}

function injectMmDimensions(svgStr: string, product: Product): string {
  const [widthMm, heightMm] = getProductMmDimensions(product);
  let output = svgStr;

  output = /width="[^"]*"/.test(output)
    ? output.replace(/width="[^"]*"/, `width="${widthMm}mm"`)
    : output.replace('<svg', `<svg width="${widthMm}mm"`);

  output = /height="[^"]*"/.test(output)
    ? output.replace(/height="[^"]*"/, `height="${heightMm}mm"`)
    : output.replace('<svg', `<svg height="${heightMm}mm"`);

  if (!/preserveAspectRatio=/.test(output)) {
    output = output.replace('<svg', '<svg preserveAspectRatio="xMidYMid meet"');
  }

  return output;
}

export default function ModuleProducao() {
  // ── Etapa ──────────────────────────────────────────────────────────────────
  const [etapa, setEtapa] = useState<1 | 2>(1);

  // ── Etapa 1: remoção de fundo ──────────────────────────────────────────────
  const [file, setFile]           = useState<File | null>(null);
  const [originalUrl, setOriginalUrl] = useState<string | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [bgLoading, setBgLoading] = useState(false);
  const [bgStep, setBgStep]       = useState(0);
  const [bgError, setBgError]     = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [inputMode, setInputMode] = useState<InputMode>('remove-bg');

  // ── Etapa 2: posicionamento + silhueta ─────────────────────────────────────
  const [processedImg, setProcessedImg]       = useState<HTMLImageElement | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<Product>(PRODUCTS[1]);
  const [canvasSize, setCanvasSize]           = useState(400);
  const [matrizGenerated, setMatrizGenerated] = useState(false);
  const [silhouetteUrl, setSilhouetteUrl]     = useState<string | null>(null);
  const [silhouetteLoading, setSilhouetteLoading] = useState(false);

  // ── Refs ───────────────────────────────────────────────────────────────────
  const canvasRef           = useRef<HTMLCanvasElement>(null);
  const containerRef        = useRef<HTMLDivElement>(null);
  const inputRef            = useRef<HTMLInputElement>(null);
  const objectUrlRef        = useRef<string | null>(null);
  const processedImgUrlRef  = useRef<string | null>(null);
  const stepTimerRef        = useRef<ReturnType<typeof setInterval> | null>(null);
  const svgUrlRef           = useRef<string | null>(null);
  const svgStrRef           = useRef<string | null>(null);
  const silhouetteJobRef    = useRef(0);
  const bgRequestIdRef      = useRef(0);
  const bgAbortControllerRef = useRef<AbortController | null>(null);
  const applyImageRequestIdRef = useRef(0);
  const applyImageAbortControllerRef = useRef<AbortController | null>(null);

  const {
    offsetX, offsetY,
    zoom, setZoom,
    rotation, setRotation,
    handleMouseDown, handleMouseMove, handleMouseUp, handleWheel,
    reset: resetTransform,
  } = useCanvasTransform();

  const clearLoadingTimer = useCallback(() => {
    if (stepTimerRef.current) {
      clearInterval(stepTimerRef.current);
      stepTimerRef.current = null;
    }
  }, []);

  const cancelBgRequest = useCallback(() => {
    bgRequestIdRef.current += 1;
    bgAbortControllerRef.current?.abort();
    bgAbortControllerRef.current = null;
    clearLoadingTimer();
    setBgLoading(false);
    setBgStep(0);
  }, [clearLoadingTimer]);

  const cancelApplyImageRequest = useCallback(() => {
    applyImageRequestIdRef.current += 1;
    applyImageAbortControllerRef.current?.abort();
    applyImageAbortControllerRef.current = null;
  }, []);

  // ── Cleanup on unmount ─────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      cancelBgRequest();
      cancelApplyImageRequest();
      if (objectUrlRef.current)       URL.revokeObjectURL(objectUrlRef.current);
      if (processedImgUrlRef.current) URL.revokeObjectURL(processedImgUrlRef.current);
      if (svgUrlRef.current)          URL.revokeObjectURL(svgUrlRef.current);
    };
  }, [cancelApplyImageRequest, cancelBgRequest]);

  const clearSilhouette = useCallback(() => {
    silhouetteJobRef.current += 1;
    setMatrizGenerated(false);
    setSilhouetteLoading(false);
    setSilhouetteUrl(null);
    if (svgUrlRef.current) {
      URL.revokeObjectURL(svgUrlRef.current);
      svgUrlRef.current = null;
    }
    svgStrRef.current = null;
  }, []);

  const resetWorkflowState = useCallback(() => {
    cancelBgRequest();
    cancelApplyImageRequest();
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
    if (processedImgUrlRef.current) {
      URL.revokeObjectURL(processedImgUrlRef.current);
      processedImgUrlRef.current = null;
    }
    clearSilhouette();
    setFile(null);
    setOriginalUrl(null);
    setResultUrl(null);
    setBgError(null);
    setBgLoading(false);
    setBgStep(0);
    setProcessedImg(null);
    setEtapa(1);
    resetTransform();
    if (inputRef.current) inputRef.current.value = '';
  }, [cancelApplyImageRequest, cancelBgRequest, clearSilhouette, resetTransform]);

  // ── Responsive canvas (Etapa 2) ────────────────────────────────────────────
  const recalcCanvasSize = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    const columns = etapa === 2 ? 2 : 1;
    const availW  = width / columns - (columns > 1 ? 32 : 0);
    const size    = Math.max(Math.min(Math.floor(Math.min(availW, height) * 0.88), 900), 260);
    setCanvasSize(size);
  }, [etapa]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(recalcCanvasSize);
    ro.observe(el);
    recalcCanvasSize();
    return () => ro.disconnect();
  }, [recalcCanvasSize]);

  useEffect(() => { recalcCanvasSize(); }, [matrizGenerated, etapa, recalcCanvasSize]);

  // ── Etapa 1: Upload + remoção automática ───────────────────────────────────
  const handleFileAccepted = useCallback(async (f: File) => {
    const validationError = validateImageFile(f);
    if (validationError) { setBgError(validationError); return; }

    // Limpar estado anterior
    cancelBgRequest();
    cancelApplyImageRequest();
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    const url = URL.createObjectURL(f);
    objectUrlRef.current = url;

    setFile(f);
    setOriginalUrl(url);
    setResultUrl(null);
    setBgError(null);
    setProcessedImg(null);
    setEtapa(1);
    clearSilhouette();
    resetTransform();

    if (inputMode === 'transparent') {
      setResultUrl(url);
      setBgLoading(false);
      setBgStep(0);
      return;
    }

    // Auto-disparar remoção de fundo
    await triggerBgRemoval(f);
  }, [cancelApplyImageRequest, cancelBgRequest, clearSilhouette, inputMode, resetTransform]);

  const triggerBgRemoval = async (f: File) => {
    bgRequestIdRef.current += 1;
    const requestId = bgRequestIdRef.current;
    bgAbortControllerRef.current?.abort();
    const controller = new AbortController();
    bgAbortControllerRef.current = controller;

    setBgLoading(true);
    setBgStep(0);
    setBgError(null);

    let step = 0;
    clearLoadingTimer();
    stepTimerRef.current = setInterval(() => {
      step = Math.min(step + 1, BG_STEPS.length - 1);
      setBgStep(step);
    }, 2_000);

    try {
      const output = await removeBackgroundAPI(f, { signal: controller.signal });
      if (requestId !== bgRequestIdRef.current) return;
      setResultUrl(output);
    } catch (error: unknown) {
      if (requestId !== bgRequestIdRef.current || isAbortError(error)) return;
      setBgError(getErrorMessage(error, 'Erro ao processar. Tente novamente.'));
    } finally {
      if (requestId !== bgRequestIdRef.current) return;
      clearLoadingTimer();
      setBgLoading(false);
      if (bgAbortControllerRef.current === controller) {
        bgAbortControllerRef.current = null;
      }
    }
  };

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) void handleFileAccepted(f);
  };
  const handleDragOver  = (e: React.DragEvent) => e.preventDefault();
  const handleDragEnter = (e: React.DragEvent) => { e.preventDefault(); setIsDragOver(true); };
  const handleDragLeave = (e: React.DragEvent) => { e.preventDefault(); setIsDragOver(false); };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); setIsDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f) void handleFileAccepted(f);
  };

  const handleReset = () => {
    resetWorkflowState();
  };

  const handleInputModeChange = (mode: InputMode) => {
    if (mode === inputMode) return;
    resetWorkflowState();
    setInputMode(mode);
  };

  // ── Etapa 1 → 2: aplicar imagem no produto ────────────────────────────────
  const handleBackToStepOne = () => {
    cancelApplyImageRequest();
    setEtapa(1);
  };

  const aplicarImagem = async () => {
    if (!resultUrl) return;

    applyImageRequestIdRef.current += 1;
    const requestId = applyImageRequestIdRef.current;
    applyImageAbortControllerRef.current?.abort();
    const controller = new AbortController();
    applyImageAbortControllerRef.current = controller;

    setEtapa(2);
    setBgError(null);
    setProcessedImg(null);
    resetTransform();
    clearSilhouette();
    try {
      const res = await fetch(resultUrl, { signal: controller.signal });
      if (!res.ok) {
        throw new Error(`Erro ${res.status} ao carregar a imagem processada.`);
      }

      const blob = await res.blob();
      if (requestId !== applyImageRequestIdRef.current) return;

      const url = URL.createObjectURL(blob);
      if (processedImgUrlRef.current) URL.revokeObjectURL(processedImgUrlRef.current);
      processedImgUrlRef.current = url;
      const loaded = await loadImage(url);
      if (requestId !== applyImageRequestIdRef.current) return;
      setProcessedImg(loaded);
    } catch (error: unknown) {
      if (requestId !== applyImageRequestIdRef.current || isAbortError(error)) return;
      setEtapa(1);
      setBgError('Nao foi possivel carregar a imagem processada na etapa de producao. Tente remover o fundo novamente.');
    } finally {
      if (applyImageAbortControllerRef.current === controller) {
        applyImageAbortControllerRef.current = null;
      }
    }
  };

  // ── Etapa 2: Canvas render ─────────────────────────────────────────────────
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
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const W = canvasSize, H = canvasSize;
    ctx.clearRect(0, 0, W, H);

    const previewRadius = W * 0.44;
    const previewRectW  = W * 0.55;
    const previewRectH  = previewRectW * getProductAspectRatio(selectedProduct);
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

  // ── Etapa 2: canvas de exportação ─────────────────────────────────────────
  const getFinalCanvas = useCallback((): HTMLCanvasElement | null => {
    if (!processedImg) return null;

    const maxDim = Math.max(processedImg.width, processedImg.height);
    const outCanvas = document.createElement('canvas');

    let outW: number, outH: number;
    if (selectedProduct.type === 'round') {
      outW = outH = maxDim;
    } else {
      const [widthMm, heightMm] = getProductMmDimensions(selectedProduct);
      outH = maxDim;
      outW = maxDim * (widthMm / heightMm);
    }

    outCanvas.width  = outW;
    outCanvas.height = outH;
    const ctx = outCanvas.getContext('2d');
    if (!ctx) return null;

    const previewRadius = canvasSize * 0.44;
    const previewRectW  = canvasSize * 0.55;
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
  }, [canvasSize, offsetX, offsetY, processedImg, rotation, selectedProduct, zoom]);

  // ── Etapa 2: geração de silhueta ───────────────────────────────────────────
  const applySilhouette = useCallback(() => {
    const canvas = getFinalCanvas();
    if (!canvas) return;
    const jobId = silhouetteJobRef.current + 1;
    silhouetteJobRef.current = jobId;
    setSilhouetteLoading(true);
    setTimeout(() => {
      if (jobId !== silhouetteJobRef.current) return;
      try {
        const svgStr = buildSilhouetteSvg(canvas);
        if (jobId !== silhouetteJobRef.current) return;
        svgStrRef.current = svgStr;
        if (svgUrlRef.current) URL.revokeObjectURL(svgUrlRef.current);
        const blob = new Blob([svgStr], { type: 'image/svg+xml' });
        const url  = URL.createObjectURL(blob);
        svgUrlRef.current = url;
        setSilhouetteUrl(url);
        setMatrizGenerated(true);
      } catch (error: unknown) {
        if (jobId !== silhouetteJobRef.current || isAbortError(error)) return;
        setBgError(getErrorMessage(error, 'Nao foi possivel gerar a silhueta SVG.'));
      } finally {
        if (jobId === silhouetteJobRef.current) {
          setSilhouetteLoading(false);
        }
      }
    }, 0);
  }, [getFinalCanvas]);

  const handleGerarMatriz = () => {
    applySilhouette();
  };

  // Qualquer ajuste invalida a matriz atual até uma nova geração manual
  useEffect(() => {
    if (etapa !== 2 || !processedImg) return;
    clearSilhouette();
  }, [etapa, processedImg, selectedProduct, offsetX, offsetY, zoom, rotation, clearSilhouette]);

  // ── Downloads ──────────────────────────────────────────────────────────────
  const downloadPNG = () => {
    const canvas = getFinalCanvas();
    if (!canvas) return;
    const link = document.createElement('a');
    link.href     = canvas.toDataURL('image/png');
    link.download = `arte_${selectedProduct.name}.png`;
    link.click();
  };

  const downloadSVG = () => {
    if (!svgStrRef.current) return;
    const printSvg = injectMmDimensions(svgStrRef.current, selectedProduct);
    const blob = new Blob([printSvg], { type: 'image/svg+xml' });
    const url  = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href     = url;
    link.download = `silhueta_${selectedProduct.name}.svg`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 100);
  };

  // ══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════════════════════════════════════════
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 1.05 }}
      className="flex-1 flex flex-col md:flex-row overflow-auto md:overflow-hidden"
    >
      {/* ════════════════ ETAPA 1 ════════════════ */}
      {etapa === 1 && (
        <>
          {/* Left: controles */}
          <div className="w-full md:w-80 border-b md:border-b-0 md:border-r border-white/5 bg-[#111111] p-4 md:p-6 flex flex-col gap-6 overflow-y-auto shrink-0">
            <div className="flex items-center gap-2 text-zinc-400 font-bold text-xs uppercase tracking-widest">
              <Settings2 size={16} /> <Layout size={16} /> Produção
            </div>

            <div className="space-y-3">
              <label className="text-xs font-medium text-zinc-500">Modo de entrada</label>
              <div className="grid grid-cols-2 gap-2 rounded-xl bg-black/30 p-1 border border-white/5">
                <button
                  onClick={() => handleInputModeChange('remove-bg')}
                  className={`rounded-lg px-3 py-2 text-xs font-bold transition-colors border ${
                    inputMode === 'remove-bg'
                      ? 'bg-emerald-600 text-white border-emerald-500/60'
                      : 'bg-transparent text-zinc-400 border-transparent hover:bg-white/5'
                  }`}
                >
                  Remover Fundo
                </button>
                <button
                  onClick={() => handleInputModeChange('transparent')}
                  className={`rounded-lg px-3 py-2 text-xs font-bold transition-colors border ${
                    inputMode === 'transparent'
                      ? 'bg-emerald-600 text-white border-emerald-500/60'
                      : 'bg-transparent text-zinc-400 border-transparent hover:bg-white/5'
                  }`}
                >
                  Ja sem fundo
                </button>
              </div>
              <p className="text-[10px] text-zinc-600">
                {inputMode === 'remove-bg'
                  ? 'Envie a imagem normal para remover o fundo com IA antes de montar a matriz.'
                  : 'Envie PNG ou WEBP transparente para pular o Replicate e ir direto para a matriz.'}
              </p>
            </div>

            {!file ? (
              /* Upload zone */
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
                  {isDragOver
                    ? 'Solte a imagem aqui'
                    : inputMode === 'remove-bg'
                      ? 'Carregar imagem para remover o fundo'
                      : 'Carregar imagem ja sem fundo'}
                </p>
                <p className="text-[10px] text-zinc-600 mt-1">
                  {inputMode === 'remove-bg'
                    ? 'PNG, JPG ou WEBP · Max. 10 MB'
                    : 'Preferencialmente PNG ou WEBP com transparencia · Max. 10 MB'}
                </p>
                {bgError && (
                  <div className="mt-3 flex items-center gap-2 text-red-400 text-xs">
                    <AlertCircle size={14} /> {bgError}
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-5">
                <button
                  onClick={handleReset}
                  className="text-xs font-medium text-zinc-500 hover:text-zinc-300 flex items-center gap-1"
                >
                  <RefreshCcw size={14} /> Novo Upload
                </button>

                {/* Status da remoção de fundo */}
                {inputMode === 'remove-bg' && bgLoading && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 text-emerald-400 text-sm font-medium">
                      <Loader2 className="animate-spin" size={16} />
                      {BG_STEPS[bgStep]}
                    </div>
                    <div className="w-full bg-white/5 rounded-full h-1">
                      <div
                        className="bg-emerald-500 h-1 rounded-full transition-all duration-700"
                        style={{ width: `${((bgStep + 1) / BG_STEPS.length) * 100}%` }}
                      />
                    </div>
                    <p className="text-[10px] text-zinc-600">
                      O BIRefNet está isolando o objeto com precisão cirúrgica...
                    </p>
                  </div>
                )}

                {inputMode === 'remove-bg' && bgError && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 text-red-400 text-xs bg-red-500/10 border border-red-500/20 rounded-lg p-3">
                      <AlertCircle size={14} /> {bgError}
                    </div>
                    <button
                      onClick={() => file && void triggerBgRemoval(file)}
                      className="w-full bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-bold py-2 rounded-lg flex items-center justify-center gap-2 border border-white/10"
                    >
                      <RefreshCcw size={14} /> Tentar novamente
                    </button>
                  </div>
                )}

                {resultUrl && !bgLoading && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 text-emerald-400 text-xs font-medium">
                      <Sparkles size={14} />
                      {inputMode === 'remove-bg'
                        ? 'Fundo removido com sucesso'
                        : 'Imagem transparente pronta para a matriz'}
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs font-medium text-zinc-500">Produto</label>
                      <select
                        value={selectedProduct.id}
                        onChange={e => setSelectedProduct(PRODUCTS.find(p => p.id === e.target.value) ?? PRODUCTS[1])}
                        className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none"
                      >
                        {PRODUCTS.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                    </div>

                    <button
                      onClick={() => void aplicarImagem()}
                      className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-500/10"
                    >
                      <ArrowRight size={18} /> Aplicar no Produto
                    </button>

                    {inputMode === 'remove-bg' && (
                      <button
                        onClick={() => file && void triggerBgRemoval(file)}
                        className="w-full bg-white/5 hover:bg-white/10 text-zinc-400 text-xs font-medium py-2 rounded-lg flex items-center justify-center gap-2 border border-white/10"
                      >
                        <RefreshCcw size={13} /> Tentar novamente
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Right: before / after */}
          <div ref={containerRef} className="flex-1 bg-black p-4 grid grid-cols-1 md:grid-cols-2 gap-4 overflow-auto md:overflow-hidden">
            {/* Original */}
            <div className="relative min-h-[280px] md:min-h-0 border border-white/5 rounded-2xl bg-zinc-900 overflow-hidden flex items-center justify-center">
              <div className="absolute top-3 left-3 z-10 bg-black/50 backdrop-blur-md px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider text-zinc-400 border border-white/10">
                Original
              </div>
              {originalUrl ? (
                <img src={originalUrl} alt="Original" className="max-h-full max-w-full object-contain select-none p-4" draggable={false} />
              ) : (
                <div className="flex flex-col items-center gap-2 text-zinc-700">
                  <Maximize2 size={32} />
                  <p className="text-xs">Aguardando upload</p>
                </div>
              )}
            </div>

            {/* Resultado pronto para producao */}
            <div className="relative min-h-[280px] md:min-h-0 border border-white/5 rounded-2xl bg-checkerboard overflow-hidden flex items-center justify-center">
              <div className="absolute top-3 left-3 z-10 flex items-center gap-2">
                <div className="bg-black/50 backdrop-blur-md px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider text-zinc-400 border border-white/10">
                  {inputMode === 'remove-bg' ? 'Fundo Removido' : 'Imagem Transparente'}
                </div>
                {inputMode === 'remove-bg' && resultUrl && !bgLoading && (
                  <div className="bg-emerald-500/20 backdrop-blur-md px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider text-emerald-400 border border-emerald-500/30">
                    ✦ BIRefNet AI
                  </div>
                )}
              </div>
              {bgLoading && (
                <div className="absolute inset-0 z-20 bg-black/70 flex flex-col items-center justify-center gap-4">
                  <Loader2 className="animate-spin text-emerald-400" size={48} />
                  <p className="text-sm font-medium text-emerald-400 animate-pulse">
                    {BG_STEPS[bgStep]}
                  </p>
                </div>
              )}
              {resultUrl && (
                <img src={resultUrl} alt="Fundo removido" className="max-h-full max-w-full object-contain select-none p-4" draggable={false} />
              )}
              {!resultUrl && !bgLoading && (
                <div className="flex flex-col items-center gap-2 text-zinc-700">
                  <Sparkles size={32} />
                  <p className="text-xs">
                    {inputMode === 'remove-bg' ? 'Aguardando processamento' : 'Aguardando imagem transparente'}
                  </p>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* ════════════════ ETAPA 2 ════════════════ */}
      {etapa === 2 && (
        <>
          {/* Left: controles */}
          <div className="w-full md:w-80 border-b md:border-b-0 md:border-r border-white/5 bg-[#111111] p-4 md:p-6 flex flex-col gap-6 overflow-y-auto shrink-0">
            <div className="flex items-center gap-2 text-zinc-400 font-bold text-xs uppercase tracking-widest">
              <Settings2 size={16} /> <Layout size={16} /> Produção
            </div>

            <button
              onClick={handleBackToStepOne}
              className="text-xs font-medium text-zinc-500 hover:text-zinc-300 flex items-center gap-1 self-start"
            >
              <ArrowLeft size={14} /> Voltar
            </button>

            <div className="space-y-2">
              <label className="text-xs font-medium text-zinc-500">Produto</label>
              <select
                value={selectedProduct.id}
                onChange={e => setSelectedProduct(PRODUCTS.find(p => p.id === e.target.value) ?? PRODUCTS[1])}
                className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none"
              >
                {PRODUCTS.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
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
                onChange={e => setRotation(parseInt(e.target.value, 10))}
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

            <button
              onClick={handleGerarMatriz}
              disabled={!processedImg || silhouetteLoading}
              className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:bg-emerald-600/50 text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-500/10"
            >
              {silhouetteLoading
                ? <Loader2 className="animate-spin" size={20} />
                : <Layers size={20} />
              }
              Gerar Matriz
            </button>

            {matrizGenerated && (
              <div className="space-y-3">
                <button
                  onClick={downloadPNG}
                  className="w-full bg-zinc-800 hover:bg-zinc-700 text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2 transition-all border border-white/10"
                >
                  <Download size={20} /> Baixar PNG
                </button>
                <button
                  onClick={downloadSVG}
                  disabled={!silhouetteUrl || silhouetteLoading}
                  className="w-full bg-zinc-800 hover:bg-zinc-700 disabled:bg-zinc-800/50 text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2 transition-all border border-white/10"
                >
                  <FileCode size={20} /> Baixar SVG
                </button>
              </div>
            )}
          </div>

          {/* Right: canvas + silhueta */}
          <div
            ref={containerRef}
            className="flex-1 bg-black relative flex items-center justify-center overflow-hidden"
          >
            <div className="absolute top-4 right-4 z-10">
              <div className="bg-black/50 backdrop-blur-md p-2 rounded-lg border border-white/10 text-[10px] text-zinc-500 uppercase tracking-widest font-bold">
                Preview Interativo
              </div>
            </div>

            <div className="flex items-center justify-center gap-6">
              {/* Canvas do produto */}
              <div className="flex flex-col items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">
                  Imagem no Produto
                </span>
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

              {/* Preview da silhueta */}
              <div className="flex flex-col items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">
                  Silhueta SVG
                </span>
                <div
                  style={{ width: canvasSize, height: canvasSize }}
                  className="shadow-2xl rounded-lg border border-white/5 bg-white flex items-center justify-center overflow-hidden"
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
            </div>

            {!processedImg && (
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
        </>
      )}
    </motion.div>
  );
}
