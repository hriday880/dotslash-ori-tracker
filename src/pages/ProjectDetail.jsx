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

  const statusIcons = {
    scouting: 'search',
    confirmed: 'handshake',
    advance_received: 'payments',
    in_dev: 'engineering',
    delivered: 'local_shipping',
    completed: 'task_alt'
  };

  const getStatusColor = (status) => {
    const colors = {
      scouting: 'bg-surface-variant text-on-surface-variant border-outline-variant',
      confirmed: 'bg-primary/20 text-primary-fixed-dim border-primary/30',
      advance_received: 'bg-tertiary/20 text-tertiary border-tertiary/30',
      in_dev: 'bg-primary-container/20 text-primary border-primary/30',
      delivered: 'bg-secondary/20 text-secondary border-secondary/30',
      completed: 'bg-secondary/20 text-secondary-fixed-dim border-secondary/30'
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

  if (!project) {
    return <div className="text-on-surface-variant p-8 text-center">Project not found.</div>;
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
    <div className="flex-1 flex flex-col h-full relative">
      {/* Top Navbar Cluster */}
      <header className="flex justify-between items-center w-full px-[var(--spacing-margin-page)] py-[var(--spacing-stack-md)] bg-surface border-b border-outline-variant shrink-0 z-40 relative">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate(-1)} className="text-on-surface-variant hover:text-primary transition-colors p-2 rounded-full hover:bg-surface-container active:scale-95">
            <span className="material-symbols-outlined">arrow_back</span>
          </button>
          <h2 className="font-headline-md text-headline-md font-bold text-primary">Project Detail</h2>
          <div className="h-6 w-px bg-outline-variant mx-2 hidden sm:block"></div>
          <div className="flex items-center gap-2 px-3 py-1 bg-primary-container/10 border border-primary-container/20 rounded-full">
            <span className="w-2 h-2 rounded-full bg-primary animate-pulse"></span>
            <span className="text-[10px] font-bold tracking-wider uppercase text-primary">Live Session</span>
          </div>
        </div>
      </header>

      {/* Main Content Canvas */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-[var(--spacing-margin-page)]">
        <div className="max-w-[var(--spacing-container-max)] mx-auto space-y-6">
          
          {/* Header Section */}
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <h2 className="font-headline-lg text-headline-lg text-on-surface">{project.client_name}</h2>
                <span className={`px-3 py-0.5 rounded-full font-label-md text-label-md uppercase tracking-wider border ${getStatusColor(project.status)}`}>
                  {project.status.replace('_', ' ')}
                </span>
              </div>
              <p className="text-on-surface-variant font-body-md text-body-md">Project ID: {project.id} • Created on {new Date(project.created_at).toLocaleDateString('en-IN')}</p>
            </div>
            <div className="flex items-center gap-3">
              <button className="px-6 py-2.5 rounded-lg border border-outline-variant text-on-surface font-body-md text-body-md hover:bg-surface-container transition-all active:scale-95">
                Edit Project
              </button>
              {nextStatus && (
                <button 
                  onClick={handleAdvanceStatus}
                  disabled={isAdvancing}
                  className="px-6 py-2.5 rounded-lg bg-primary text-on-primary font-body-md text-body-md font-bold shadow-lg shadow-primary/20 hover:opacity-90 transition-all active:scale-95 flex items-center gap-2 disabled:opacity-50"
                >
                  {isAdvancing ? (
                    <span className="material-symbols-outlined animate-spin text-[18px]">sync</span>
                  ) : (
                    <>Mark as {nextStatus.replace('_', ' ').toUpperCase()} <span className="material-symbols-outlined text-[18px]">chevron_right</span></>
                  )}
                </button>
              )}
            </div>
          </div>

          {/* Stepper Progress Bar */}
          <div className="bg-[#1a1a1a] border border-[#2a2a2a] p-6 rounded-xl overflow-hidden relative">
            <div className="flex justify-between items-center relative">
              {/* Progress Line Background */}
              <div className="absolute top-[18px] left-0 w-full h-[4px] bg-surface-container-high rounded-full"></div>
              {/* Active Progress Line */}
              <div 
                className="absolute top-[18px] left-0 h-[4px] bg-primary rounded-full shadow-[0_0_8px_rgba(192,193,255,0.5)] transition-all duration-500" 
                style={{ width: `${(currentStatusIndex / (STATUS_FLOW.length - 1)) * 100}%` }}
              ></div>
              
              {/* Steps */}
              {STATUS_FLOW.map((status, index) => {
                const isCompleted = index < currentStatusIndex;
                const isCurrent = index === currentStatusIndex;
                const Icon = statusIcons[status] || 'check';

                return (
                  <div key={status} className={`relative z-10 flex flex-col items-center gap-3 group ${!isCompleted && !isCurrent ? 'opacity-50' : ''}`}>
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${
                      isCompleted ? 'bg-primary text-on-primary' : 
                      isCurrent ? 'bg-primary ring-4 ring-primary/20 text-on-primary' : 
                      'bg-surface-container-high text-on-surface-variant'
                    }`}>
                      <span className="material-symbols-outlined text-[20px]">{isCompleted ? 'check' : Icon}</span>
                    </div>
                    <span className={`text-[10px] uppercase tracking-widest font-bold ${isCompleted || isCurrent ? 'text-primary' : 'text-on-surface-variant'}`}>
                      {status.replace('_', ' ')}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Content Grid */}
          <div className="grid grid-cols-12 gap-6">
            
            {/* Left Column (Project Info) */}
            <div className="col-span-12 lg:col-span-8 space-y-6">
              
              {/* Core Details Bento Card */}
              <div className="bg-[#1a1a1a] border border-[#2a2a2a] p-8 rounded-xl grid grid-cols-2 gap-8">
                <div className="col-span-2 md:col-span-1">
                  <p className="text-label-sm text-on-surface-variant uppercase tracking-widest mb-2">Deal Value</p>
                  <h3 className="font-stat-lg text-stat-lg text-on-surface">{formatCurrency(project.deal_value)}</h3>
                  
                  <div className="mt-4 p-4 rounded-lg bg-background border border-outline-variant/30">
                    <p className="text-label-sm text-on-surface-variant uppercase tracking-widest mb-2">Notes</p>
                    <p className="font-body-md text-body-md text-on-surface whitespace-pre-wrap">{project.notes || 'No notes provided.'}</p>
                  </div>
                </div>
                
                <div className="col-span-2 md:col-span-1 space-y-6">
                  <div>
                    <p className="text-label-sm text-on-surface-variant uppercase tracking-widest mb-3">Outreach Members</p>
                    <div className="space-y-2">
                      {outreachShares.length === 0 ? (
                        <p className="text-body-sm text-on-surface-variant italic">None assigned</p>
                      ) : (
                        outreachShares.map(o => (
                          <div key={o.member_id} className="flex items-center justify-between p-3 rounded bg-surface-container-low border border-outline-variant/30">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded bg-primary-container/20 text-primary flex items-center justify-center font-bold">
                                {o.memberName.charAt(0)}
                              </div>
                              <span className="font-body-md text-body-md text-on-surface">{o.memberName}</span>
                            </div>
                            <div className="text-right">
                              <span className="font-label-md text-label-md text-on-surface block">Cut: {o.share_pct}%</span>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                  
                  <div>
                    <div className="flex justify-between items-end mb-3">
                      <p className="text-label-sm text-on-surface-variant uppercase tracking-widest">Transport Allowance</p>
                      {nextStatus && (
                        <button 
                          onClick={() => setShowTransportModal(true)}
                          className="text-[10px] text-primary hover:underline uppercase tracking-wider font-bold"
                        >
                          + Log Expense
                        </button>
                      )}
                    </div>
                    <div className="space-y-2">
                      <div className="flex justify-between text-label-md">
                        <span className="text-on-surface-variant">{formatCurrency(totalTransportClaimed)} claimed</span>
                        <span className="text-on-surface-variant">Cap: {formatCurrency(splits.transportCap)}</span>
                      </div>
                      <div className="h-2 w-full bg-surface-container-high rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-primary-container transition-all" 
                          style={{ width: `${Math.min((totalTransportClaimed / splits.transportCap) * 100, 100)}%` }}
                        ></div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Development Team Table */}
              <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl overflow-hidden">
                <div className="px-6 py-4 bg-surface-container-high/50 border-b border-outline-variant flex justify-between items-center">
                  <h3 className="font-headline-sm text-headline-sm text-on-surface">Development Team</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead className="bg-surface-container-low">
                      <tr>
                        <th className="p-[var(--spacing-table-cell-padding)] text-label-sm text-on-surface-variant uppercase tracking-wider">Member</th>
                        <th className="p-[var(--spacing-table-cell-padding)] text-label-sm text-on-surface-variant uppercase tracking-wider">Status</th>
                        <th className="p-[var(--spacing-table-cell-padding)] text-label-sm text-on-surface-variant uppercase tracking-wider text-right">Individual Share</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-outline-variant/30">
                      {devs.length === 0 ? (
                        <tr>
                          <td colSpan="3" className="p-8 text-center text-on-surface-variant italic">No devs assigned</td>
                        </tr>
                      ) : (
                        devs.map(d => (
                          <tr key={d.member_id} className="hover:bg-surface-container-high transition-colors">
                            <td className="p-[var(--spacing-table-cell-padding)] font-body-md text-on-surface">{d.memberName}</td>
                            <td className="p-[var(--spacing-table-cell-padding)]"><span className="text-secondary text-[10px] uppercase font-bold tracking-wider">Active</span></td>
                            <td className="p-[var(--spacing-table-cell-padding)] font-body-md text-on-surface text-right">{d.share_pct}%</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                    <tfoot className="bg-surface-container-low/50">
                      <tr>
                        <td className="p-[var(--spacing-table-cell-padding)] font-label-md text-on-surface-variant uppercase tracking-wider" colSpan="2">Total Dev Cut ({project.dev_cut_pct}%)</td>
                        <td className="p-[var(--spacing-table-cell-padding)] font-body-md text-body-md font-bold text-right text-primary">{formatCurrency(splits.devCutTotal)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
              
              {/* Transport Expenses Log */}
              {transportExpenses.length > 0 && (
                <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl overflow-hidden">
                  <div className="px-6 py-4 bg-surface-container-high/50 border-b border-outline-variant">
                    <h3 className="font-headline-sm text-headline-sm text-on-surface">Transport Log</h3>
                  </div>
                  <div className="divide-y divide-outline-variant/30">
                    {transportExpenses.map(expense => {
                      const submitter = members.find(m => m.id === expense.member_id)?.name || 'Unknown';
                      return (
                        <div key={expense.id} className="flex items-center justify-between p-4 bg-background">
                          <div>
                            <p className="font-bold text-on-surface">{formatCurrency(expense.amount)}</p>
                            <p className="text-[10px] text-on-surface-variant mt-1 uppercase tracking-wider">By {submitter} • {new Date(expense.created_at).toLocaleDateString('en-IN')}</p>
                          </div>
                          <a 
                            href={expense.proof_url} 
                            target="_blank" 
                            rel="noreferrer"
                            className="text-label-md font-bold text-primary hover:text-primary-container transition-colors uppercase tracking-wider flex items-center gap-1"
                          >
                            View Proof <span className="material-symbols-outlined text-[16px]">open_in_new</span>
                          </a>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

            </div>

            {/* Right Column (Financial Summary) */}
            <div className="col-span-12 lg:col-span-4 space-y-6">
              <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl shadow-2xl relative overflow-hidden group">
                {/* Decorative Abstract Background */}
                <div className="absolute -top-24 -right-24 w-64 h-64 bg-primary/5 rounded-full blur-3xl group-hover:bg-primary/10 transition-all duration-700"></div>
                
                <div className="p-8 relative z-10">
                  <div className="flex items-center gap-3 mb-8">
                    <span className="material-symbols-outlined text-primary text-[32px]">analytics</span>
                    <h3 className="font-headline-sm text-headline-sm text-on-surface">Financial Summary</h3>
                  </div>
                  
                  <div className="space-y-4 mb-10">
                    <div className="flex justify-between items-center pb-3 border-b border-outline-variant/30">
                      <span className="text-on-surface-variant font-body-md text-body-md">Total Deal Value</span>
                      <span className="font-headline-sm text-headline-sm text-on-surface">{formatCurrency(project.deal_value)}</span>
                    </div>
                    <div className="space-y-3">
                      <div className="flex justify-between items-center">
                        <span className="text-on-surface-variant font-body-sm text-body-sm">Outreach ({project.outreach_cut_pct || 10}%)</span>
                        <span className="text-error font-body-md text-body-md">- {formatCurrency(splits.outreachCutTotal)}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-on-surface-variant font-body-sm text-body-sm">Dev Pool ({project.dev_cut_pct}%)</span>
                        <span className="text-error font-body-md text-body-md">- {formatCurrency(splits.devCutTotal)}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-on-surface-variant font-body-sm text-body-sm">Transport</span>
                        <span className="text-error font-body-md text-body-md">- {formatCurrency(splits.actualTransport)}</span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="p-6 rounded-lg bg-secondary-container/10 border border-secondary/20 text-center">
                    <p className="text-[10px] text-on-surface-variant uppercase tracking-widest mb-2 font-bold">Club Fund Receives</p>
                    <p className="font-stat-lg text-stat-lg text-secondary">{formatCurrency(splits.clubFund)}</p>
                    <p className="text-[10px] text-secondary/70 mt-2 tracking-wider uppercase font-bold">
                      {((splits.clubFund / Number(project.deal_value)) * 100).toFixed(1)}% Profit Margin
                    </p>
                  </div>
                </div>
                
                {currentStatusIndex === STATUS_FLOW.length - 1 && (
                  <div className="bg-surface-container-high px-8 py-4 flex items-center justify-center gap-2 border-t border-outline-variant">
                    <span className="material-symbols-outlined text-secondary" style={{ fontVariationSettings: "'FILL' 1" }}>verified</span>
                    <span className="text-label-md font-label-md text-on-surface-variant tracking-wider uppercase">Validated by Treasury</span>
                  </div>
                )}
              </div>
            </div>
            
          </div>
        </div>
      </div>

      {/* Completion Confirmation Modal */}
      {showCompleteConfirm && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-surface border border-secondary/30 rounded-xl w-full max-w-md shadow-[0_0_30px_rgba(74,225,118,0.1)] p-6 animate-in zoom-in duration-200">
            <div className="flex items-center gap-4 mb-4 text-secondary">
              <span className="material-symbols-outlined text-[32px]">warning</span>
              <h2 className="font-headline-sm font-bold text-on-surface">Complete Project</h2>
            </div>
            <p className="text-body-md text-on-surface-variant mb-6">
              This action will auto-generate <strong className="text-on-surface">payouts</strong> for the members and add <strong className="text-secondary">{formatCurrency(splits.clubFund)}</strong> to the club fund ledger.
              <br /><br />
              Are you sure you want to proceed? This cannot be easily undone.
            </p>
            <div className="flex justify-end gap-3 pt-4 border-t border-outline-variant">
              <button
                onClick={() => setShowCompleteConfirm(false)}
                className="px-4 py-2 rounded-lg font-label-md text-on-surface-variant hover:bg-surface-container transition-colors uppercase tracking-wider"
              >
                Cancel
              </button>
              <button
                onClick={handleCompleteProject}
                disabled={isAdvancing}
                className="bg-secondary text-on-secondary disabled:opacity-50 px-5 py-2 rounded-lg font-bold flex items-center gap-2 transition-colors active:scale-95 uppercase tracking-wider"
              >
                {isAdvancing && <span className="material-symbols-outlined animate-spin text-[16px]">sync</span>}
                Confirm Completion
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Transport Modal */}
      {showTransportModal && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-surface border border-outline-variant rounded-xl w-full max-w-md shadow-2xl animate-in zoom-in duration-200">
            <div className="p-6 border-b border-outline-variant flex justify-between items-center bg-surface-container-low rounded-t-xl">
              <h2 className="text-headline-sm font-bold text-primary">Log Transport</h2>
              <button onClick={() => setShowTransportModal(false)} className="text-on-surface-variant hover:text-primary transition-colors p-1 rounded-full hover:bg-surface-container">
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>
            <form onSubmit={handleLogTransport} className="p-6 space-y-5">
              <div>
                <label className="block font-label-md text-on-surface-variant mb-2">SUBMITTING OUTREACH MEMBER</label>
                <select
                  required
                  value={transportMemberId}
                  onChange={e => setTransportMemberId(e.target.value)}
                  className="w-full bg-background border border-outline-variant rounded-lg px-4 py-2 text-on-surface focus:ring-1 focus:ring-primary outline-none text-body-md"
                >
                  <option value="">Select Member</option>
                  {outreachShares.map(m => (
                    <option key={m.member_id} value={m.member_id}>{m.memberName}</option>
                  ))}
                </select>
                <p className="text-[10px] text-on-surface-variant mt-1 uppercase tracking-wider font-bold">Only assigned outreach members can claim.</p>
              </div>

              <div>
                <label className="block font-label-md text-on-surface-variant mb-2">EXPENSE AMOUNT (₹)</label>
                <input
                  required
                  type="number"
                  min="1"
                  value={transportAmount}
                  onChange={e => setTransportAmount(e.target.value)}
                  className="w-full bg-background border border-outline-variant rounded-lg px-4 py-2 text-on-surface focus:ring-1 focus:ring-primary outline-none text-body-md"
                />
              </div>

              <div>
                <label className="block font-label-md text-on-surface-variant mb-2">PROOF IMAGE</label>
                <input
                  required
                  type="file"
                  accept="image/*,.pdf"
                  onChange={e => setTransportFile(e.target.files[0])}
                  className="w-full bg-surface border border-outline-variant rounded-lg px-4 py-2 text-on-surface focus:ring-1 focus:ring-primary outline-none text-sm file:mr-4 file:py-1.5 file:px-4 file:rounded-md file:border-0 file:text-[10px] file:uppercase file:tracking-wider file:font-bold file:bg-primary/20 file:text-primary hover:file:bg-primary/30 file:transition-colors"
                />
              </div>

              <div className="pt-6 border-t border-outline-variant flex gap-3 mt-6">
                <button
                  type="button"
                  onClick={() => setShowTransportModal(false)}
                  className="flex-1 py-3 rounded-lg border border-outline-variant text-label-md font-bold text-on-surface hover:bg-surface-container transition-colors uppercase tracking-wider"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingTransport}
                  className="flex-1 py-3 rounded-lg bg-primary text-on-primary font-label-md font-bold active:scale-95 transition-transform disabled:opacity-50 uppercase tracking-wider flex items-center justify-center gap-2"
                >
                  {isSubmittingTransport ? (
                    <><span className="material-symbols-outlined animate-spin text-[16px]">sync</span> UPLOADING...</>
                  ) : (
                    'SUBMIT EXPENSE'
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
