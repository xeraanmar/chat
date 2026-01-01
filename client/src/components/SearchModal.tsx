import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, X, User, MessageCircle } from 'lucide-react';

interface SearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectUser: (user: any) => void;
}

export default function SearchModal({ isOpen, onClose, onSelectUser }: SearchModalProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (query.length < 3) {
      setResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const token = localStorage.getItem('token');
        const res = await fetch(`/api/users/search?query=${encodeURIComponent(query)}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          setResults(data);
        }
      } catch (error) {
        console.error('Search failed:', error);
      } finally {
        setLoading(false);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [query]);

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="bg-[#17212b] w-full max-w-md rounded-xl shadow-2xl overflow-hidden border border-white/10"
          >
            <div className="p-4 border-b border-white/5 flex items-center gap-3">
              <Search className="w-5 h-5 text-gray-400" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search users by name or phone..."
                className="flex-1 bg-transparent text-white placeholder-gray-500 focus:outline-none"
                autoFocus
              />
              <button onClick={onClose} className="text-gray-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="max-h-[60vh] overflow-y-auto custom-scrollbar">
              {loading ? (
                <div className="p-8 text-center text-gray-500">Searching...</div>
              ) : results.length > 0 ? (
                results.map((user) => (
                  <div
                    key={user.id}
                    onClick={() => onSelectUser(user)}
                    className="flex items-center gap-3 p-3 hover:bg-[#202b36] cursor-pointer transition-colors"
                  >
                    <div 
                      className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold"
                      style={{ backgroundColor: user.color || '#3b82f6' }}
                    >
                      {user.firstName?.[0] || user.username?.[0] || '?'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="text-white font-medium truncate">
                        {user.firstName} {user.lastName}
                      </h4>
                      <p className="text-sm text-gray-400 truncate">
                        @{user.username || user.phoneNumber}
                      </p>
                    </div>
                    <MessageCircle className="w-5 h-5 text-blue-400" />
                  </div>
                ))
              ) : query.length >= 3 ? (
                <div className="p-8 text-center text-gray-500">No users found</div>
              ) : (
                <div className="p-8 text-center text-gray-500">
                  Type at least 3 characters to search
                </div>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
