import { NavLink, Outlet } from 'react-router-dom';
import { LayoutDashboard, FolderKanban, Users, Wallet, LogOut } from 'lucide-react';

export default function Layout() {
  const handleLogout = () => {
    sessionStorage.removeItem('authenticated');
    window.location.reload();
  };

  const navItems = [
    { name: 'Dashboard', path: '/', icon: LayoutDashboard },
    { name: 'Projects', path: '/projects', icon: FolderKanban },
    { name: 'Members', path: '/members', icon: Users },
    { name: 'Club Fund', path: '/fund', icon: Wallet },
  ];

  return (
    <div className="min-h-screen flex bg-[var(--color-dark-bg)] text-gray-100">
      {/* Sidebar */}
      <aside className="w-64 bg-[var(--color-dark-surface)] border-r border-[var(--color-dark-border)] flex flex-col fixed h-full z-10">
        <div className="p-6 border-b border-[var(--color-dark-border)]">
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-3">
            <span className="bg-[var(--color-accent-indigo)] w-8 h-8 rounded-lg flex items-center justify-center text-sm font-black">/</span>
            ORI Tracker
          </h1>
        </div>
        
        <nav className="flex-1 p-4 space-y-1">
          {navItems.map((item) => (
            <NavLink
              key={item.name}
              to={item.path}
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-3 rounded-lg font-medium transition-colors ${
                  isActive
                    ? 'bg-indigo-600/10 text-indigo-400'
                    : 'text-gray-400 hover:bg-[#2a2a2a] hover:text-white'
                }`
              }
            >
              <item.icon className="w-5 h-5" />
              {item.name}
            </NavLink>
          ))}
        </nav>

        <div className="p-4 border-t border-[var(--color-dark-border)]">
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 px-4 py-3 w-full rounded-lg font-medium text-gray-400 hover:bg-[#2a2a2a] hover:text-red-400 transition-colors"
          >
            <LogOut className="w-5 h-5" />
            Lock Session
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 ml-64 min-h-screen">
        <div className="p-8 max-w-7xl mx-auto">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
