import { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { Plus, Loader2, X } from 'lucide-react';
import { formatCurrency } from '../lib/utils';

export default function Members() {
  const [members, setMembers] = useState([]);
  const [payouts, setPayouts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Form state
  const [name, setName] = useState('');
  const [role, setRole] = useState('outreach');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isAdmin = sessionStorage.getItem('role') === 'admin';

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    try {
      const [membersRes, payoutsRes] = await Promise.all([
        supabase.from('members').select('*').order('created_at', { ascending: false }),
        supabase.from('payouts').select('*')
      ]);

      if (membersRes.error) throw membersRes.error;
      if (payoutsRes.error) throw payoutsRes.error;

      setMembers(membersRes.data || []);
      setPayouts(payoutsRes.data || []);
    } catch (err) {
      console.error("Error fetching data:", err);
    } finally {
      setLoading(false);
    }
  }

  async function handleAddMember(e) {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const { error } = await supabase.from('members').insert([{ name, role }]);
      if (error) throw error;
      setIsModalOpen(false);
      setName('');
      setRole('outreach');
      fetchData();
    } catch (err) {
      console.error("Error adding member:", err);
      alert(`Failed to add member: ${err.message || err.details || JSON.stringify(err)}`);
    } finally {
      setIsSubmitting(false);
    }
  }

  const getMemberStats = (memberId) => {
    const memberPayouts = payouts.filter(p => p.member_id === memberId);
    
    let outreachEarned = 0;
    let devEarned = 0;
    let transportReimbursed = 0;
    let pendingAmount = 0;

    memberPayouts.forEach(p => {
      if (!p.paid) {
        pendingAmount += Number(p.amount);
      } else {
        if (p.payout_type === 'outreach_cut') outreachEarned += Number(p.amount);
        if (p.payout_type === 'dev_cut') devEarned += Number(p.amount);
        if (p.payout_type === 'transport') transportReimbursed += Number(p.amount);
      }
    });

    return { outreachEarned, devEarned, transportReimbursed, pendingAmount };
  };

  const totalPayouts = payouts.filter(p => p.paid).reduce((sum, p) => sum + Number(p.amount), 0);
  const totalPending = payouts.filter(p => !p.paid).reduce((sum, p) => sum + Number(p.amount), 0);
  const totalReimbursements = payouts.filter(p => p.paid && p.payout_type === 'transport').reduce((sum, p) => sum + Number(p.amount), 0);
  const avgPerMember = members.length > 0 ? (totalPayouts / members.length) : 0;

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center h-full">
        <span className="material-symbols-outlined text-primary text-[48px] animate-spin">sync</span>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full relative">
      {/* TopNavBar Anchor */}
      <header className="flex justify-between items-center w-full px-[var(--spacing-margin-page)] py-[var(--spacing-stack-md)] bg-surface border-b border-outline-variant shrink-0 z-40 relative">
        <div className="flex items-center gap-4">
          <h2 className="font-headline-md text-headline-md font-bold text-primary">Members</h2>
          <span className="bg-surface-container-high text-on-surface-variant px-2 py-0.5 rounded text-label-sm font-bold tracking-wider">Active {members.length}</span>
        </div>
        <div className="flex items-center gap-4">
          <div className="relative group hidden md:block">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-[18px]">search</span>
            <input 
              className="bg-surface-container-low border border-outline-variant text-body-sm rounded-lg pl-10 pr-4 py-2 w-64 focus:outline-none focus:border-primary transition-colors text-on-surface placeholder:text-on-surface-variant" 
              placeholder="Search members..." 
              type="text"
            />
          </div>
          {isAdmin && (
            <button 
              onClick={() => setIsModalOpen(true)}
              className="bg-primary text-on-primary font-bold px-6 py-2.5 rounded-lg text-label-md hover:opacity-90 transition-all flex items-center active:scale-95 tracking-wider uppercase"
            >
              <span className="material-symbols-outlined mr-2 text-[18px]">person_add</span>
              Add Member
            </button>
          )}
        </div>
      </header>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col">
        <div className="p-[var(--spacing-margin-page)] max-w-[var(--spacing-container-max)] mx-auto w-full flex-1">
          
          {/* Filters and Quick Actions */}
          <div className="flex flex-wrap items-center gap-4 mb-8">
            <button className="bg-surface-container-high border border-outline-variant text-on-surface px-4 py-1.5 rounded-full text-label-md hover:bg-surface-variant transition-colors flex items-center uppercase tracking-wider font-bold">
              Filter by Role <span className="material-symbols-outlined ml-2 text-[18px]">expand_more</span>
            </button>
            <button className="bg-surface-container-high border border-outline-variant text-on-surface px-4 py-1.5 rounded-full text-label-md hover:bg-surface-variant transition-colors flex items-center uppercase tracking-wider font-bold">
              Sorted by Name <span className="material-symbols-outlined ml-2 text-[18px]">sort</span>
            </button>
            <div className="ml-auto flex items-center gap-2">
              <button className="p-2 bg-surface-container-highest text-primary rounded-lg active:scale-95 transition-transform">
                <span className="material-symbols-outlined">grid_view</span>
              </button>
              <button className="p-2 text-on-surface-variant hover:bg-surface-container rounded-lg active:scale-95 transition-transform">
                <span className="material-symbols-outlined">list</span>
              </button>
            </div>
          </div>

          {/* Bento Grid / Cards Layout */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {members.map(member => {
              const stats = getMemberStats(member.id);
              
              let roleBadgeClass = "bg-primary/10 text-primary";
              if (member.role === 'outreach') roleBadgeClass = "bg-secondary/10 text-secondary";
              else if (member.role === 'both') roleBadgeClass = "bg-on-surface-variant/10 text-on-surface-variant";

              return (
                <div key={member.id} className="bg-surface-container-low border border-outline-variant p-5 rounded-xl hover:border-primary/50 transition-all group relative overflow-hidden">
                  <div className="flex justify-between items-start mb-4">
                    <div className="flex items-center space-x-3">
                      <div className="w-12 h-12 rounded-full border-2 border-outline-variant group-hover:border-primary transition-colors bg-surface-container-high flex items-center justify-center font-bold text-lg text-on-surface uppercase">
                        {member.name.charAt(0)}
                      </div>
                      <div>
                        <h3 className="text-body-lg font-bold text-on-surface">{member.name}</h3>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded ${roleBadgeClass} text-[10px] font-bold uppercase tracking-wider`}>
                          {member.role}
                        </span>
                      </div>
                    </div>
                    {isAdmin && (
                      <button 
                        className="text-on-surface-variant hover:text-on-surface transition-colors"
                        onClick={() => alert("Edit member coming soon")}
                      >
                        <span className="material-symbols-outlined text-[20px]">more_horiz</span>
                      </button>
                    )}
                  </div>
                  
                  <div className="space-y-3 mt-6">
                    <div className="flex justify-between items-center text-body-sm">
                      <span className="text-on-surface-variant">Outreach Earned</span>
                      <span className="font-bold text-on-surface">{formatCurrency(stats.outreachEarned)}</span>
                    </div>
                    <div className="flex justify-between items-center text-body-sm">
                      <span className="text-on-surface-variant">Dev Earned</span>
                      <span className="font-bold text-on-surface">{formatCurrency(stats.devEarned)}</span>
                    </div>
                    <div className="flex justify-between items-center text-body-sm">
                      <span className="text-on-surface-variant">Transport</span>
                      <span className="font-bold text-on-surface">{formatCurrency(stats.transportReimbursed)}</span>
                    </div>
                    <div className="pt-3 border-t border-outline-variant flex justify-between items-center text-body-sm">
                      <span className="text-on-surface-variant font-bold uppercase tracking-wider text-[10px]">Pending Payment</span>
                      <span className={`font-bold ${stats.pendingAmount > 0 ? 'text-tertiary' : 'text-on-surface-variant opacity-50'}`}>
                        {formatCurrency(stats.pendingAmount)}
                      </span>
                    </div>
                  </div>
                  
                  <div className="mt-5 flex gap-2">
                    <button 
                      className="flex-1 py-2 bg-surface-container-high text-label-sm font-bold rounded hover:bg-surface-variant transition-colors uppercase tracking-wider text-on-surface"
                      onClick={() => alert("Profile view coming soon")}
                    >
                      View Profile
                    </button>
                    {isAdmin && (
                      <button 
                        className="px-3 py-2 bg-surface-container-high text-primary rounded hover:bg-primary/10 transition-colors"
                        onClick={() => alert("Payment feature coming soon")}
                      >
                        <span className="material-symbols-outlined text-[18px]">payments</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}

            {members.length === 0 && isAdmin && (
              <div className="col-span-full border-2 border-dashed border-outline-variant p-10 rounded-xl flex flex-col items-center justify-center text-on-surface-variant hover:border-primary hover:text-primary transition-all cursor-pointer bg-surface-container-lowest/50 group" onClick={() => setIsModalOpen(true)}>
                <div className="w-12 h-12 rounded-full border-2 border-dashed border-outline-variant group-hover:border-primary flex items-center justify-center mb-3 transition-colors">
                  <span className="material-symbols-outlined">add</span>
                </div>
                <span className="font-label-md uppercase tracking-wider font-bold">Register Member</span>
              </div>
            )}
          </div>
        </div>

        {/* Summary Statistics Footer */}
        <div className="px-[var(--spacing-margin-page)] py-6 bg-surface-container-low border-t border-outline-variant mt-8 shrink-0">
          <div className="max-w-[var(--spacing-container-max)] mx-auto grid grid-cols-2 md:grid-cols-4 gap-8">
            <div>
              <p className="text-label-sm text-on-surface-variant uppercase tracking-wider mb-1">Total Payouts</p>
              <p className="text-headline-sm font-bold text-on-surface">{formatCurrency(totalPayouts)}</p>
            </div>
            <div>
              <p className="text-label-sm text-on-surface-variant uppercase tracking-wider mb-1">Total Pending</p>
              <p className="text-headline-sm font-bold text-tertiary">{formatCurrency(totalPending)}</p>
            </div>
            <div>
              <p className="text-label-sm text-on-surface-variant uppercase tracking-wider mb-1">Average/Member</p>
              <p className="text-headline-sm font-bold text-on-surface">{formatCurrency(avgPerMember)}</p>
            </div>
            <div>
              <p className="text-label-sm text-on-surface-variant uppercase tracking-wider mb-1">Reimbursements</p>
              <p className="text-headline-sm font-bold text-secondary">{formatCurrency(totalReimbursements)}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Add Member Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-surface border border-outline-variant rounded-xl w-full max-w-md shadow-2xl overflow-hidden animate-in zoom-in duration-200">
            <div className="p-6 border-b border-outline-variant flex justify-between items-center bg-surface-container-low">
              <h2 className="text-headline-sm font-bold text-primary">Add New Member</h2>
              <button onClick={() => setIsModalOpen(false)} className="text-on-surface-variant hover:text-primary transition-colors p-1 rounded-full hover:bg-surface-container">
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>
            <form onSubmit={handleAddMember} className="p-6 space-y-5">
              <div>
                <label className="block font-label-md text-on-surface-variant mb-2">MEMBER NAME</label>
                <input
                  required
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  className="w-full bg-background border border-outline-variant rounded-lg px-4 py-2 text-on-surface focus:ring-1 focus:ring-primary outline-none text-body-md"
                  placeholder="e.g. Hriday"
                />
              </div>
              <div>
                <label className="block font-label-md text-on-surface-variant mb-2">PRIMARY ROLE</label>
                <select
                  value={role}
                  onChange={e => setRole(e.target.value)}
                  className="w-full bg-background border border-outline-variant rounded-lg px-4 py-2 text-on-surface focus:ring-1 focus:ring-primary outline-none text-body-md"
                >
                  <option value="outreach">Outreach</option>
                  <option value="dev">Dev</option>
                  <option value="both">Both</option>
                </select>
              </div>
              <div className="pt-6 flex justify-end gap-3 border-t border-outline-variant mt-6">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-6 py-2.5 rounded-lg font-label-md text-on-surface font-bold border border-outline-variant hover:bg-surface-container transition-colors uppercase tracking-wider"
                >
                  CANCEL
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="bg-primary hover:bg-primary/90 disabled:opacity-50 text-on-primary px-6 py-2.5 rounded-lg font-label-md font-bold transition-colors uppercase tracking-wider flex items-center gap-2"
                >
                  {isSubmitting ? (
                    <><span className="material-symbols-outlined animate-spin text-[16px]">sync</span> SAVING...</>
                  ) : (
                    'SAVE MEMBER'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
