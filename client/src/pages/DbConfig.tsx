import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Database, Check, AlertTriangle, Server } from 'lucide-react';

export default function DbConfig() {
  const [url, setUrl] = useState('');
  const [status, setStatus] = useState<{ connected: boolean; error: string | null; strategy: string } | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch('/api/debug/db')
      .then(res => res.json())
      .then(data => setStatus(data.db));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch('/api/debug/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      alert(data.message);
      window.location.reload();
    } catch (err) {
      alert('Failed to update config');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-black flex items-center justify-center p-4 font-sans text-white">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-2xl bg-zinc-900 border border-zinc-800 rounded-2xl p-8 shadow-2xl"
      >
        <div className="flex items-center gap-4 mb-8">
          <div className="w-12 h-12 bg-purple-500/20 rounded-xl flex items-center justify-center">
            <Database className="w-6 h-6 text-purple-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Database Configuration</h1>
            <p className="text-zinc-400">Manually override connection settings</p>
          </div>
        </div>

        {status && (
          <div className={`mb-8 p-4 rounded-xl border ${status.connected ? 'bg-green-500/10 border-green-500/20' : 'bg-red-500/10 border-red-500/20'}`}>
            <div className="flex items-center gap-3 mb-2">
              {status.connected ? <Check className="w-5 h-5 text-green-400" /> : <AlertTriangle className="w-5 h-5 text-red-400" />}
              <span className={`font-bold ${status.connected ? 'text-green-400' : 'text-red-400'}`}>
                {status.connected ? 'Connected Successfully' : 'Connection Failed'}
              </span>
            </div>
            {!status.connected && (
              <p className="text-xs font-mono text-red-300/80 break-all bg-black/20 p-2 rounded">
                {status.error}
              </p>
            )}
            {status.connected && (
              <p className="text-xs text-green-300/80">
                Strategy: {status.strategy}
              </p>
            )}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-zinc-400 mb-2">
              Database Connection URL
            </label>
            <div className="relative">
              <Server className="absolute left-4 top-3.5 w-5 h-5 text-zinc-500" />
              <input
                type="text"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="postgresql://user:password@host:port/database?sslmode=no-verify"
                className="w-full bg-black border border-zinc-700 rounded-xl pl-12 pr-4 py-3 text-white placeholder-zinc-600 focus:outline-none focus:border-purple-500 transition-colors font-mono text-sm"
              />
            </div>
            <p className="text-xs text-zinc-500 mt-2">
              Copy the "Connection URL" from your Railway Database dashboard and paste it here.
              Add <code>?sslmode=no-verify</code> to the end if needed.
            </p>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-purple-600 hover:bg-purple-500 text-white font-bold py-3 rounded-xl transition-all disabled:opacity-50"
          >
            {loading ? 'Connecting...' : 'Connect Database'}
          </button>
        </form>
      </motion.div>
    </div>
  );
}
