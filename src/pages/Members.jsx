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

  if (loading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 animate-spin text-indigo-500" /></div>;
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight">Members</h1>
          <p className="text-gray-400 mt-1">Manage club members and view their earnings.</p>
        </div>
        <button
          onClick={() => setIsModalOpen(true)}
          className="bg-[var(--color-accent-indigo)] hover:bg-indigo-500 text-white px-4 py-2 rounded-lg font-medium flex items-center gap-2 transition-colors"
        >
          <Plus className="w-5 h-5" />
          Add Member
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {members.map(member => {
          const stats = getMemberStats(member.id);
          return (
            <div key={member.id} className="bg-[var(--color-dark-surface)] border border-[var(--color-dark-border)] rounded-xl p-6 shadow-sm flex flex-col">
              <div className="flex justify-between items-start mb-4">
                <h3 className="text-xl font-semibold text-white">{member.name}</h3>
                <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                  member.role === 'dev' ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' :
                  member.role === 'outreach' ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20' :
                  'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                }`}>
                  {member.role.toUpperCase()}
                </span>
              </div>
              
              <div className="space-y-3 flex-1 mb-6">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Outreach Earned</span>
                  <span className="text-white font-medium">{formatCurrency(stats.outreachEarned)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Dev Earned</span>
                  <span className="text-white font-medium">{formatCurrency(stats.devEarned)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Transport</span>
                  <span className="text-white font-medium">{formatCurrency(stats.transportReimbursed)}</span>
                </div>
              </div>

              <div className="pt-4 border-t border-[var(--color-dark-border)] flex justify-between items-center">
                <span className="text-sm text-gray-400">Pending</span>
                <span className={`font-bold ${stats.pendingAmount > 0 ? 'text-amber-500' : 'text-gray-500'}`}>
                  {formatCurrency(stats.pendingAmount)}
                </span>
              </div>
            </div>
          );
        })}
        {members.length === 0 && (
          <div className="col-span-full py-12 text-center text-gray-500 border border-dashed border-[var(--color-dark-border)] rounded-xl">
            No members found. Add one to get started.
          </div>
        )}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-[var(--color-dark-surface)] border border-[var(--color-dark-border)] rounded-xl w-full max-w-md shadow-2xl overflow-hidden">
            <div className="p-6 border-b border-[var(--color-dark-border)] flex justify-between items-center">
              <h2 className="text-xl font-bold text-white">Add New Member</h2>
              <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-white transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleAddMember} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Name</label>
                <input
                  required
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  className="w-full bg-[var(--color-dark-bg)] border border-[var(--color-dark-border)] rounded-lg px-4 py-2 text-white focus:ring-1 focus:ring-[var(--color-accent-indigo)] outline-none"
                  placeholder="e.g. Hriday"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Role</label>
                <select
                  value={role}
                  onChange={e => setRole(e.target.value)}
                  className="w-full bg-[var(--color-dark-bg)] border border-[var(--color-dark-border)] rounded-lg px-4 py-2 text-white focus:ring-1 focus:ring-[var(--color-accent-indigo)] outline-none"
                >
                  <option value="outreach">Outreach</option>
                  <option value="dev">Dev</option>
                  <option value="both">Both</option>
                </select>
              </div>
              <div className="pt-4 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-lg font-medium text-gray-400 hover:text-white transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="bg-[var(--color-accent-indigo)] hover:bg-indigo-500 disabled:opacity-50 text-white px-4 py-2 rounded-lg font-medium transition-colors"
                >
                  {isSubmitting ? 'Saving...' : 'Save Member'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
