import React, { useRef, useState } from 'react';
import {
  Scissors,
  Upload,
  Download,
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

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

export default function ModuleRemover() {
  const [file, setFile] = useState<File | null>(null);
  const [originalUrl, setOriginalUrl] = useState<string | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);
  const [isDragOver, setIsDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const objectUrlRef = useRef<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const stepTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const requestIdRef = useRef(0);
  const abortControllerRef = useRef<AbortController | null>(null);

  const clearLoadingTimer = () => {
    if (stepTimerRef.current) {
      clearInterval(stepTimerRef.current);
      stepTimerRef.current = null;
    }
  };

  const cancelActiveRequest = () => {
    requestIdRef.current += 1;
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    clearLoadingTimer();
    setLoading(false);
    setLoadingStep(0);
  };

  const setNewFile = (nextFile: File) => {
    cancelActiveRequest();
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    const url = URL.createObjectURL(nextFile);
    objectUrlRef.current = url;
    setFile(nextFile);
    setOriginalUrl(url);
    setResultUrl(null);
    setError(null);
  };

  React.useEffect(() => () => {
    cancelActiveRequest();
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
  }, []);

  const handleFileAccepted = (nextFile: File) => {
    const validationError = validateImageFile(nextFile);
    if (validationError) {
      setError(validationError);
      return;
    }
    setNewFile(nextFile);
  };

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const nextFile = e.target.files?.[0];
    if (nextFile) handleFileAccepted(nextFile);
  };

  const handleDragOver = (e: React.DragEvent) => e.preventDefault();
  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };
  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const nextFile = e.dataTransfer.files[0];
    if (nextFile) handleFileAccepted(nextFile);
  };

  const handleReset = () => {
    cancelActiveRequest();
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
    setFile(null);
    setOriginalUrl(null);
    setResultUrl(null);
    setError(null);
    if (inputRef.current) inputRef.current.value = '';
  };

  const processImage = async () => {
    if (!file) return;

    requestIdRef.current += 1;
    const requestId = requestIdRef.current;
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setLoading(true);
    setLoadingStep(0);
    setResultUrl(null);
    setError(null);

    let step = 0;
    clearLoadingTimer();
    stepTimerRef.current = setInterval(() => {
      step = Math.min(step + 1, LOADING_STEPS.length - 1);
      setLoadingStep(step);
    }, 2_000);

    try {
      const outputUrl = await removeBackgroundAPI(file, { signal: controller.signal });
      if (requestId !== requestIdRef.current) return;
      setResultUrl(outputUrl);
    } catch (caughtError) {
      if (requestId !== requestIdRef.current || isAbortError(caughtError)) return;
      setError(getErrorMessage(caughtError, 'Erro ao processar imagem. Tente novamente.'));
    } finally {
      if (requestId !== requestIdRef.current) return;
      clearLoadingTimer();
      setLoading(false);
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
      }
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

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 1.05 }}
      className="flex-1 flex flex-col md:flex-row overflow-auto md:overflow-hidden"
    >
      <div className="w-full md:w-80 border-b md:border-b-0 md:border-r border-white/5 bg-[#111111] p-4 md:p-6 flex flex-col gap-6 overflow-y-auto shrink-0">
        <div className="flex items-center gap-2 text-zinc-400 font-bold text-xs uppercase tracking-widest">
          <Scissors size={16} /> Removedor de Fundo
        </div>

        {!file ? (
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
              {isDragOver ? 'Solte a imagem aqui' : 'Carregar imagem'}
            </p>
            <p className="text-[10px] text-zinc-600 mt-1">PNG, JPG ou WEBP · Max. 10 MB</p>
            {error && (
              <div className="mt-3 flex items-center gap-2 text-red-400 text-xs">
                <AlertCircle size={14} /> {error}
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

            {loading && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-emerald-400 text-sm font-medium">
                  <Loader2 className="animate-spin" size={16} />
                  {LOADING_STEPS[loadingStep]}
                </div>
                <div className="w-full bg-white/5 rounded-full h-1">
                  <div
                    className="bg-emerald-500 h-1 rounded-full transition-all duration-700"
                    style={{ width: `${((loadingStep + 1) / LOADING_STEPS.length) * 100}%` }}
                  />
                </div>
                <p className="text-[10px] text-zinc-600">
                  O BIRefNet esta isolando o objeto com precisao cirurgica...
                </p>
              </div>
            )}

            {error && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-red-400 text-xs bg-red-500/10 border border-red-500/20 rounded-lg p-3">
                  <AlertCircle size={14} /> {error}
                </div>
              </div>
            )}

            {!loading && !resultUrl && (
              <button
                onClick={() => void processImage()}
                className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-500/10"
              >
                <Sparkles size={18} /> {error ? 'Tentar novamente' : 'Remover Fundo'}
              </button>
            )}

            {resultUrl && !loading && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-emerald-400 text-xs font-medium">
                  <Sparkles size={14} /> Fundo removido com sucesso
                </div>

                <button
                  onClick={() => void downloadResult()}
                  className="w-full bg-zinc-800 hover:bg-zinc-700 text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2 transition-all border border-white/10"
                >
                  <Download size={20} /> Download PNG
                </button>

                <button
                  onClick={() => void processImage()}
                  className="w-full bg-white/5 hover:bg-white/10 text-zinc-400 text-xs font-medium py-2 rounded-lg flex items-center justify-center gap-2 border border-white/10"
                >
                  <RefreshCcw size={13} /> Tentar novamente
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex-1 bg-black p-4 grid grid-cols-1 md:grid-cols-2 gap-4 overflow-auto md:overflow-hidden">
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

        <div className="relative min-h-[280px] md:min-h-0 border border-white/5 rounded-2xl bg-checkerboard overflow-hidden flex items-center justify-center">
          <div className="absolute top-3 left-3 z-10 flex items-center gap-2">
            <div className="bg-black/50 backdrop-blur-md px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider text-zinc-400 border border-white/10">
              Fundo Removido
            </div>
            {resultUrl && !loading && (
              <div className="bg-emerald-500/20 backdrop-blur-md px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider text-emerald-400 border border-emerald-500/30">
                ✦ BIRefNet AI
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
          {resultUrl && (
            <img src={resultUrl} alt="Fundo removido" className="max-h-full max-w-full object-contain select-none p-4" draggable={false} />
          )}
          {!resultUrl && !loading && (
            <div className="flex flex-col items-center gap-2 text-zinc-700">
              <Sparkles size={32} />
              <p className="text-xs">Aguardando processamento</p>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
