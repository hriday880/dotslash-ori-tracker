import { useState, useEffect } from 'react';

export default function PasswordGate({ children }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    const auth = sessionStorage.getItem('authenticated');
    if (auth === 'true') {
      setIsAuthenticated(true);
    }
    setIsChecking(false);
  }, []);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (password === import.meta.env.VITE_APP_PASSWORD) {
      sessionStorage.setItem('authenticated', 'true');
      setIsAuthenticated(true);
      setError('');
    } else {
      setError('Incorrect password');
    }
  };

  if (isChecking) {
    return null; // Don't render until we know the session state
  }

  if (isAuthenticated) {
    return children;
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--color-dark-bg)]">
      <div className="bg-[var(--color-dark-surface)] border border-[var(--color-dark-border)] p-8 rounded-xl shadow-2xl w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white tracking-tight">ORI Tracker</h1>
          <p className="text-gray-400 mt-2">Private Internal System</p>
        </div>
        
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter club password"
              className="w-full bg-[var(--color-dark-bg)] border border-[var(--color-dark-border)] rounded-lg px-4 py-3 text-white focus:outline-none focus:border-[var(--color-accent-indigo)] focus:ring-1 focus:ring-[var(--color-accent-indigo)] transition-colors"
              autoFocus
            />
            {error && <p className="text-red-500 text-sm mt-2">{error}</p>}
          </div>
          
          <button
            type="submit"
            className="w-full bg-[var(--color-accent-indigo)] hover:bg-indigo-500 text-white font-medium py-3 px-4 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-indigo)] focus:ring-offset-2 focus:ring-offset-[var(--color-dark-surface)]"
          >
            Enter
          </button>
        </form>
      </div>
    </div>
  );
}
