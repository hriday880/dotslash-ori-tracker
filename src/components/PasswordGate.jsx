import { useState } from 'react';

import { supabase } from '../supabaseClient';

export default function PasswordGate({ children }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(false);
  const [isShaking, setIsShaking] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(
    sessionStorage.getItem('authenticated') === 'true'
  );

  const handleSubmit = async (e) => {
    e.preventDefault();
    const correctPassword = "LetMeInBITCH";
    
    setIsChecking(true);
    setError(false);
    
    if (password === correctPassword && username.trim() !== '') {
      try {
        const normalizedUser = username.trim().toLowerCase();
        const actualUsername = username.trim();

        // Check if member exists in DB (case-insensitive)
        const { data: existingMembers, error: fetchError } = await supabase
          .from('members')
          .select('id, name')
          .ilike('name', actualUsername);

        if (fetchError) throw fetchError;

        // If member doesn't exist, insert them
        if (!existingMembers || existingMembers.length === 0) {
          const { error: insertError } = await supabase
            .from('members')
            .insert([{ name: actualUsername, role: 'both' }]);
          
          if (insertError) throw insertError;
        }

        sessionStorage.setItem('authenticated', 'true');
        sessionStorage.setItem('username', actualUsername);
        sessionStorage.setItem('role', normalizedUser === 'hriday' ? 'admin' : 'member');
        setIsAuthenticated(true);
      } catch (err) {
        console.error("Error logging in / creating member:", err);
        setError(true);
        setPassword('');
        setIsShaking(true);
        setTimeout(() => setIsShaking(false), 300);
      }
    } else {
      setError(true);
      setPassword('');
      setIsShaking(true);
      setTimeout(() => setIsShaking(false), 300);
    }
    setIsChecking(false);
  };

  if (isAuthenticated) {
    return children;
  }

  return (
    <main className="relative h-screen w-full flex items-center justify-center bg-[#0f0f0f] text-on-background">
      {/* Background Ambient Effect */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-primary-container opacity-5 blur-[120px]"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-primary opacity-5 blur-[120px]"></div>
      </div>

      {/* Password Gate Card */}
      <div 
        className={`relative z-10 w-full max-w-[400px] p-margin-page bg-[#1a1a1a] border border-outline-variant/30 rounded-lg shadow-2xl transition-all duration-300 ${
          isShaking ? 'translate-x-2' : ''
        }`}
      >
        {/* App Branding */}
        <div className="flex flex-col items-center mb-10 text-center">
          <div className="mb-6 w-16 h-16 rounded-2xl bg-white overflow-hidden shadow-lg shadow-white/10">
            <img src="/logo.jpg" alt="DotSlash Logo" className="w-full h-full object-cover" />
          </div>
          <h1 className="font-headline-md text-headline-md text-on-surface mb-1">DotSlash ORI</h1>
          <p className="font-body-sm text-body-sm text-on-surface-variant tracking-wider uppercase">Internal Project Tracker</p>
        </div>

        {/* Form */}
        <form className="space-y-6" onSubmit={handleSubmit}>
          <div>
            <label className="block font-label-md text-label-md text-on-surface-variant mb-2" htmlFor="username">
              USERNAME
            </label>
            <div className="relative group mb-4">
              <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant transition-colors group-focus-within:text-primary">
                person
              </span>
              <input
                id="username"
                type="text"
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value);
                  setError(false);
                }}
                className={`w-full bg-[#0f0f0f] border text-on-surface px-12 py-3 rounded-lg focus:ring-1 focus:ring-primary focus:border-primary outline-none transition-all placeholder:text-on-surface-variant/30 font-body-md text-body-md ${
                  error ? 'border-error' : 'border-outline-variant/50'
                }`}
                placeholder="Enter username"
              />
            </div>

            <label className="block font-label-md text-label-md text-on-surface-variant mb-2" htmlFor="password">
              ACCESS KEY
            </label>
            <div className="relative group">
              <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant transition-colors group-focus-within:text-primary">
                key
              </span>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setError(false);
                }}
                className={`w-full bg-[#0f0f0f] border text-on-surface px-12 py-3 rounded-lg focus:ring-1 focus:ring-primary focus:border-primary outline-none transition-all placeholder:text-on-surface-variant/30 font-body-md text-body-md ${
                  error ? 'border-error' : 'border-outline-variant/50'
                }`}
                placeholder="Enter password"
              />
            </div>
            
            {/* Error Message */}
            {error && (
              <div className="mt-3 flex items-center gap-2 text-error animate-pulse">
                <span className="material-symbols-outlined text-[16px]">error</span>
                <p className="font-body-sm text-body-sm">Incorrect username or password</p>
              </div>
            )}
          </div>
          
          <button
            type="submit"
            disabled={isChecking}
            className="w-full bg-[#6366f1] hover:bg-[#4f46e5] disabled:opacity-50 text-white py-3 rounded-lg font-label-md text-label-md transition-all active:scale-[0.98] flex items-center justify-center gap-2 shadow-lg shadow-primary-container/10"
          >
            {isChecking ? 'VERIFYING...' : 'ENTER'}
            {!isChecking && <span className="material-symbols-outlined text-[18px]">arrow_forward</span>}
          </button>
        </form>
      </div>
    </main>
  );
}
