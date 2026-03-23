import React, { useState, useRef } from 'react';
import {
  Sparkles,
  Upload,
  Download,
  RefreshCcw,
  Loader2,
  AlertCircle,
  Settings2,
} from 'lucide-react';
import { motion } from 'motion/react';
import { generateMatrixAPI, retouchMatrixAPI } from '../services/geminiService';
import { validateImageFile } from '../utils/fileValidation';

export default function ModuleEstilo() {
  const [file, setFile] = useState<File | null>(null);
  const [originalUrl, setOriginalUrl] = useState<string | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [customPrompt, setCustomPrompt] = useState('');
  const [retouchPrompt, setRetouchPrompt] = useState('');
  const [error, setError] = useState<string | null>(null);

  const objectUrlRef = useRef<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    return () => {
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    };
  }, []);

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const validationError = validateImageFile(f);
    if (validationError) {
      setError(validationError);
      return;
    }
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    const url = URL.createObjectURL(f);
    objectUrlRef.current = url;
    setFile(f);
    setOriginalUrl(url);
    setResultUrl(null);
    setError(null);
  };

  const handleReset = () => {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
    setFile(null);
    setOriginalUrl(null);
    setResultUrl(null);
    setError(null);
    setCustomPrompt('');
    setRetouchPrompt('');
    if (inputRef.current) inputRef.current.value = '';
  };

  const generateMatrix = async () => {
    if (!file) return;
    setLoading(true);
    setError(null);
    try {
      const result = await generateMatrixAPI(file, customPrompt || undefined);
      setResultUrl(result);
    } catch (err: any) {
      setError(err.message ?? 'Erro ao gerar matriz. Tente novamente.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const applyRetouch = async () => {
    if (!resultUrl || !retouchPrompt) return;
    setLoading(true);
    setError(null);
    try {
      const result = await retouchMatrixAPI(resultUrl, retouchPrompt);
      setResultUrl(result);
      setRetouchPrompt('');
    } catch (err: any) {
      setError(err.message ?? 'Erro ao retocar matriz. Tente novamente.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="flex-1 flex overflow-hidden"
    >
      {/* Left Panel: Workspace */}
      <div className="flex-1 flex flex-col p-6 overflow-hidden">
        <header className="mb-6">
          <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Sparkles size={22} className="text-emerald-400" /> Estúdio de Estilo IA
          </h2>
          <p className="text-zinc-500 text-sm">
            Converta fotos em matrizes de Pontilhismo (Stipple) 1-bit de alta fidelidade.
          </p>
        </header>

        <div className="flex-1 flex flex-col gap-4 overflow-hidden">
          {!originalUrl ? (
            <div className="flex-1 border-2 border-dashed border-white/10 rounded-2xl flex flex-col items-center justify-center bg-white/[0.02] hover:bg-white/[0.04] transition-colors group cursor-pointer relative">
              <input
                ref={inputRef}
                type="file"
                accept=".png,.jpg,.jpeg,.webp"
                onChange={handleUpload}
                className="absolute inset-0 opacity-0 cursor-pointer"
              />
              <div className="p-4 bg-emerald-500/10 rounded-full text-emerald-400 group-hover:scale-110 transition-transform">
                <Upload size={32} />
              </div>
              <p className="mt-4 font-medium">Upload da Imagem Base</p>
              <p className="text-xs text-zinc-500 mt-1">PNG, JPG ou WEBP · Máx. 10 MB</p>
              {error && (
                <div className="mt-4 bg-red-500/10 border border-red-500/20 px-4 py-2 rounded-lg flex items-center gap-2 text-red-400 text-sm">
                  <AlertCircle size={16} /> {error}
                </div>
              )}
            </div>
          ) : (
            <div className="flex-1 flex flex-col gap-4 overflow-hidden">
              <div className="flex items-center justify-between">
                <button
                  onClick={handleReset}
                  className="text-xs font-medium text-zinc-500 hover:text-zinc-300 flex items-center gap-1"
                >
                  <RefreshCcw size={14} /> Novo Upload
                </button>
              </div>

              <div className="flex-1 relative border border-white/5 rounded-2xl bg-white overflow-hidden flex items-center justify-center">
                {loading && (
                  <div className="absolute inset-0 z-20 bg-black/60 flex flex-col items-center justify-center gap-4">
                    <Loader2 className="animate-spin text-emerald-400" size={48} />
                    <p className="text-sm font-medium text-emerald-400 animate-pulse">Gerando Matriz...</p>
                  </div>
                )}
                {resultUrl ? (
                  <img src={resultUrl} alt="Matrix" className="max-h-full max-w-full object-contain" />
                ) : (
                  <img
                    src={originalUrl}
                    alt="Original"
                    className="max-h-full max-w-full object-contain opacity-50 grayscale"
                  />
                )}
              </div>

              {error && (
                <div className="bg-red-500/10 border border-red-500/20 p-3 rounded-lg flex items-center gap-3 text-red-400 text-sm">
                  <AlertCircle size={18} /> {error}
                </div>
              )}

              {resultUrl && (
                <div className="bg-[#1a1a1a] p-4 rounded-xl border border-white/5 flex flex-col gap-3">
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-zinc-500">
                    <RefreshCcw size={14} /> Retocar Imagem
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={retouchPrompt}
                      onChange={e => setRetouchPrompt(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && applyRetouch()}
                      placeholder="Ex: 'Aumentar contraste no rosto', 'Remover ruído no fundo'..."
                      className="flex-1 bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-500/50 transition-colors"
                    />
                    <button
                      onClick={applyRetouch}
                      disabled={loading || !retouchPrompt}
                      className="bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-bold transition-colors"
                    >
                      Aplicar
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Right Panel: Configs */}
      <div className="w-80 border-l border-white/5 bg-[#111111] p-6 flex flex-col gap-6">
        <div className="flex items-center gap-2 text-zinc-400 font-bold text-xs uppercase tracking-widest">
          <Settings2 size={16} /> Configurações
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-xs font-medium text-zinc-500">Prompt Personalizado (Opcional)</label>
            <textarea
              value={customPrompt}
              onChange={e => setCustomPrompt(e.target.value)}
              placeholder="Descreva ajustes finos no estilo..."
              className="w-full h-32 bg-black/40 border border-white/10 rounded-xl p-3 text-sm focus:outline-none focus:border-emerald-500/50 transition-colors resize-none"
            />
          </div>

          <button
            onClick={generateMatrix}
            disabled={loading || !file}
            className="w-full bg-emerald-500 hover:bg-emerald-400 disabled:bg-emerald-500/50 text-black font-bold py-3 rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-500/10"
          >
            {loading ? <Loader2 className="animate-spin" size={20} /> : <Sparkles size={20} />}
            Gerar Matriz
          </button>

          {resultUrl && (
            <button
              onClick={() => {
                const link = document.createElement('a');
                link.href = resultUrl;
                link.download = `matriz_laser_${Date.now()}.png`;
                link.click();
              }}
              className="w-full bg-white/5 hover:bg-white/10 text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2 transition-all border border-white/10"
            >
              <Download size={20} /> Download Matriz
            </button>
          )}
        </div>

        <div className="mt-auto bg-emerald-500/5 border border-emerald-500/10 p-4 rounded-xl">
          <h4 className="text-xs font-bold text-emerald-400 uppercase mb-2">Dica Pro</h4>
          <p className="text-[11px] text-zinc-400 leading-relaxed">
            O estilo de Pontilhismo (Stipple) é ideal para Fiber Laser. Ele evita áreas sólidas de preto que podem
            superaquecer o metal, garantindo uma gravação leve, arejada e com detalhes precisos.
          </p>
        </div>
      </div>
    </motion.div>
  );
}
