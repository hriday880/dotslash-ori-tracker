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
    <div className="flex overflow-hidden h-screen bg-background text-on-background">
      {/* Sidebar */}
      <aside className="h-screen w-64 fixed left-0 top-0 flex flex-col py-[var(--spacing-stack-md)] bg-surface border-r border-outline-variant z-50">
        <div className="px-6 mb-8">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center overflow-hidden shadow-md">
              <img src="/logo.jpg" alt="DotSlash Logo" className="w-full h-full object-cover" />
            </div>
            <div>
              <h1 className="text-headline-sm font-bold text-on-surface">DotSlash ORI</h1>
              <p className="text-[10px] text-on-surface-variant uppercase tracking-widest font-bold">Internal Project Tracker</p>
            </div>
          </div>
        </div>
        
        <nav className="flex-1 px-3 space-y-1">
          {navItems.map((item) => (
            <NavLink
              key={item.name}
              to={item.path}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg group transition-colors ${
                  isActive
                    ? 'text-primary font-bold border-r-2 border-primary bg-surface-container-high rounded-r-none'
                    : 'text-on-surface-variant hover:bg-surface-container'
                }`
              }
            >
              <item.icon className="w-5 h-5" />
              <span className="font-body-md text-body-md">{item.name}</span>
            </NavLink>
          ))}
        </nav>

        <div className="px-6 mt-auto">
          <button
            onClick={handleLogout}
            className="w-full p-3 bg-surface-container hover:bg-surface-container-high rounded-lg flex items-center gap-3 border border-outline-variant transition-colors text-left"
          >
            <div className="w-8 h-8 rounded-full bg-surface-variant flex items-center justify-center text-on-surface-variant">
              <LogOut className="w-4 h-4" />
            </div>
            <div className="flex-1 overflow-hidden">
              <p className="text-body-sm font-bold truncate">Lock Session</p>
              <p className="text-label-sm text-error truncate">Logout</p>
            </div>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="ml-64 flex-1 flex flex-col h-screen overflow-hidden">
        <Outlet />
      </main>
    </div>
  );
}
