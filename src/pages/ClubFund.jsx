import { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { Plus, Loader2, X, Wallet, TrendingUp, TrendingDown } from 'lucide-react';
import { formatCurrency, formatDate } from '../lib/utils';

export default function ClubFund() {
  const [transactions, setTransactions] = useState([]);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form State
  const [type, setType] = useState('inflow');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [transactionDate, setTransactionDate] = useState(new Date().toISOString().split('T')[0]);
  const [coveredBy, setCoveredBy] = useState('');
  const [projectId, setProjectId] = useState('');

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    try {
      const [transRes, projRes] = await Promise.all([
        supabase.from('fund_transactions').select('*, projects(client_name)').order('transaction_date', { ascending: false }).order('created_at', { ascending: false }),
        supabase.from('projects').select('id, client_name').order('created_at', { ascending: false })
      ]);

      if (transRes.error) throw transRes.error;
      if (projRes.error) throw projRes.error;

      // Calculate running balances
      // Transactions are sorted newest first. To calculate running balance, we need to iterate from oldest to newest.
      const reversed = [...(transRes.data || [])].reverse();
      let balance = 0;
      reversed.forEach(t => {
        balance += (t.type === 'inflow' ? Number(t.amount) : -Number(t.amount));
        t.runningBalance = balance;
      });

      setTransactions(reversed.reverse());
      setProjects(projRes.data || []);
    } catch (err) {
      console.error("Error fetching club fund data:", err);
    } finally {
      setLoading(false);
    }
  }

  const currentBalance = transactions.length > 0 ? transactions[0].runningBalance : 0;

  async function handleAddTransaction(e) {
    e.preventDefault();
    setIsSubmitting(true);
    
    try {
      const { error } = await supabase.from('fund_transactions').insert([{
        type,
        amount: Number(amount),
        description,
        transaction_date: transactionDate,
        covered_by: type === 'outflow' ? coveredBy : null,
        project_id: projectId || null
      }]);

      if (error) throw error;

      setIsModalOpen(false);
      // Reset form
      setType('inflow');
      setAmount('');
      setDescription('');
      setTransactionDate(new Date().toISOString().split('T')[0]);
      setCoveredBy('');
      setProjectId('');
      
      fetchData();
    } catch (err) {
      console.error("Error adding transaction:", err);
      alert("Failed to add transaction");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (loading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 animate-spin text-indigo-500" /></div>;
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight">Club Fund</h1>
          <p className="text-gray-400 mt-1">Manage the ledger of all inflows and outflows.</p>
        </div>
        <button
          onClick={() => setIsModalOpen(true)}
          className="bg-[var(--color-accent-indigo)] hover:bg-indigo-500 text-white px-4 py-2 rounded-lg font-medium flex items-center gap-2 transition-colors shadow-lg shadow-indigo-500/20"
        >
          <Plus className="w-5 h-5" />
          Add Transaction
        </button>
      </div>

      <div className="bg-[var(--color-dark-surface)] border border-[var(--color-dark-border)] rounded-xl p-8 mb-8 flex items-center justify-between shadow-sm relative overflow-hidden">
        <div className="absolute right-0 top-0 opacity-[0.03] pointer-events-none transform translate-x-10 -translate-y-10">
          <Wallet className="w-80 h-80 text-white" />
        </div>
        <div className="z-10">
          <p className="text-gray-400 font-medium mb-2 uppercase tracking-wider text-sm">Total Fund Balance</p>
          <h2 className="text-5xl md:text-6xl font-black text-white tracking-tight drop-shadow-sm">
            {formatCurrency(currentBalance)}
          </h2>
        </div>
      </div>

      <div className="bg-[var(--color-dark-surface)] border border-[var(--color-dark-border)] rounded-xl shadow-sm overflow-hidden">
        <div className="p-6 border-b border-[var(--color-dark-border)]">
          <h3 className="text-lg font-bold text-white">Transaction Ledger</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse whitespace-nowrap">
            <thead>
              <tr className="bg-[#1a1a1a] border-b border-[var(--color-dark-border)]">
                <th className="px-6 py-4 text-sm font-semibold text-gray-300">Date</th>
                <th className="px-6 py-4 text-sm font-semibold text-gray-300">Description</th>
                <th className="px-6 py-4 text-sm font-semibold text-gray-300">Type</th>
                <th className="px-6 py-4 text-sm font-semibold text-gray-300 text-right">Amount</th>
                <th className="px-6 py-4 text-sm font-semibold text-gray-300 text-right">Running Balance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-dark-border)]">
              {transactions.length === 0 ? (
                <tr>
                  <td colSpan="5" className="px-6 py-12 text-center text-gray-500">
                    No transactions recorded yet.
                  </td>
                </tr>
              ) : (
                transactions.map(t => (
                  <tr key={t.id} className="hover:bg-[#2a2a2a] transition-colors">
                    <td className="px-6 py-4 text-sm text-gray-400 font-medium">
                      {formatDate(t.transaction_date)}
                    </td>
                    <td className="px-6 py-4">
                      <div className="font-medium text-white">{t.description}</div>
                      <div className="text-xs text-gray-500 mt-1 flex gap-3">
                        {t.projects && <span className="bg-[#0f0f0f] px-2 py-0.5 rounded border border-[#2a2a2a]">Project: {t.projects.client_name}</span>}
                        {t.covered_by && <span className="bg-[#0f0f0f] px-2 py-0.5 rounded border border-[#2a2a2a]">Covered by: {t.covered_by}</span>}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border font-bold tracking-wide w-fit ${
                        t.type === 'inflow' 
                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' 
                          : 'bg-red-500/10 text-red-400 border-red-500/20'
                      }`}>
                        {t.type === 'inflow' ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                        {t.type.toUpperCase()}
                      </span>
                    </td>
                    <td className={`px-6 py-4 text-right font-medium ${t.type === 'inflow' ? 'text-emerald-400' : 'text-red-400'}`}>
                      {t.type === 'inflow' ? '+' : '-'}{formatCurrency(t.amount)}
                    </td>
                    <td className="px-6 py-4 text-right font-bold text-white text-lg">
                      {formatCurrency(t.runningBalance)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Transaction Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 overflow-y-auto py-10">
          <div className="bg-[var(--color-dark-surface)] border border-[var(--color-dark-border)] rounded-xl w-full max-w-md shadow-2xl my-auto">
            <div className="p-6 border-b border-[var(--color-dark-border)] flex justify-between items-center bg-[var(--color-dark-surface)] rounded-t-xl z-10">
              <h2 className="text-xl font-bold text-white">Add Transaction</h2>
              <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-white transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleAddTransaction} className="p-6 space-y-5">
              
              <div className="flex rounded-lg overflow-hidden border border-[#2a2a2a] p-1 bg-[#0f0f0f]">
                <button
                  type="button"
                  onClick={() => setType('inflow')}
                  className={`flex-1 py-2 text-sm font-bold rounded-md transition-all duration-200 ${type === 'inflow' ? 'bg-emerald-500/20 text-emerald-400 shadow-sm border border-emerald-500/30' : 'text-gray-500 hover:text-gray-300 border border-transparent'}`}
                >
                  INFLOW
                </button>
                <button
                  type="button"
                  onClick={() => setType('outflow')}
                  className={`flex-1 py-2 text-sm font-bold rounded-md transition-all duration-200 ${type === 'outflow' ? 'bg-red-500/20 text-red-400 shadow-sm border border-red-500/30' : 'text-gray-500 hover:text-gray-300 border border-transparent'}`}
                >
                  OUTFLOW
                </button>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Amount (₹)</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-medium">₹</span>
                  <input
                    required
                    type="number"
                    min="1"
                    value={amount}
                    onChange={e => setAmount(e.target.value)}
                    className="w-full bg-[var(--color-dark-bg)] border border-[var(--color-dark-border)] rounded-lg pl-8 pr-4 py-2.5 text-white focus:ring-1 focus:ring-[var(--color-accent-indigo)] outline-none font-medium"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Description</label>
                <input
                  required
                  type="text"
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  className="w-full bg-[var(--color-dark-bg)] border border-[var(--color-dark-border)] rounded-lg px-4 py-2.5 text-white focus:ring-1 focus:ring-[var(--color-accent-indigo)] outline-none"
                  placeholder={type === 'inflow' ? 'e.g. Sponsor payment' : 'e.g. Domain renewal'}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Date</label>
                <input
                  required
                  type="date"
                  value={transactionDate}
                  onChange={e => setTransactionDate(e.target.value)}
                  className="w-full bg-[var(--color-dark-bg)] border border-[var(--color-dark-border)] rounded-lg px-4 py-2.5 text-white focus:ring-1 focus:ring-[var(--color-accent-indigo)] outline-none"
                />
              </div>

              {type === 'outflow' && (
                <div className="bg-[#1e1e1e] border border-[#2a2a2a] p-4 rounded-lg space-y-3">
                  <label className="block text-sm font-medium text-amber-400 mb-1 flex items-center gap-2">
                    <Wallet className="w-4 h-4" /> Covered By (Optional)
                  </label>
                  <input
                    type="text"
                    value={coveredBy}
                    onChange={e => setCoveredBy(e.target.value)}
                    className="w-full bg-[#0f0f0f] border border-[var(--color-dark-border)] rounded-lg px-4 py-2 text-white focus:ring-1 focus:ring-amber-500 outline-none"
                    placeholder="e.g. Hriday + Arjun"
                  />
                  <p className="text-xs text-gray-500">If a member paid for this personally and it needs tracking.</p>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Related Project (Optional)</label>
                <select
                  value={projectId}
                  onChange={e => setProjectId(e.target.value)}
                  className="w-full bg-[var(--color-dark-bg)] border border-[var(--color-dark-border)] rounded-lg px-4 py-2.5 text-white focus:ring-1 focus:ring-[var(--color-accent-indigo)] outline-none"
                >
                  <option value="">None</option>
                  {projects.map(p => (
                    <option key={p.id} value={p.id}>{p.client_name}</option>
                  ))}
                </select>
              </div>

              <div className="pt-4 mt-2 border-t border-[var(--color-dark-border)] flex justify-end gap-3 bg-[var(--color-dark-surface)] pb-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-lg font-medium text-gray-400 hover:text-white transition-colors hover:bg-[#2a2a2a]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className={`px-6 py-2.5 rounded-lg font-medium text-white transition-colors disabled:opacity-50 flex items-center gap-2 ${type === 'inflow' ? 'bg-emerald-600 hover:bg-emerald-500 shadow-lg shadow-emerald-600/20' : 'bg-red-600 hover:bg-red-500 shadow-lg shadow-red-600/20'}`}
                >
                  {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
                  {isSubmitting ? 'Saving...' : 'Add Transaction'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
