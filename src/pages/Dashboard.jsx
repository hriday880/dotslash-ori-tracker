import { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { Wallet, Clock, Activity, TrendingUp, CheckCircle, Loader2 } from 'lucide-react';
import { formatCurrency, formatDate } from '../lib/utils';
import { Link } from 'react-router-dom';

export default function Dashboard() {
  const [data, setData] = useState({
    fundBalance: 0,
    pendingPayoutsTotal: 0,
    activeProjectsCount: 0,
    revenueThisMonth: 0,
    recentProjects: [],
    pendingPayoutsGrouped: []
  });
  const [loading, setLoading] = useState(true);
  const [payingMemberId, setPayingMemberId] = useState(null);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  async function fetchDashboardData() {
    try {
      const [fundsRes, payoutsRes, projectsRes, membersRes, outreachRes] = await Promise.all([
        supabase.from('fund_transactions').select('*'),
        supabase.from('payouts').select('*').eq('paid', false),
        supabase.from('projects').select('*').order('created_at', { ascending: false }),
        supabase.from('members').select('id, name'),
        supabase.from('project_outreach').select('*')
      ]);

      if (fundsRes.error) throw fundsRes.error;
      if (payoutsRes.error) throw payoutsRes.error;
      if (projectsRes.error) throw projectsRes.error;
      if (membersRes.error) throw membersRes.error;
      if (outreachRes.error) throw outreachRes.error;

      // 1. Club Fund Balance
      const fundBalance = fundsRes.data.reduce((acc, t) => {
        return acc + (t.type === 'inflow' ? Number(t.amount) : -Number(t.amount));
      }, 0);

      // 2. Revenue This Month
      const currentMonth = new Date().getMonth();
      const currentYear = new Date().getFullYear();
      const revenueThisMonth = fundsRes.data
        .filter(t => {
          if (t.type !== 'inflow') return false;
          const d = new Date(t.transaction_date);
          return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
        })
        .reduce((acc, t) => acc + Number(t.amount), 0);

      // 3. Pending Payouts
      const pendingPayoutsTotal = payoutsRes.data.reduce((acc, p) => acc + Number(p.amount), 0);

      // 4. Active Projects Count
      const activeProjectsCount = projectsRes.data.filter(p => p.status !== 'completed').length;

      // 5. Recent Projects (Last 5)
      const outreachData = outreachRes.data || [];
      const recentProjects = projectsRes.data.slice(0, 5).map(p => {
        const pOutreach = outreachData.filter(o => o.project_id === p.id);
        const outreachNames = pOutreach.map(o => {
          const m = membersRes.data.find(mem => mem.id === o.member_id);
          return m ? m.name : 'Unknown';
        }).join(', ');

        return {
          ...p,
          outreachNames: outreachNames || 'None assigned'
        };
      });

      // 6. Grouped Pending Payouts
      const payoutsByMember = {};
      payoutsRes.data.forEach(p => {
        if (!payoutsByMember[p.member_id]) {
          payoutsByMember[p.member_id] = { total: 0, items: [] };
        }
        payoutsByMember[p.member_id].total += Number(p.amount);
        payoutsByMember[p.member_id].items.push(p);
      });

      const pendingPayoutsGrouped = Object.keys(payoutsByMember).map(memberId => {
        const member = membersRes.data.find(m => m.id === memberId);
        return {
          memberId,
          memberName: member?.name || 'Unknown Member',
          total: payoutsByMember[memberId].total,
          count: payoutsByMember[memberId].items.length
        };
      });

      setData({
        fundBalance,
        pendingPayoutsTotal,
        activeProjectsCount,
        revenueThisMonth,
        recentProjects,
        pendingPayoutsGrouped
      });

    } catch (err) {
      console.error("Error fetching dashboard data:", err);
    } finally {
      setLoading(false);
    }
  }

  const handleMarkPaid = async (memberId) => {
    setPayingMemberId(memberId);
    try {
      const { error } = await supabase
        .from('payouts')
        .update({ paid: true, paid_at: new Date().toISOString() })
        .eq('member_id', memberId)
        .eq('paid', false);

      if (error) throw error;
      fetchDashboardData();
    } catch (err) {
      console.error("Error marking payouts as paid:", err);
      alert("Failed to mark as paid");
    } finally {
      setPayingMemberId(null);
    }
  };

  const getStatusColor = (status) => {
    const colors = {
      scouting: 'bg-gray-500/10 text-gray-400 border-gray-500/20',
      confirmed: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
      advance_received: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
      in_dev: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
      delivered: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
      completed: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
    };
    return colors[status] || colors.scouting;
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 animate-spin text-indigo-500" /></div>;
  }

  const StatCard = ({ title, value, icon: Icon, colorClass }) => (
    <div className="bg-[var(--color-dark-surface)] border border-[var(--color-dark-border)] rounded-xl p-6 shadow-sm flex items-center gap-4">
      <div className={`p-4 rounded-lg ${colorClass}`}>
        <Icon className="w-6 h-6" />
      </div>
      <div>
        <p className="text-sm font-medium text-gray-400">{title}</p>
        <p className="text-2xl font-bold text-white mt-1">{value}</p>
      </div>
    </div>
  );

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-white tracking-tight">Dashboard</h1>
        <p className="text-gray-400 mt-1">Overview of club financials and projects.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard 
          title="Club Fund Balance" 
          value={formatCurrency(data.fundBalance)} 
          icon={Wallet} 
          colorClass="bg-emerald-500/10 text-emerald-400" 
        />
        <StatCard 
          title="Pending Payouts" 
          value={formatCurrency(data.pendingPayoutsTotal)} 
          icon={Clock} 
          colorClass="bg-amber-500/10 text-amber-400" 
        />
        <StatCard 
          title="Active Projects" 
          value={data.activeProjectsCount} 
          icon={Activity} 
          colorClass="bg-indigo-500/10 text-indigo-400" 
        />
        <StatCard 
          title="Revenue This Month" 
          value={formatCurrency(data.revenueThisMonth)} 
          icon={TrendingUp} 
          colorClass="bg-blue-500/10 text-blue-400" 
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Recent Projects */}
        <div className="bg-[var(--color-dark-surface)] border border-[var(--color-dark-border)] rounded-xl shadow-sm overflow-hidden flex flex-col">
          <div className="p-6 border-b border-[var(--color-dark-border)] flex justify-between items-center">
            <h2 className="text-lg font-bold text-white">Recent Projects</h2>
            <Link to="/projects" className="text-sm text-indigo-400 hover:text-indigo-300 font-medium">View All</Link>
          </div>
          <div className="divide-y divide-[var(--color-dark-border)] flex-1 overflow-auto">
            {data.recentProjects.length === 0 ? (
              <div className="p-8 text-center text-gray-500">No projects yet.</div>
            ) : (
              data.recentProjects.map(project => (
                <div key={project.id} className="p-4 hover:bg-[#2a2a2a] transition-colors flex justify-between items-center">
                  <div>
                    <Link to={`/projects/${project.id}`} className="font-semibold text-white hover:text-indigo-400 transition-colors">
                      {project.client_name}
                    </Link>
                    <p className="text-sm text-gray-400 mt-1">Outreach: {project.outreachNames}</p>
                  </div>
                  <div className="text-right">
                    <div className="font-medium text-white mb-2">{formatCurrency(project.deal_value)}</div>
                    <span className={`text-xs px-2 py-1 rounded-full border ${getStatusColor(project.status)}`}>
                      {project.status.replace('_', ' ').toUpperCase()}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Pending Payouts */}
        <div className="bg-[var(--color-dark-surface)] border border-[var(--color-dark-border)] rounded-xl shadow-sm overflow-hidden flex flex-col">
          <div className="p-6 border-b border-[var(--color-dark-border)]">
            <h2 className="text-lg font-bold text-white">Pending Payouts</h2>
          </div>
          <div className="divide-y divide-[var(--color-dark-border)] flex-1 overflow-auto">
            {data.pendingPayoutsGrouped.length === 0 ? (
              <div className="p-8 text-center text-gray-500 flex flex-col items-center gap-3">
                <CheckCircle className="w-10 h-10 text-emerald-500 opacity-50" />
                <p>All members are paid up!</p>
              </div>
            ) : (
              data.pendingPayoutsGrouped.map(group => (
                <div key={group.memberId} className="p-6 flex justify-between items-center">
                  <div>
                    <p className="font-semibold text-white text-lg">{group.memberName}</p>
                    <p className="text-sm text-gray-400 mt-1">{group.count} pending item{group.count !== 1 && 's'}</p>
                  </div>
                  <div className="flex items-center gap-6">
                    <span className="font-bold text-amber-500 text-xl">{formatCurrency(group.total)}</span>
                    <button
                      onClick={() => handleMarkPaid(group.memberId)}
                      disabled={payingMemberId === group.memberId}
                      className="bg-emerald-600/10 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-600/20 px-4 py-2 rounded-lg font-medium transition-colors disabled:opacity-50 flex items-center gap-2"
                    >
                      {payingMemberId === group.memberId ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <CheckCircle className="w-4 h-4" />
                      )}
                      Mark Paid
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
