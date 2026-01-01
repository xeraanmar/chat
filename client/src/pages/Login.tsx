import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRight, Lock, Phone, MessageCircle, AlertTriangle, RefreshCw } from 'lucide-react';

export default function Login() {
  const [step, setStep] = useState<'phone' | 'otp' | 'profile'>('phone');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [chatId, setChatId] = useState('');
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [dbStatus, setDbStatus] = useState<{ isDbConnected: boolean; dbError: string | null } | null>(null);
  const [fixing, setFixing] = useState(false);
  
  const navigate = useNavigate();

  // Check DB status on mount
  useEffect(() => {
    fetch('/api/status')
      .then(res => res.json())
      .then(data => setDbStatus(data))
      .catch(() => setDbStatus({ isDbConnected: false, dbError: 'Server unreachable' }));
  }, []);

  const handleFix = async () => {
    setFixing(true);
    try {
      const res = await fetch('/api/debug/fix');
      const data = await res.json();
      alert(data.message);
      window.location.reload();
    } catch (e) {
      alert('Fix request failed');
    } finally {
      setFixing(false);
    }
  };

  const handleRequestOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch('/api/auth/request-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber, telegramChatId: chatId }),
      });
      const data = await res.json();
      if (data.success) {
        setStep('otp');
      } else {
        alert(data.error || 'Failed to send OTP');
      }
    } catch (err) {
      alert('Error connecting to server');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch('/api/auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber, code: otp }),
      });
      const data = await res.json();
      if (data.success) {
        localStorage.setItem('token', data.token);
        localStorage.setItem('user', JSON.stringify(data.user));
        if (data.isNewUser) {
          setStep('profile');
        } else {
          navigate('/chat');
        }
      } else {
        alert(data.error || 'Invalid OTP');
      }
    } catch (err) {
      alert('Error verifying OTP');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0e1621] flex items-center justify-center p-4 font-sans text-white">
      <div className="w-full max-w-md bg-[#17212b] rounded-2xl shadow-2xl overflow-hidden">
        <div className="p-8 text-center">
          <div className="w-20 h-20 bg-[#3390ec] rounded-full mx-auto flex items-center justify-center mb-6 shadow-lg">
            <Lock className="w-10 h-10 text-white" />
          </div>
          
          <h2 className="text-2xl font-bold mb-2">
            {step === 'phone' ? 'Sign in to Telegram' : step === 'otp' ? 'Enter Code' : 'Setup Profile'}
          </h2>
          <p className="text-gray-400 text-sm mb-8">
            {step === 'phone' 
              ? 'Please enter your phone number and your Telegram Chat ID to receive the login code.' 
              : step === 'otp' 
              ? `We've sent a code to your Telegram bot.` 
              : 'Enter your details to continue.'}
          </p>

          {/* DB Error Alert */}
          {dbStatus && !dbStatus.isDbConnected && (
            <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-left">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <h3 className="text-red-400 font-medium text-sm mb-1">Database Connection Error</h3>
                  <p className="text-red-400/80 text-xs break-all font-mono bg-black/20 p-2 rounded mb-2">
                    {dbStatus.dbError || 'Unknown connection error'}
                  </p>
                  <button 
                    onClick={handleFix}
                    disabled={fixing}
                    className="w-full py-2 bg-red-500/20 hover:bg-red-500/30 text-red-400 text-xs font-bold rounded-lg transition-colors flex items-center justify-center gap-2"
                  >
                    {fixing ? <RefreshCw className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                    {fixing ? 'Attempting Auto-Fix...' : 'Fix Connection Now'}
                  </button>
                </div>
              </div>
            </div>
          )}

          <AnimatePresence mode="wait">
            {step === 'phone' && (
              <motion.form 
                key="phone"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                onSubmit={handleRequestOTP}
                className="space-y-4"
              >
                <div className="bg-[#0e1621] rounded-xl p-3 flex items-center border border-transparent focus-within:border-[#3390ec] transition-colors">
                  <Phone className="w-5 h-5 text-gray-500 mr-3" />
                  <input 
                    type="tel" 
                    placeholder="Phone Number (e.g. +1234567890)"
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                    className="bg-transparent w-full focus:outline-none text-white placeholder-gray-500"
                    required
                  />
                </div>
                <div className="bg-[#0e1621] rounded-xl p-3 flex items-center border border-transparent focus-within:border-[#3390ec] transition-colors">
                  <MessageCircle className="w-5 h-5 text-gray-500 mr-3" />
                  <input 
                    type="text" 
                    placeholder="Telegram Chat ID (from Bot)"
                    value={chatId}
                    onChange={(e) => setChatId(e.target.value)}
                    className="bg-transparent w-full focus:outline-none text-white placeholder-gray-500"
                    required
                  />
                </div>
                <button 
                  type="submit" 
                  disabled={loading}
                  className="w-full bg-[#3390ec] hover:bg-[#2b7ac9] text-white font-bold py-3 rounded-xl transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {loading ? 'Sending...' : 'Next'} <ArrowRight className="w-5 h-5" />
                </button>
                <p className="text-xs text-gray-500 mt-4">
                  * Send /start to the bot to get your Chat ID.
                </p>
              </motion.form>
            )}

            {step === 'otp' && (
              <motion.form 
                key="otp"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                onSubmit={handleVerifyOTP}
                className="space-y-6"
              >
                <div className="flex justify-center gap-2">
                  <input 
                    type="text" 
                    maxLength={6}
                    placeholder="1 2 3 4 5 6"
                    value={otp}
                    onChange={(e) => setOtp(e.target.value)}
                    className="bg-[#0e1621] text-center text-2xl tracking-widest w-full py-4 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#3390ec] text-white"
                    autoFocus
                  />
                </div>
                <button 
                  type="submit" 
                  disabled={loading}
                  className="w-full bg-[#3390ec] hover:bg-[#2b7ac9] text-white font-bold py-3 rounded-xl transition-all disabled:opacity-50"
                >
                  {loading ? 'Verifying...' : 'Verify Code'}
                </button>
              </motion.form>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
