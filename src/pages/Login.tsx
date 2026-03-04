import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { useNavigate } from 'react-router-dom';
import { GlassCard } from '../components/ui/GlassCard';
import { GlassButton } from '../components/ui/GlassButton';

export const Login: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const isDev = import.meta.env.DEV;

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      if (isSignUp) {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              username: email.split('@')[0], // Default username
            },
          },
        });
        if (error) throw error;
        alert('Check your email for the confirmation link!');
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        navigate('/');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#111] p-4 relative overflow-hidden">
      {/* Background Elements */}
      <div className="absolute top-0 left-0 w-full h-full opacity-10 pointer-events-none">
        <div className="absolute top-[-10%] right-[-10%] w-[50%] h-[50%] bg-f1-red blur-[150px] rounded-full" />
        <div className="absolute bottom-[-10%] left-[-10%] w-[50%] h-[50%] bg-red-900 blur-[150px] rounded-full" />
      </div>

      <GlassCard className="w-full max-w-md p-8 relative z-10 border-[#333]">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white tracking-wider mb-2">BOX THIS <span className="text-f1-red">LAP</span></h1>
          <p className="text-gray-400">Enter the Paddock</p>
        </div>

        <form onSubmit={handleAuth} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-[#222] border border-[#444] rounded-lg px-4 py-3 text-white focus:outline-none focus:border-f1-red transition-colors"
              placeholder="driver@example.com"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-[#222] border border-[#444] rounded-lg px-4 py-3 text-white focus:outline-none focus:border-f1-red transition-colors"
              placeholder="••••••••"
              required
            />
          </div>

          {error && (
            <div className="p-3 bg-red-900/30 border border-red-800 rounded text-red-200 text-sm">
              {error}
            </div>
          )}

          <GlassButton
            type="submit"
            className="w-full justify-center py-3"
            disabled={loading}
          >
            {loading ? 'Processing...' : isSignUp ? 'Register Account' : 'Login'}
          </GlassButton>
        </form>

        <div className="mt-6 text-center">
          <button
            onClick={() => setIsSignUp(!isSignUp)}
            className="text-sm text-gray-400 hover:text-[#00FFFF] transition-colors"
          >
            {isSignUp ? 'Already have an account? Login' : "Don't have an account? Register"}
          </button>
        </div>
        {isDev && (
          <div className="mt-6">
            <GlassButton
              type="button"
              variant="secondary"
              className="w-full justify-center py-2 text-xs"
              onClick={() => navigate('/race-dev')}
            >
              Launch Dev Race Control
            </GlassButton>
          </div>
        )}
      </GlassCard>
    </div>
  );
};
