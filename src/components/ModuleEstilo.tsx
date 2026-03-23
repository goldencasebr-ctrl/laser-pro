import { Sparkles } from 'lucide-react';
import { motion } from 'motion/react';

export default function ModuleEstilo() {
  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="flex-1 flex items-center justify-center"
    >
      <div className="text-center space-y-3">
        <div className="p-4 bg-emerald-500/10 rounded-full text-emerald-400 inline-flex">
          <Sparkles size={32} />
        </div>
        <p className="font-medium text-zinc-300">Em breve</p>
        <p className="text-xs text-zinc-600">Este módulo está em desenvolvimento.</p>
      </div>
    </motion.div>
  );
}
