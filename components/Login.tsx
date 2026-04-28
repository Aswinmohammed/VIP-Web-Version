
import React, { useState } from 'react';
import { Building2, Lock, Loader2, User } from 'lucide-react';

interface LoginProps {
  onLogin: (payload: { tenantCode: string; username: string; password: string }) => Promise<void>;
  isLoading?: boolean;
}

const Login: React.FC<LoginProps> = ({ onLogin, isLoading = false }) => {
  const [tenantCode, setTenantCode] = useState('vip');
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    try {
      await onLogin({
        tenantCode: tenantCode.trim(),
        username: username.trim(),
        password,
      });
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : 'Unable to sign in.');
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-100">
      <div className="w-full max-w-md p-8 space-y-8 bg-white rounded-2xl shadow-lg">
        <div className="text-center">
            <div className="flex justify-center mb-6">
                <img 
                    src="images/Logo.jpg" 
                    alt="VIP Logo" 
                    className="h-24 w-auto object-contain"
                />
            </div>
          <h1 className="mt-4 text-3xl font-bold text-primary-700">VIP Tailors & Fashion Pvt Ltd</h1>
          <p className="mt-2 text-sm text-gray-600">Welcome back! Please login to your account.</p>
        </div>
        <form className="mt-8 space-y-6" onSubmit={handleLogin}>
          <div className="relative">
             <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                <Building2 className="w-5 h-5 text-gray-400" />
            </div>
            <input
              id="tenantCode"
              name="tenantCode"
              type="text"
              autoComplete="organization"
              required
              value={tenantCode}
              onChange={(e) => setTenantCode(e.target.value)}
              className="w-full py-3 pl-10 pr-4 text-gray-900 placeholder-gray-500 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              placeholder="Tenant code"
              disabled={isLoading}
            />
          </div>
          <div className="relative">
             <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                <User className="w-5 h-5 text-gray-400" />
            </div>
            <input
              id="username"
              name="username"
              type="text"
              autoComplete="username"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full py-3 pl-10 pr-4 text-gray-900 placeholder-gray-500 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              placeholder="Username"
              disabled={isLoading}
            />
          </div>
           <div className="relative">
             <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                <Lock className="w-5 h-5 text-gray-400" />
            </div>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full py-3 pl-10 pr-4 text-gray-900 placeholder-gray-500 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              placeholder="Password"
              disabled={isLoading}
            />
          </div>

          {error && <p className="text-sm text-center text-red-500">{error}</p>}

          <div>
            <button
              type="submit"
              disabled={isLoading}
              className="w-full px-4 py-3 text-sm font-semibold text-white bg-primary-600 rounded-md hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 transition-colors duration-300"
            >
              {isLoading ? <span className="inline-flex items-center"><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Signing in...</span> : 'Sign in'}
            </button>
          </div>
        </form>
        <div className="text-center pt-4 border-t border-gray-100">
            <p className="text-xs text-gray-400">Developed by ARM.Aswin - 0778514532</p>
        </div>
      </div>
    </div>
  );
};

export default Login;
