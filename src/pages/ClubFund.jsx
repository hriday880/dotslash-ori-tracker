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
        <h2 className="font-headline-sm text-headline-sm text-on-surface font-bold">Club Fund Ledger</h2>
        <div className="flex items-center gap-4">
          <button className="material-symbols-outlined text-on-surface-variant hover:text-primary transition-opacity text-[24px]">search</button>
          <button className="material-symbols-outlined text-on-surface-variant hover:text-primary transition-opacity text-[24px]">notifications</button>
        </div>
      </header>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col">
        <div className="p-[var(--spacing-margin-page)] space-y-[var(--spacing-gutter)] max-w-[var(--spacing-container-max)] mx-auto w-full flex-1">
          
          {/* Fund Summary Card */}
          <div className="grid grid-cols-12 gap-[var(--spacing-gutter)]">
            <div className="col-span-12 md:col-span-8 bg-[#1a1a1a] border border-[#2a2a2a] p-[var(--spacing-margin-page)] flex flex-col justify-between relative overflow-hidden rounded-xl">
              <div className="relative z-10">
                <p className="text-label-md font-label-md text-on-surface-variant mb-2">CURRENT AVAILABLE BALANCE</p>
                <h3 className="font-stat-lg text-stat-lg text-secondary-fixed-dim">{formatCurrency(currentBalance)}</h3>
                <div className="flex items-center gap-2 mt-4">
                  <span className="flex items-center text-secondary text-body-sm bg-secondary/10 px-2 py-0.5 rounded-full font-bold">
                    <span className="material-symbols-outlined text-[14px] mr-1">trending_up</span>
                    Active
                  </span>
                  <span className="text-on-surface-variant text-body-sm">Operational Fund</span>
                </div>
              </div>
              <div className="absolute top-0 right-0 p-[var(--spacing-margin-page)] opacity-20 pointer-events-none">
                <span className="material-symbols-outlined text-[120px]" style={{ fontVariationSettings: "'wght' 100" }}>payments</span>
              </div>
            </div>
            
            <div className="col-span-12 md:col-span-4 bg-[#1a1a1a] border border-[#2a2a2a] p-[var(--spacing-margin-page)] flex flex-col justify-center gap-[var(--spacing-gutter)] rounded-xl">
              <button 
                onClick={() => setIsModalOpen(true)}
                className="w-full bg-primary-container text-on-primary-container py-3 font-headline-sm text-headline-sm flex items-center justify-center gap-2 hover:brightness-110 active:scale-95 transition-all rounded-lg font-bold"
              >
                <span className="material-symbols-outlined text-[24px]">add</span>
                Record Transaction
              </button>
              <button className="w-full border border-[#2a2a2a] text-on-surface py-3 font-headline-sm text-headline-sm flex items-center justify-center gap-2 hover:bg-surface-container transition-colors rounded-lg font-bold">
                <span className="material-symbols-outlined text-[24px]">download</span>
                Export Ledger
              </button>
            </div>
          </div>

          {/* Ledger Filters and Title */}
          <div className="flex items-center justify-between pt-4">
            <div className="flex items-center gap-4">
              <h4 className="font-headline-sm text-headline-sm text-on-surface font-bold">Transaction History</h4>
              <span className="bg-surface-container-highest text-on-surface-variant px-3 py-1 text-label-sm font-label-sm rounded-full tracking-wider">{transactions.length} TOTAL</span>
            </div>
            <div className="flex gap-2">
              <select className="bg-surface-container border-none rounded-lg text-body-sm font-body-sm text-on-surface-variant focus:ring-1 focus:ring-primary py-2 px-4 outline-none">
                <option>All Types</option>
                <option>Inflow</option>
                <option>Outflow</option>
              </select>
            </div>
          </div>

          {/* Data Table */}
          <div className="bg-[#1a1a1a] border border-[#2a2a2a] overflow-hidden rounded-xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-[#1a1a1a] border-b border-[#2a2a2a]">
                    <th className="p-[var(--spacing-table-cell-padding)] text-label-md font-label-md text-on-surface-variant uppercase tracking-wider">Date</th>
                    <th className="p-[var(--spacing-table-cell-padding)] text-label-md font-label-md text-on-surface-variant uppercase tracking-wider">Description</th>
                    <th className="p-[var(--spacing-table-cell-padding)] text-label-md font-label-md text-on-surface-variant uppercase tracking-wider">Type</th>
                    <th className="p-[var(--spacing-table-cell-padding)] text-label-md font-label-md text-on-surface-variant uppercase tracking-wider">Amount</th>
                    <th className="p-[var(--spacing-table-cell-padding)] text-label-md font-label-md text-on-surface-variant uppercase tracking-wider">Covered By</th>
                    <th className="p-[var(--spacing-table-cell-padding)] text-label-md font-label-md text-on-surface-variant uppercase tracking-wider">Project</th>
                    <th className="p-[var(--spacing-table-cell-padding)] text-label-md font-label-md text-on-surface-variant uppercase tracking-wider text-right">Running Bal.</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#2a2a2a]">
                  {transactions.length === 0 ? (
                    <tr>
                      <td colSpan="7" className="p-[var(--spacing-table-cell-padding)] text-center text-on-surface-variant py-12">
                        No transactions recorded yet.
                      </td>
                    </tr>
                  ) : (
                    transactions.map(t => (
                      <tr key={t.id} className="hover:bg-[#242424] transition-colors group">
                        <td className="p-[var(--spacing-table-cell-padding)] font-body-md text-body-md text-on-surface-variant">
                          {formatDate(t.transaction_date)}
                        </td>
                        <td className="p-[var(--spacing-table-cell-padding)]">
                          <p className="font-body-md text-body-md text-on-surface font-medium">{t.description}</p>
                        </td>
                        <td className="p-[var(--spacing-table-cell-padding)]">
                          {t.type === 'inflow' ? (
                            <span className="inline-flex items-center bg-secondary/10 text-secondary px-2 py-0.5 rounded text-label-sm font-label-sm tracking-wider uppercase font-bold">
                              INFLOW
                            </span>
                          ) : (
                            <span className="inline-flex items-center bg-error/10 text-error px-2 py-0.5 rounded text-label-sm font-label-sm tracking-wider uppercase font-bold">
                              OUTFLOW
                            </span>
                          )}
                        </td>
                        <td className={`p-[var(--spacing-table-cell-padding)] font-body-md text-body-md font-bold ${t.type === 'inflow' ? 'text-secondary' : 'text-error'}`}>
                          {t.type === 'inflow' ? '+' : '-'}{formatCurrency(t.amount)}
                        </td>
                        <td className="p-[var(--spacing-table-cell-padding)] text-body-md font-body-md text-on-surface-variant">
                          {t.covered_by || '--'}
                        </td>
                        <td className="p-[var(--spacing-table-cell-padding)]">
                          {t.projects ? (
                            <span className="text-primary flex items-center gap-1 font-body-md text-body-md">
                              {t.projects.client_name}
                            </span>
                          ) : (
                            <span className="text-on-surface-variant">--</span>
                          )}
                        </td>
                        <td className="p-[var(--spacing-table-cell-padding)] text-right font-body-md text-body-md font-bold text-on-surface">
                          {formatCurrency(t.runningBalance)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            
            {/* Pagination Placeholder */}
            {transactions.length > 0 && (
              <div className="p-[var(--spacing-table-cell-padding)] border-t border-[#2a2a2a] flex items-center justify-between">
                <p className="text-label-sm text-on-surface-variant font-bold tracking-wider uppercase">SHOWING {transactions.length} ENTRIES</p>
                <div className="flex gap-2">
                  <button className="p-1 border border-[#2a2a2a] rounded text-on-surface-variant hover:bg-surface-container disabled:opacity-50" disabled>
                    <span className="material-symbols-outlined text-[18px]">chevron_left</span>
                  </button>
                  <button className="px-3 py-1 border border-primary text-primary font-label-sm rounded font-bold">1</button>
                  <button className="p-1 border border-[#2a2a2a] rounded text-on-surface-variant hover:bg-surface-container disabled:opacity-50" disabled>
                    <span className="material-symbols-outlined text-[18px]">chevron_right</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Footnote / Audit Info */}
          <div className="flex items-center gap-3 p-[var(--spacing-stack-md)] bg-surface-container-low rounded-lg mt-4 border border-outline-variant/30">
            <span className="material-symbols-outlined text-primary text-[20px]">info</span>
            <p className="text-body-sm text-on-surface-variant">
              All fund movements are reconciled. For discrepancies, contact the admin. 
              <span className="font-bold text-on-surface ml-2">System Live Tracking Active</span>
            </p>
          </div>

        </div>
      </div>

      {/* Slide-over for Add Transaction */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-[100] transition-opacity animate-in fade-in duration-200">
          <div className="absolute right-0 top-0 h-full w-full max-w-md bg-surface border-l border-outline-variant p-[var(--spacing-margin-page)] shadow-2xl animate-in slide-in-from-right duration-300 flex flex-col">
            <div className="flex justify-between items-center mb-8 shrink-0">
              <h3 className="font-headline-md text-headline-md text-on-surface font-bold">Record Transaction</h3>
              <button onClick={() => setIsModalOpen(false)} className="material-symbols-outlined text-on-surface-variant hover:text-error transition-colors text-[24px]">close</button>
            </div>
            
            <form onSubmit={handleAddTransaction} className="flex flex-col flex-1 overflow-y-auto custom-scrollbar">
              <div className="space-y-6 pb-20">
                <div>
                  <label className="block text-label-md font-label-md text-on-surface-variant mb-2 tracking-wider uppercase font-bold">TRANSACTION TYPE</label>
                  <div className="grid grid-cols-2 gap-4">
                    <button 
                      type="button"
                      onClick={() => setType('inflow')}
                      className={`border-2 py-3 flex items-center justify-center gap-2 font-bold rounded-lg transition-colors ${type === 'inflow' ? 'border-secondary text-secondary bg-secondary/10' : 'border-[#2a2a2a] text-on-surface-variant hover:border-secondary/50'}`}
                    >
                      <span className="material-symbols-outlined text-[20px]">arrow_downward</span>
                      Inflow
                    </button>
                    <button 
                      type="button"
                      onClick={() => setType('outflow')}
                      className={`border-2 py-3 flex items-center justify-center gap-2 font-bold rounded-lg transition-colors ${type === 'outflow' ? 'border-error text-error bg-error/10' : 'border-[#2a2a2a] text-on-surface-variant hover:border-error/50'}`}
                    >
                      <span className="material-symbols-outlined text-[20px]">arrow_upward</span>
                      Outflow
                    </button>
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-label-md font-label-md text-on-surface-variant mb-2 tracking-wider uppercase font-bold">Amount (₹)</label>
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant font-bold">₹</span>
                      <input 
                        required
                        type="number"
                        min="1"
                        value={amount}
                        onChange={e => setAmount(e.target.value)}
                        className="w-full bg-[#0f0f0f] border border-[#2a2a2a] rounded-lg focus:border-primary focus:ring-1 focus:ring-primary text-body-lg text-on-surface py-3 pl-8 pr-4 outline-none font-bold" 
                        placeholder="0.00" 
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-label-md font-label-md text-on-surface-variant mb-2 tracking-wider uppercase font-bold">Description</label>
                    <textarea 
                      required
                      value={description}
                      onChange={e => setDescription(e.target.value)}
                      className="w-full bg-[#0f0f0f] border border-[#2a2a2a] rounded-lg focus:border-primary focus:ring-1 focus:ring-primary text-body-md text-on-surface p-3 outline-none resize-none" 
                      placeholder="Explain the purpose of this transaction..." 
                      rows="3"
                    ></textarea>
                  </div>

                  <div className="grid grid-cols-1 gap-4">
                    <div>
                      <label className="block text-label-md font-label-md text-on-surface-variant mb-2 tracking-wider uppercase font-bold">Project Link (Optional)</label>
                      <select 
                        value={projectId}
                        onChange={e => setProjectId(e.target.value)}
                        className="w-full bg-[#0f0f0f] border border-[#2a2a2a] rounded-lg focus:border-primary focus:ring-1 focus:ring-primary text-body-md text-on-surface p-3 outline-none"
                      >
                        <option value="">None</option>
                        {projects.map(p => (
                          <option key={p.id} value={p.id}>{p.client_name}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-label-md font-label-md text-on-surface-variant mb-2 tracking-wider uppercase font-bold">Date</label>
                      <input 
                        required
                        type="date"
                        value={transactionDate}
                        onChange={e => setTransactionDate(e.target.value)}
                        className="w-full bg-[#0f0f0f] border border-[#2a2a2a] rounded-lg focus:border-primary focus:ring-1 focus:ring-primary text-body-md text-on-surface p-3 outline-none [color-scheme:dark]" 
                      />
                    </div>
                  </div>

                  {type === 'outflow' && (
                    <div className="p-4 border border-[#2a2a2a] bg-[#141414] rounded-lg">
                      <label className="block text-label-md font-label-md text-tertiary mb-2 tracking-wider uppercase font-bold flex items-center gap-1">
                        <span className="material-symbols-outlined text-[16px]">person</span> Covered By (Optional)
                      </label>
                      <input 
                        type="text"
                        value={coveredBy}
                        onChange={e => setCoveredBy(e.target.value)}
                        className="w-full bg-[#0f0f0f] border border-[#2a2a2a] rounded-lg focus:border-tertiary focus:ring-1 focus:ring-tertiary text-body-md text-on-surface p-3 outline-none" 
                        placeholder="e.g. Hriday" 
                      />
                    </div>
                  )}
                </div>
              </div>

              <div className="absolute bottom-0 right-0 left-0 p-[var(--spacing-margin-page)] bg-surface border-t border-outline-variant flex gap-4">
                <button 
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-6 py-4 border border-[#2a2a2a] rounded-lg text-on-surface-variant hover:bg-surface-container font-bold tracking-wider uppercase transition-colors"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 bg-primary hover:bg-primary/90 text-on-primary font-bold py-4 rounded-lg active:scale-95 transition-transform tracking-wider uppercase disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isSubmitting ? (
                    <><span className="material-symbols-outlined animate-spin text-[20px]">sync</span> Confirming...</>
                  ) : (
                    'Confirm Entry'
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
