import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { formatCurrency, calculateSplits } from '../lib/utils';
import { Loader2, ArrowLeft, CheckCircle2, AlertTriangle, Edit, X } from 'lucide-react';

const STATUS_FLOW = [
  'scouting', 'confirmed', 'advance_received', 'in_dev', 'delivered', 'completed'
];

export default function ProjectDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  
  const [project, setProject] = useState(null);
  const [members, setMembers] = useState([]);
  const [projectDevs, setProjectDevs] = useState([]);
  const [projectOutreach, setProjectOutreach] = useState([]);
  const [transportExpenses, setTransportExpenses] = useState([]);
  const [loading, setLoading] = useState(true);
  
  const [isAdvancing, setIsAdvancing] = useState(false);
  const [showCompleteConfirm, setShowCompleteConfirm] = useState(false);

  const [showTransportModal, setShowTransportModal] = useState(false);
  const [transportAmount, setTransportAmount] = useState('');
  const [transportMemberId, setTransportMemberId] = useState('');
  const [transportFile, setTransportFile] = useState(null);
  const [isSubmittingTransport, setIsSubmittingTransport] = useState(false);

  useEffect(() => {
    fetchProject();
  }, [id]);

  async function fetchProject() {
    try {
      const [projRes, memRes, devRes, outRes, transRes] = await Promise.all([
        supabase.from('projects').select('*').eq('id', id).single(),
        supabase.from('members').select('*'),
        supabase.from('project_devs').select('*').eq('project_id', id),
        supabase.from('project_outreach').select('*').eq('project_id', id),
        supabase.from('transport_expenses').select('*').eq('project_id', id).order('created_at', { ascending: false })
      ]);

      if (projRes.error) throw projRes.error;
      if (memRes.error) throw memRes.error;
      if (devRes.error) throw devRes.error;

      setProject(projRes.data);
      setMembers(memRes.data);
      setProjectDevs(devRes.data);
      setProjectOutreach(outRes.data || []);
      setTransportExpenses(transRes.data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  const handleAdvanceStatus = async () => {
    const currentIndex = STATUS_FLOW.indexOf(project.status);
    const nextStatus = STATUS_FLOW[currentIndex + 1];
    if (!nextStatus) return;

    if (nextStatus === 'completed') {
      setShowCompleteConfirm(true);
      return;
    }

    setIsAdvancing(true);
    try {
      const { error } = await supabase.from('projects').update({ status: nextStatus }).eq('id', id);
      if (error) throw error;
      fetchProject();
    } catch (err) {
      console.error("Error advancing status", err);
    } finally {
      setIsAdvancing(false);
    }
  };

  const handleLogTransport = async (e) => {
    e.preventDefault();
    if (!transportFile) return alert("Proof image is required");
    
    const dealVal = Number(project.deal_value);
    const cap = dealVal * 0.1;
    const totalTransportClaimed = transportExpenses.reduce((sum, te) => sum + Number(te.amount), 0);
    const newTotal = totalTransportClaimed + Number(transportAmount);
    
    if (newTotal > cap) {
      if (!window.confirm(`This claim brings total transport to ${formatCurrency(newTotal)}, exceeding the 10% cap (${formatCurrency(cap)}). Continue?`)) {
        return;
      }
    }

    setIsSubmittingTransport(true);
    try {
      const fileExt = transportFile.name.split('.').pop();
      const fileName = `${project.id}-${Date.now()}.${fileExt}`;
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('transport_proofs')
        .upload(fileName, transportFile);
      
      if (uploadError) throw uploadError;

      const { data: publicUrlData } = supabase.storage.from('transport_proofs').getPublicUrl(fileName);
      const proofUrl = publicUrlData.publicUrl;

      const { error: insertError } = await supabase.from('transport_expenses').insert([{
        project_id: project.id,
        member_id: transportMemberId,
        amount: Number(transportAmount),
        proof_url: proofUrl
      }]);
      if (insertError) throw insertError;

      setShowTransportModal(false);
      setTransportAmount('');
      setTransportMemberId('');
      setTransportFile(null);
      fetchProject(); // refresh data
    } catch (err) {
      console.error(err);
      alert(`Failed to log transport: ${err.message || JSON.stringify(err)}`);
    } finally {
      setIsSubmittingTransport(false);
    }
  };

  const handleCompleteProject = async () => {
    setIsAdvancing(true);
    try {
      const outreachShares = projectOutreach.map(po => {
        const m = members.find(m => m.id === po.member_id);
        return { ...po, memberName: m?.name };
      });
      const devs = projectDevs.map(pd => {
        const m = members.find(m => m.id === pd.member_id);
        return { ...pd, memberName: m?.name };
      });
      
      const totalTransportClaimed = transportExpenses.reduce((sum, te) => sum + Number(te.amount), 0);

      const splits = calculateSplits(
        Number(project.deal_value),
        Number(project.outreach_cut_pct || 10),
        outreachShares,
        Number(project.dev_cut_pct),
        devs,
        totalTransportClaimed
      );

      // 1. Generate payouts
      const payoutsToInsert = [];
      
      // Outreach cuts
      splits.outreachCuts.forEach(oc => {
        payoutsToInsert.push({
          project_id: project.id,
          member_id: oc.memberId,
          payout_type: 'outreach_cut',
          amount: oc.amount
        });
      });

      // Dev cuts
      splits.devCuts.forEach(dc => {
        payoutsToInsert.push({
          project_id: project.id,
          member_id: dc.memberId,
          payout_type: 'dev_cut',
          amount: dc.amount
        });
      });

      // Transport
      transportExpenses.forEach(te => {
        payoutsToInsert.push({
          project_id: project.id,
          member_id: te.member_id,
          payout_type: 'transport',
          amount: te.amount
        });
      });

      const { error: payoutsError } = await supabase.from('payouts').insert(payoutsToInsert);
      if (payoutsError) throw payoutsError;

      // 2. Generate Club Fund Inflow
      const { error: fundError } = await supabase.from('fund_transactions').insert([{
        type: 'inflow',
        amount: splits.clubFund,
        description: `Project: ${project.client_name}`,
        project_id: project.id,
        transaction_date: new Date().toISOString().split('T')[0]
      }]);
      if (fundError) throw fundError;

      // 3. Mark completed
      const { error: projError } = await supabase.from('projects').update({ status: 'completed' }).eq('id', id);
      if (projError) throw projError;

      setShowCompleteConfirm(false);
      fetchProject();
    } catch (err) {
      console.error("Error completing project", err);
      alert("Failed to complete project. It may have partially completed, check payouts.");
    } finally {
      setIsAdvancing(false);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 animate-spin text-indigo-500" /></div>;
  }

  if (!project) {
    return <div className="text-gray-400">Project not found.</div>;
  }

  const outreachShares = projectOutreach.map(po => {
    const m = members.find(m => m.id === po.member_id);
    return { ...po, memberName: m?.name };
  });
  const devs = projectDevs.map(pd => {
    const m = members.find(m => m.id === pd.member_id);
    return { ...pd, memberName: m?.name };
  });

  const totalTransportClaimed = transportExpenses.reduce((sum, te) => sum + Number(te.amount), 0);

  const splits = calculateSplits(
    Number(project.deal_value),
    Number(project.outreach_cut_pct || 10),
    outreachShares,
    Number(project.dev_cut_pct),
    devs,
    totalTransportClaimed
  );

  const currentStatusIndex = STATUS_FLOW.indexOf(project.status);
  const nextStatus = STATUS_FLOW[currentStatusIndex + 1];

  return (
    <div>
      <div className="mb-6 flex items-center gap-4">
        <button onClick={() => navigate(-1)} className="text-gray-400 hover:text-white transition-colors bg-[#1a1a1a] p-2 rounded-lg border border-[#2a2a2a]">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight">{project.client_name}</h1>
          <p className="text-gray-400 mt-1">Project Details</p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
        {/* Left Col - Info & Actions */}
        <div className="xl:col-span-2 space-y-6">
          {/* Stepper */}
          <div className="bg-[var(--color-dark-surface)] border border-[var(--color-dark-border)] rounded-xl p-6 shadow-sm">
            <h3 className="text-lg font-semibold text-white mb-6">Status</h3>
            <div className="flex flex-wrap items-center gap-2 mb-8">
              {STATUS_FLOW.map((status, index) => {
                const isCompleted = index < currentStatusIndex;
                const isCurrent = index === currentStatusIndex;
                
                return (
                  <div key={status} className="flex items-center">
                    <div className={`px-3 py-1.5 rounded-lg text-sm font-medium border ${
                      isCompleted ? 'bg-indigo-500/10 border-indigo-500/30 text-indigo-400' :
                      isCurrent ? 'bg-[var(--color-accent-indigo)] border-indigo-500 text-white shadow-[0_0_15px_rgba(99,102,241,0.3)]' :
                      'bg-[var(--color-dark-bg)] border-[var(--color-dark-border)] text-gray-500'
                    }`}>
                      {status.replace('_', ' ').toUpperCase()}
                    </div>
                    {index < STATUS_FLOW.length - 1 && (
                      <div className={`w-6 h-0.5 mx-1 ${isCompleted ? 'bg-indigo-500/50' : 'bg-[#2a2a2a]'}`} />
                    )}
                  </div>
                );
              })}
            </div>
            
            {nextStatus && (
              <button
                onClick={handleAdvanceStatus}
                disabled={isAdvancing}
                className="bg-[var(--color-accent-indigo)] hover:bg-indigo-500 disabled:opacity-50 text-white px-5 py-2.5 rounded-lg font-medium transition-colors flex items-center gap-2"
              >
                {isAdvancing ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle2 className="w-5 h-5" />}
                Mark as {nextStatus.replace('_', ' ').toUpperCase()}
              </button>
            )}
            {!nextStatus && (
              <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 p-4 rounded-lg flex items-start gap-3 font-medium">
                <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" />
                This project is complete. Payouts and fund inflow have been processed.
              </div>
            )}
          </div>

          {/* Details */}
          <div className="bg-[var(--color-dark-surface)] border border-[var(--color-dark-border)] rounded-xl p-6 shadow-sm">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-lg font-semibold text-white">Information</h3>
              <button className="text-gray-400 hover:text-white transition-colors p-2 rounded-lg hover:bg-[#2a2a2a] border border-transparent hover:border-[#3a3a3a]">
                <Edit className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-y-6 gap-x-4">
              <div>
                <p className="text-sm text-gray-400 mb-1">Deal Value</p>
                <p className="text-lg font-medium text-white">{formatCurrency(project.deal_value)}</p>
              </div>
              <div>
                <p className="text-sm text-gray-400 mb-1">Date Added</p>
                <p className="text-lg font-medium text-white">{new Date(project.created_at).toLocaleDateString('en-IN')}</p>
              </div>
              <div className="col-span-2">
                <p className="text-sm text-gray-400 mb-1">Notes</p>
                <div className="bg-[#0f0f0f] p-4 rounded-lg border border-[var(--color-dark-border)] min-h-[100px]">
                  <p className="text-gray-300 whitespace-pre-wrap">{project.notes || 'No notes provided.'}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Transport Expenses Section */}
          <div className="bg-[var(--color-dark-surface)] border border-[var(--color-dark-border)] rounded-xl p-6 shadow-sm">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-lg font-semibold text-white">Transport Expenses</h3>
              {nextStatus && (
                <button
                  onClick={() => setShowTransportModal(true)}
                  className="bg-[var(--color-dark-bg)] border border-[var(--color-dark-border)] text-sm font-medium text-white px-3 py-1.5 rounded-lg hover:bg-[#2a2a2a] transition-colors"
                >
                  Log Expense
                </button>
              )}
            </div>
            
            {transportExpenses.length === 0 ? (
              <p className="text-sm text-gray-500 italic">No transport expenses logged for this project.</p>
            ) : (
              <div className="space-y-3">
                {transportExpenses.map(expense => {
                  const submitter = members.find(m => m.id === expense.member_id)?.name || 'Unknown';
                  return (
                    <div key={expense.id} className="flex items-center justify-between p-3 rounded-lg bg-[#0f0f0f] border border-[var(--color-dark-border)]">
                      <div>
                        <p className="font-medium text-white">{formatCurrency(expense.amount)}</p>
                        <p className="text-xs text-gray-500 mt-0.5">By {submitter} • {new Date(expense.created_at).toLocaleDateString('en-IN')}</p>
                      </div>
                      <a 
                        href={expense.proof_url} 
                        target="_blank" 
                        rel="noreferrer"
                        className="text-sm font-medium text-indigo-400 hover:text-indigo-300 transition-colors"
                      >
                        View Proof
                      </a>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right Col - Financial Summary */}
        <div className="bg-[var(--color-dark-surface)] border border-[var(--color-dark-border)] rounded-xl p-6 shadow-sm h-fit sticky top-8">
          <h3 className="text-lg font-semibold text-white mb-6">Financial Summary</h3>
          
          <div className="space-y-4">
            <div className="flex justify-between items-center pb-4 border-b border-[var(--color-dark-border)]">
              <span className="text-gray-400">Deal Value</span>
              <span className="text-xl font-bold text-white">{formatCurrency(project.deal_value)}</span>
            </div>

            <div className="space-y-4 pb-4 border-b border-[var(--color-dark-border)]">
              <div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-300">Outreach Cut ({project.outreach_cut_pct || 10}%)</span>
                  <span className="text-white font-medium text-purple-400">-{formatCurrency(splits.outreachCutTotal)}</span>
                </div>
                <div className="mt-2 space-y-2 bg-[#0f0f0f] rounded-lg p-3 border border-[var(--color-dark-border)]">
                  {splits.outreachCuts.map(oc => {
                    const outName = outreachShares.find(o => o.member_id === oc.memberId)?.memberName || 'Unknown';
                    const outSharePct = outreachShares.find(o => o.member_id === oc.memberId)?.share_pct || 0;
                    return (
                      <p key={oc.memberId} className="text-sm text-gray-400 flex justify-between items-center">
                        <span className="flex items-center gap-2">
                          <span className="w-1.5 h-1.5 rounded-full bg-purple-500"></span>
                          {outName} <span className="text-xs opacity-50">({outSharePct}%)</span>
                        </span>
                        <span className="text-white">{formatCurrency(oc.amount)}</span>
                      </p>
                    );
                  })}
                </div>
              </div>

              <div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-300">Dev Cut ({project.dev_cut_pct}%)</span>
                  <span className="text-white font-medium text-blue-400">-{formatCurrency(splits.devCutTotal)}</span>
                </div>
                <div className="mt-2 space-y-2 bg-[#0f0f0f] rounded-lg p-3 border border-[var(--color-dark-border)]">
                  {splits.devCuts.map(dc => {
                    const devName = devs.find(d => d.memberId === dc.memberId)?.memberName || 'Unknown';
                    const devSharePct = devs.find(d => d.memberId === dc.memberId)?.share_pct || 0;
                    return (
                      <p key={dc.memberId} className="text-sm text-gray-400 flex justify-between items-center">
                        <span className="flex items-center gap-2">
                          <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
                          {devName} <span className="text-xs opacity-50">({devSharePct}%)</span>
                        </span>
                        <span className="text-white">{formatCurrency(dc.amount)}</span>
                      </p>
                    );
                  })}
                </div>
              </div>

              <div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-300">Transport</span>
                  <span className="text-white font-medium text-amber-400">-{formatCurrency(splits.actualTransport)}</span>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  Claimed: {formatCurrency(totalTransportClaimed)} / Cap: {formatCurrency(splits.transportCap)}
                </p>
              </div>
            </div>

            <div className="pt-2">
              <div className="flex justify-between items-center bg-[#0f0f0f] p-4 rounded-xl border border-[var(--color-dark-border)]">
                <span className="font-semibold text-white">Club Fund Receives</span>
                <span className="text-2xl font-black text-emerald-400">{formatCurrency(splits.clubFund)}</span>
              </div>
              <p className="text-xs text-gray-500 mt-3 italic text-center px-4">
                * Transport and outreach cut are separate line items and are expensed separately.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Completion Confirmation Modal */}
      {showCompleteConfirm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-[var(--color-dark-surface)] border border-emerald-500/30 rounded-xl w-full max-w-md shadow-[0_0_30px_rgba(16,185,129,0.1)] p-6">
            <div className="flex items-center gap-4 mb-4 text-emerald-400">
              <AlertTriangle className="w-8 h-8" />
              <h2 className="text-xl font-bold">Complete Project</h2>
            </div>
            <p className="text-gray-300 mb-6">
              This action will auto-generate <strong className="text-white">payouts</strong> for the members and add <strong className="text-emerald-400">{formatCurrency(splits.clubFund)}</strong> to the club fund ledger.
              <br /><br />
              Are you sure you want to proceed? This cannot be easily undone.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowCompleteConfirm(false)}
                className="px-4 py-2 rounded-lg font-medium text-gray-400 hover:text-white transition-colors hover:bg-[#2a2a2a]"
              >
                Cancel
              </button>
              <button
                onClick={handleCompleteProject}
                disabled={isAdvancing}
                className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white px-5 py-2 rounded-lg font-medium flex items-center gap-2 transition-colors"
              >
                {isAdvancing && <Loader2 className="w-4 h-4 animate-spin" />}
                Confirm Completion
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Transport Modal */}
      {showTransportModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-[var(--color-dark-surface)] border border-[var(--color-dark-border)] rounded-xl w-full max-w-md shadow-2xl">
            <div className="p-6 border-b border-[var(--color-dark-border)] flex justify-between items-center">
              <h2 className="text-xl font-bold text-white">Log Transport Expense</h2>
              <button onClick={() => setShowTransportModal(false)} className="text-gray-400 hover:text-white transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleLogTransport} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Submitting Outreach Member</label>
                <select
                  required
                  value={transportMemberId}
                  onChange={e => setTransportMemberId(e.target.value)}
                  className="w-full bg-[var(--color-dark-bg)] border border-[var(--color-dark-border)] rounded-lg px-4 py-2 text-white focus:ring-1 focus:ring-[var(--color-accent-indigo)] outline-none"
                >
                  <option value="">Select Member</option>
                  {outreachShares.map(m => (
                    <option key={m.member_id} value={m.member_id}>{m.memberName}</option>
                  ))}
                </select>
                <p className="text-xs text-gray-500 mt-1">Only assigned outreach members can claim transport for this project.</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Expense Amount (₹)</label>
                <input
                  required
                  type="number"
                  min="1"
                  value={transportAmount}
                  onChange={e => setTransportAmount(e.target.value)}
                  className="w-full bg-[var(--color-dark-bg)] border border-[var(--color-dark-border)] rounded-lg px-4 py-2 text-white focus:ring-1 focus:ring-[var(--color-accent-indigo)] outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Proof Image/Document</label>
                <input
                  required
                  type="file"
                  accept="image/*,.pdf"
                  onChange={e => setTransportFile(e.target.files[0])}
                  className="w-full bg-[#0f0f0f] border border-[var(--color-dark-border)] rounded-lg px-4 py-2 text-white focus:ring-1 focus:ring-[var(--color-accent-indigo)] outline-none text-sm file:mr-4 file:py-1.5 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-[var(--color-dark-surface)] file:text-gray-300 hover:file:bg-[#2a2a2a] file:transition-colors"
                />
              </div>

              <div className="pt-4 flex justify-end gap-3 border-t border-[var(--color-dark-border)]">
                <button
                  type="button"
                  onClick={() => setShowTransportModal(false)}
                  className="px-4 py-2 rounded-lg font-medium text-gray-400 hover:text-white transition-colors hover:bg-[#2a2a2a]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingTransport}
                  className="bg-[var(--color-accent-indigo)] hover:bg-indigo-500 disabled:opacity-50 text-white px-6 py-2 rounded-lg font-medium flex items-center gap-2 transition-colors"
                >
                  {isSubmittingTransport && <Loader2 className="w-4 h-4 animate-spin" />}
                  {isSubmittingTransport ? 'Uploading...' : 'Submit Expense'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
