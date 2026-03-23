import React, { useState, useRef } from 'react';
import {
  Scissors,
  Upload,
  Download,
  ZoomIn,
  ZoomOut,
  RefreshCcw,
  Loader2,
  AlertCircle,
  Sparkles,
  Maximize2,
} from 'lucide-react';
import { motion } from 'motion/react';
import { removeBackgroundAPI } from '../services/replicateService';
import { validateImageFile } from '../utils/fileValidation';

const LOADING_STEPS = [
  'Enviando imagem...',
  'Processando com IA...',
  'Finalizando...',
];

export default function ModuleRemover() {
  const [file, setFile]             = useState<File | null>(null);
  const [originalUrl, setOriginalUrl] = useState<string | null>(null);
  const [resultUrl, setResultUrl]   = useState<string | null>(null);
  const [loading, setLoading]       = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);
  const [zoom, setZoom]             = useState(1);
  const [panX, setPanX]             = useState(0);
  const [panY, setPanY]             = useState(0);
  const [isPanning, setIsPanning]   = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [error, setError]           = useState<string | null>(null);

  const objectUrlRef  = useRef<string | null>(null);
  const inputRef      = useRef<HTMLInputElement>(null);
  const stepTimerRef  = useRef<ReturnType<typeof setInterval> | null>(null);
  const isPanningRef  = useRef(false);
  const lastPanPos    = useRef({ x: 0, y: 0 });

  const resetView = () => { setZoom(1); setPanX(0); setPanY(0); };

  const setNewFile = (f: File) => {
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    const url = URL.createObjectURL(f);
    objectUrlRef.current = url;
    setFile(f);
    setOriginalUrl(url);
    setResultUrl(null);
    setError(null);
    resetView();
  };

  React.useEffect(() => {
    return () => {
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
      if (stepTimerRef.current) clearInterval(stepTimerRef.current);
    };
  }, []);

  // Reset pan when zoom returns to 1
  React.useEffect(() => {
    if (zoom <= 1) { setPanX(0); setPanY(0); }
  }, [zoom]);

  // ── Upload handlers ────────────────────────────────────────────────────────

  const handleFileAccepted = (f: File) => {
    const validationError = validateImageFile(f);
    if (validationError) { setError(validationError); return; }
    setNewFile(f);
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

  const handleReset = () => {
    if (objectUrlRef.current) { URL.revokeObjectURL(objectUrlRef.current); objectUrlRef.current = null; }
    if (stepTimerRef.current) { clearInterval(stepTimerRef.current); stepTimerRef.current = null; }
    setFile(null);
    setOriginalUrl(null);
    setResultUrl(null);
    setError(null);
    resetView();
    if (inputRef.current) inputRef.current.value = '';
  };

  // ── Pan handlers ───────────────────────────────────────────────────────────

  const handlePanStart = (e: React.MouseEvent) => {
    if (zoom <= 1) return;
    isPanningRef.current = true;
    setIsPanning(true);
    lastPanPos.current = { x: e.clientX, y: e.clientY };
  };

  const handlePanMove = (e: React.MouseEvent) => {
    if (!isPanningRef.current) return;
    const dx = e.clientX - lastPanPos.current.x;
    const dy = e.clientY - lastPanPos.current.y;
    setPanX(px => px + dx);
    setPanY(py => py + dy);
    lastPanPos.current = { x: e.clientX, y: e.clientY };
  };

  const handlePanEnd = () => {
    isPanningRef.current = false;
    setIsPanning(false);
  };

  // ── Processing ─────────────────────────────────────────────────────────────

  const processImage = async () => {
    if (!file) return;
    setLoading(true);
    setLoadingStep(0);
    setResultUrl(null);
    setError(null);

    let step = 0;
    stepTimerRef.current = setInterval(() => {
      step = Math.min(step + 1, LOADING_STEPS.length - 1);
      setLoadingStep(step);
    }, 2_000);

    try {
      const outputUrl = await removeBackgroundAPI(file);
      setResultUrl(outputUrl);
    } catch (err: any) {
      setError(err.message ?? 'Erro ao processar imagem. Tente novamente.');
    } finally {
      if (stepTimerRef.current) { clearInterval(stepTimerRef.current); stepTimerRef.current = null; }
      setLoading(false);
    }
  };

  const downloadResult = async () => {
    if (!resultUrl) return;
    try {
      const res = await fetch(resultUrl);
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      const baseName = file?.name.replace(/\.[^.]+$/, '') ?? 'imagem';
      link.href = blobUrl;
      link.download = `${baseName}_sem_fundo.png`;
      link.click();
      URL.revokeObjectURL(blobUrl);
    } catch {
      const link = document.createElement('a');
      link.href = resultUrl;
      link.download = `${file?.name ?? 'imagem'}_sem_fundo.png`;
      link.click();
    }
  };

  // ── Shared image transform ─────────────────────────────────────────────────

  const imgTransform = `translate(${panX}px, ${panY}px) scale(${zoom})`;
  const panCursor = zoom > 1 ? (isPanning ? 'grabbing' : 'grab') : 'default';

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="flex-1 flex flex-col p-6 overflow-hidden"
    >
      <header className="mb-6">
        <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Scissors size={22} className="text-emerald-400" /> Removedor Inteligente de Fundo
        </h2>
        <p className="text-zinc-500 text-sm">Isole objetos para gravação com precisão cirúrgica.</p>
      </header>

      <div className="flex-1 flex flex-col gap-6 overflow-hidden">
        {!originalUrl ? (
          /* ── Upload zone ── */
          <div
            onDragOver={handleDragOver}
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`flex-1 border-2 border-dashed rounded-2xl flex flex-col items-center justify-center transition-colors group cursor-pointer relative
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
            <div className={`p-4 rounded-full transition-transform ${isDragOver ? 'scale-110 bg-emerald-500/20 text-emerald-300' : 'bg-emerald-500/10 text-emerald-400 group-hover:scale-110'}`}>
              <Upload size={32} />
            </div>
            <p className="mt-4 font-medium">
              {isDragOver ? 'Solte a imagem aqui' : 'Arraste ou clique para upload'}
            </p>
            <p className="text-xs text-zinc-500 mt-1">PNG, JPG ou WEBP · Máx. 10 MB</p>
            {error && (
              <div className="mt-4 bg-red-500/10 border border-red-500/20 px-4 py-2 rounded-lg flex items-center gap-2 text-red-400 text-sm">
                <AlertCircle size={16} /> {error}
              </div>
            )}
          </div>
        ) : (
          <div className="flex-1 flex flex-col gap-4 overflow-hidden">
            {/* ── Toolbar ── */}
            <div className="flex items-center justify-between bg-[#1a1a1a] p-3 rounded-xl border border-white/5">
              <div className="flex items-center gap-4">
                <button
                  onClick={handleReset}
                  className="text-xs font-medium text-zinc-500 hover:text-zinc-300 flex items-center gap-1"
                >
                  <RefreshCcw size={14} /> Novo Upload
                </button>
                <div className="h-4 w-px bg-white/10" />
                <div className="flex items-center gap-2">
                  <button onClick={() => setZoom(z => Math.max(0.5, z - 0.25))} className="p-1 hover:bg-white/5 rounded">
                    <ZoomOut size={16} />
                  </button>
                  <button
                    onClick={resetView}
                    className="text-xs font-mono w-12 text-center hover:text-emerald-400 transition-colors"
                    title="Resetar zoom"
                  >
                    {Math.round(zoom * 100)}%
                  </button>
                  <button onClick={() => setZoom(z => Math.min(4, z + 0.25))} className="p-1 hover:bg-white/5 rounded">
                    <ZoomIn size={16} />
                  </button>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {resultUrl && (
                  <button
                    onClick={processImage}
                    disabled={loading}
                    className="text-xs font-medium text-zinc-500 hover:text-zinc-300 flex items-center gap-1 disabled:opacity-40"
                  >
                    <RefreshCcw size={14} /> Tentar novamente
                  </button>
                )}
                {!resultUrl ? (
                  <button
                    onClick={processImage}
                    disabled={loading}
                    className="bg-emerald-500 hover:bg-emerald-400 disabled:bg-emerald-500/50 text-black font-bold py-2 px-4 rounded-lg flex items-center gap-2 transition-all"
                  >
                    {loading ? <Loader2 className="animate-spin" size={18} /> : <Sparkles size={18} />}
                    Remover Fundo
                  </button>
                ) : (
                  <button
                    onClick={downloadResult}
                    className="bg-zinc-100 hover:bg-white text-black font-bold py-2 px-4 rounded-lg flex items-center gap-2 transition-all"
                  >
                    <Download size={18} /> Download PNG
                  </button>
                )}
              </div>
            </div>

            {error && (
              <div className="bg-red-500/10 border border-red-500/20 p-3 rounded-lg flex items-center gap-3 text-red-400 text-sm">
                <AlertCircle size={18} /> {error}
              </div>
            )}

            {/* ── Before / After ── */}
            <div className="flex-1 grid grid-cols-2 gap-4 overflow-hidden">
              {/* Original */}
              <div
                className="relative border border-white/5 rounded-2xl bg-black overflow-hidden flex items-center justify-center"
                style={{ cursor: panCursor }}
                onMouseDown={handlePanStart}
                onMouseMove={handlePanMove}
                onMouseUp={handlePanEnd}
                onMouseLeave={handlePanEnd}
              >
                <div className="absolute top-3 left-3 z-10 bg-black/50 backdrop-blur-md px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider text-zinc-400 border border-white/10">
                  Original
                </div>
                <div style={{ transform: imgTransform }}>
                  <img src={originalUrl} alt="Original" className="max-h-full max-w-full object-contain select-none" draggable={false} />
                </div>
              </div>

              {/* Result */}
              <div
                className="relative border border-white/5 rounded-2xl overflow-hidden flex items-center justify-center bg-checkerboard"
                style={{ cursor: panCursor }}
                onMouseDown={handlePanStart}
                onMouseMove={handlePanMove}
                onMouseUp={handlePanEnd}
                onMouseLeave={handlePanEnd}
              >
                <div className="absolute top-3 left-3 z-10 flex items-center gap-2">
                  <div className="bg-black/50 backdrop-blur-md px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider text-zinc-400 border border-white/10">
                    Resultado
                  </div>
                  {resultUrl && (
                    <div className="bg-emerald-500/20 backdrop-blur-md px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider text-emerald-400 border border-emerald-500/30">
                      ✦ Replicate AI
                    </div>
                  )}
                </div>
                {loading && (
                  <div className="absolute inset-0 z-20 bg-black/70 flex flex-col items-center justify-center gap-4">
                    <Loader2 className="animate-spin text-emerald-400" size={48} />
                    <p className="text-sm font-medium text-emerald-400 animate-pulse">
                      {LOADING_STEPS[loadingStep]}
                    </p>
                  </div>
                )}
                <div style={{ transform: imgTransform }}>
                  {resultUrl && (
                    <img src={resultUrl} alt="Resultado" className="max-h-full max-w-full object-contain select-none" draggable={false} />
                  )}
                </div>
                {!resultUrl && !loading && (
                  <div className="text-zinc-500 flex flex-col items-center gap-2">
                    <Maximize2 size={32} opacity={0.3} />
                    <p className="text-xs">Aguardando processamento</p>
                  </div>
                )}
              </div>
            </div>

            {zoom > 1 && (
              <p className="text-center text-[10px] text-zinc-600">
                Arraste para navegar · Clique em {Math.round(zoom * 100)}% para resetar
              </p>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
}
