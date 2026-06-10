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
    return (
      <div className="flex-1 flex items-center justify-center h-full">
        <span className="material-symbols-outlined text-primary text-[48px] animate-spin">sync</span>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto custom-scrollbar relative">
      {/* Top Navbar Cluster */}
      <header className="flex justify-between items-center w-full px-[var(--spacing-margin-page)] py-[var(--spacing-stack-md)] sticky top-0 bg-background/80 backdrop-blur-md z-40 border-b border-outline-variant/30">
        <div>
          <h2 className="font-headline-md text-headline-md font-bold text-primary">Operational Dashboard</h2>
          <p className="text-body-sm text-on-surface-variant">Real-time status of ORI internal operations</p>
        </div>
      </header>

      <div className="p-[var(--spacing-margin-page)] space-y-8 max-w-[var(--spacing-container-max)] mx-auto">
        {/* Metrics Row */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-[var(--spacing-gutter)]">
          {/* Club Fund Balance */}
          <div className="card-tier-1 p-[var(--spacing-stack-md)] rounded-xl flex flex-col justify-between h-32">
            <div className="flex justify-between items-start">
              <span className="text-label-md text-on-surface-variant uppercase tracking-wider">Club Fund Balance</span>
              <span className="material-symbols-outlined text-secondary">account_balance</span>
            </div>
            <div>
              <p className="font-stat-lg text-stat-lg text-secondary">{formatCurrency(data.fundBalance)}</p>
              <p className="text-body-sm text-secondary/70 flex items-center gap-1">
                <span className="material-symbols-outlined text-xs">trending_up</span>
                Total Balance
              </p>
            </div>
          </div>

          {/* Pending Payouts */}
          <div className="card-tier-1 p-[var(--spacing-stack-md)] rounded-xl flex flex-col justify-between h-32">
            <div className="flex justify-between items-start">
              <span className="text-label-md text-on-surface-variant uppercase tracking-wider">Pending Payouts</span>
              <span className="material-symbols-outlined text-tertiary">payments</span>
            </div>
            <div>
              <p className="font-stat-lg text-stat-lg text-tertiary">{formatCurrency(data.pendingPayoutsTotal)}</p>
              <p className="text-body-sm text-on-surface-variant">{data.pendingPayoutsGrouped.length} members awaiting</p>
            </div>
          </div>

          {/* Active Projects */}
          <div className="card-tier-1 p-[var(--spacing-stack-md)] rounded-xl flex flex-col justify-between h-32">
            <div className="flex justify-between items-start">
              <span className="text-label-md text-on-surface-variant uppercase tracking-wider">Active Projects</span>
              <span className="material-symbols-outlined text-primary">rocket_launch</span>
            </div>
            <div>
              <p className="font-stat-lg text-stat-lg text-on-surface">{data.activeProjectsCount}</p>
              <p className="text-body-sm text-on-surface-variant">In progress</p>
            </div>
          </div>

          {/* Revenue This Month */}
          <div className="card-tier-1 p-[var(--spacing-stack-md)] rounded-xl flex flex-col justify-between h-32">
            <div className="flex justify-between items-start">
              <span className="text-label-md text-on-surface-variant uppercase tracking-wider">Revenue Monthly</span>
              <span className="material-symbols-outlined text-secondary">insights</span>
            </div>
            <div>
              <p className="font-stat-lg text-stat-lg text-secondary">{formatCurrency(data.revenueThisMonth)}</p>
              <p className="text-body-sm text-secondary/70 flex items-center gap-1">
                <span className="material-symbols-outlined text-xs">check_circle</span>
                Current Month
              </p>
            </div>
          </div>
        </div>

        {/* Dashboard Split View */}
        <div className="grid grid-cols-12 gap-[var(--spacing-gutter)]">
          {/* Left: Recent Projects (8 cols) */}
          <section className="col-span-12 lg:col-span-8 card-tier-1 rounded-xl overflow-hidden flex flex-col max-h-[500px]">
            <div className="px-[var(--spacing-margin-page)] py-[var(--spacing-stack-md)] border-b border-outline-variant flex justify-between items-center bg-surface-container-low shrink-0">
              <h3 className="font-headline-sm text-headline-sm text-on-surface">Recent Projects</h3>
              <Link to="/projects" className="text-primary text-label-md hover:underline">View All</Link>
            </div>
            <div className="overflow-x-auto overflow-y-auto custom-scrollbar flex-1">
              <table className="w-full text-left border-collapse">
                <thead className="sticky top-0 bg-surface-container-high z-10">
                  <tr className="text-on-surface-variant uppercase">
                    <th className="p-[var(--spacing-table-cell-padding)] font-label-md">Client Name</th>
                    <th className="p-[var(--spacing-table-cell-padding)] font-label-md">Value</th>
                    <th className="p-[var(--spacing-table-cell-padding)] font-label-md text-center">Status</th>
                    <th className="p-[var(--spacing-table-cell-padding)] font-label-md">Outreach</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/30">
                  {data.recentProjects.length === 0 ? (
                    <tr>
                      <td colSpan="4" className="p-8 text-center text-on-surface-variant">No projects yet.</td>
                    </tr>
                  ) : (
                    data.recentProjects.map(project => (
                      <tr key={project.id} className="hover:bg-surface-container transition-colors group">
                        <td className="p-[var(--spacing-table-cell-padding)] font-body-md text-on-surface">
                          <Link to={`/projects/${project.id}`} className="font-semibold text-white hover:text-primary transition-colors">
                            {project.client_name}
                          </Link>
                        </td>
                        <td className="p-[var(--spacing-table-cell-padding)] font-body-md text-on-surface font-semibold">
                          {formatCurrency(project.deal_value)}
                        </td>
                        <td className="p-[var(--spacing-table-cell-padding)] text-center">
                          <span className={`inline-block px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                            project.status === 'completed' || project.status === 'delivered' ? 'bg-secondary-container/10 text-secondary' :
                            project.status === 'in_dev' ? 'bg-primary-container/10 text-primary' :
                            'bg-tertiary-container/10 text-tertiary'
                          }`}>
                            {project.status.replace('_', ' ')}
                          </span>
                        </td>
                        <td className="p-[var(--spacing-table-cell-padding)] text-on-surface-variant font-body-sm">
                          {project.outreachNames}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>

          {/* Right: Pending Payouts (4 cols) */}
          <section className="col-span-12 lg:col-span-4 card-tier-1 rounded-xl overflow-hidden flex flex-col max-h-[500px]">
            <div className="px-[var(--spacing-margin-page)] py-[var(--spacing-stack-md)] border-b border-outline-variant bg-surface-container-low shrink-0">
              <h3 className="font-headline-sm text-headline-sm text-on-surface">Pending Payouts</h3>
            </div>
            <div className="p-[var(--spacing-gutter)] flex-1 overflow-y-auto custom-scrollbar space-y-4">
              {data.pendingPayoutsGrouped.length === 0 ? (
                <div className="p-8 text-center text-on-surface-variant flex flex-col items-center gap-3">
                  <span className="material-symbols-outlined text-[48px] text-secondary opacity-50">check_circle</span>
                  <p>All members are paid up!</p>
                </div>
              ) : (
                data.pendingPayoutsGrouped.map(group => (
                  <div key={group.memberId} className="flex items-center justify-between p-[var(--spacing-stack-md)] bg-surface-container-high rounded-lg group">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-outline-variant/20 flex items-center justify-center">
                        <span className="material-symbols-outlined text-on-surface-variant">person</span>
                      </div>
                      <div>
                        <p className="font-body-md text-on-surface font-bold truncate max-w-[100px]">{group.memberName}</p>
                        <p className="text-label-sm text-tertiary">{formatCurrency(group.total)}</p>
                      </div>
                    </div>
                    <button
                      onClick={() => handleMarkPaid(group.memberId)}
                      disabled={payingMemberId === group.memberId}
                      className="bg-primary hover:bg-primary-container text-on-primary font-label-md px-3 py-1.5 rounded-lg active:scale-95 transition-transform disabled:opacity-50 flex items-center gap-1"
                    >
                      {payingMemberId === group.memberId ? (
                        <span className="material-symbols-outlined animate-spin text-[16px]">sync</span>
                      ) : (
                        "Mark Paid"
                      )}
                    </button>
                  </div>
                ))
              )}
              
              <div className="mt-6 p-[var(--spacing-stack-md)] rounded-xl bg-primary/10 border border-primary/20 flex gap-4 items-center">
                <span className="material-symbols-outlined text-primary">info</span>
                <p className="text-body-sm text-primary">Make sure to verify deal completions before marking members as paid.</p>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
