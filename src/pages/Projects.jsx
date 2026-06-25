import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../supabaseClient';
import { Plus, Loader2, X, Filter, Search } from 'lucide-react';
import { formatCurrency, formatDate, calculateSplits, calculateOutreachCommissionRate } from '../lib/utils';
import { Link, useNavigate } from 'react-router-dom';

export default function Projects() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState([]);
  const [members, setMembers] = useState([]);
  const [projectDevs, setProjectDevs] = useState([]);
  const [projectOutreach, setProjectOutreach] = useState([]);
  const [transportExpenses, setTransportExpenses] = useState([]);
  const [loading, setLoading] = useState(true);
  
  const [filterStatus, setFilterStatus] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form State
  const [clientName, setClientName] = useState('');
  const [dealValue, setDealValue] = useState('');
  const [outreachMemberIds, setOutreachMemberIds] = useState([]); // array of ids
  const [outreachSplits, setOutreachSplits] = useState({}); // { id: percentage }
  const [devMemberIds, setDevMemberIds] = useState([]); // array of up to 2 ids
  const [devSplits, setDevSplits] = useState({}); // { id: percentage }
  const [devCutPct, setDevCutPct] = useState(15);
  const [notes, setNotes] = useState('');

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    try {
      const [projectsRes, membersRes, devsRes, outreachRes, transportRes] = await Promise.all([
        supabase.from('projects').select('*').order('created_at', { ascending: false }),
        supabase.from('members').select('*'),
        supabase.from('project_devs').select('*'),
        supabase.from('project_outreach').select('*'),
        supabase.from('transport_expenses').select('*')
      ]);

      if (projectsRes.error) throw projectsRes.error;
      if (membersRes.error) throw membersRes.error;
      if (devsRes.error) throw devsRes.error;
      if (outreachRes.error) throw outreachRes.error;
      if (transportRes.error) throw transportRes.error;

      setProjects(projectsRes.data || []);
      setMembers(membersRes.data || []);
      setProjectDevs(devsRes.data || []);
      setProjectOutreach(outreachRes.data || []);
      setTransportExpenses(transportRes.data || []);
    } catch (err) {
      console.error("Error fetching projects:", err);
    } finally {
      setLoading(false);
    }
  }

  // Derived state for table
  const enhancedProjects = useMemo(() => {
    return projects.map(project => {
      const outreachShares = projectOutreach.filter(po => po.project_id === project.id).map(po => {
        const member = members.find(m => m.id === po.member_id);
        const rate = calculateOutreachCommissionRate(po.member_id, project, projects, projectOutreach);
        return { ...po, memberName: member?.name, rate };
      });
      const devs = projectDevs.filter(pd => pd.project_id === project.id).map(pd => {
        const member = members.find(m => m.id === pd.member_id);
        return { ...pd, memberName: member?.name };
      });
      
      const projectTransports = transportExpenses.filter(te => te.project_id === project.id);
      const totalTransportClaimed = projectTransports.reduce((sum, te) => sum + Number(te.amount), 0);

      const { clubFund } = calculateSplits(
        Number(project.deal_value),
        Number(project.outreach_cut_pct || 10),
        outreachShares,
        Number(project.dev_cut_pct),
        devs,
        totalTransportClaimed
      );

      return {
        ...project,
        outreachShares,
        devs,
        totalTransportClaimed,
        clubFund
      };
    });
  }, [projects, members, projectDevs, projectOutreach, transportExpenses]);

  const filteredProjects = useMemo(() => {
    return enhancedProjects.filter(p => {
      const matchesStatus = filterStatus === 'all' || p.status === filterStatus;
      const matchesSearch = p.client_name.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesStatus && matchesSearch;
    });
  }, [enhancedProjects, filterStatus, searchQuery]);

  const handleOutreachSelection = (e) => {
    const selectedOptions = Array.from(e.target.selectedOptions).map(opt => opt.value);
    setOutreachMemberIds(selectedOptions);
    if (selectedOptions.length === 1) {
      setOutreachSplits({ [selectedOptions[0]]: 100 });
    } else if (selectedOptions.length === 2) {
      setOutreachSplits({ [selectedOptions[0]]: 50, [selectedOptions[1]]: 50 });
    } else {
      setOutreachSplits({});
    }
  };

  const handleOutreachSplitChange = (id, val) => {
    setOutreachSplits(prev => ({ ...prev, [id]: Number(val) }));
  };

  const handleDevSelection = (e) => {
    const selectedOptions = Array.from(e.target.selectedOptions).map(opt => opt.value);
    if (selectedOptions.length > 2) {
      alert("Maximum 2 developers can be assigned to a project.");
      return;
    }
    setDevMemberIds(selectedOptions);
    
    // Auto-split based on count
    if (selectedOptions.length === 1) {
      setDevSplits({ [selectedOptions[0]]: 100 });
    } else if (selectedOptions.length === 2) {
      setDevSplits({
        [selectedOptions[0]]: 50,
        [selectedOptions[1]]: 50
      });
    } else {
      setDevSplits({});
    }
  };

  const handleDevSplitChange = (id, val) => {
    setDevSplits(prev => ({ ...prev, [id]: Number(val) }));
  };

  async function handleCreateProject(e) {
    e.preventDefault();
    
    if (outreachMemberIds.length > 0) {
      let sum = 0;
      outreachMemberIds.forEach(id => sum += (outreachSplits[id] || 0));
      if (sum !== 100) {
        alert("Outreach splits must sum to exactly 100%");
        return;
      }
    } else {
      alert("Please select at least one outreach member.");
      return;
    }

    if (devMemberIds.length > 0) {
      let sum = 0;
      devMemberIds.forEach(id => sum += (devSplits[id] || 0));
      if (sum !== 100) {
        alert("Developer splits must sum to exactly 100%");
        return;
      }
    }
    
    if (devCutPct < 10 || devCutPct > 20) {
      alert("Dev cut must be between 10% and 20%");
      return;
    }

    const dealVal = Number(dealValue);

    setIsSubmitting(true);
    try {
      const { data: projData, error: projError } = await supabase.from('projects').insert([{
        client_name: clientName,
        deal_value: dealVal,
        status: 'scouting',
        dev_cut_pct: devCutPct,
        notes: notes
      }]).select().single();

      if (projError) throw projError;

      // Insert outreach members
      const outreachInserts = outreachMemberIds.map(outId => ({
        project_id: projData.id,
        member_id: outId,
        share_pct: outreachSplits[outId] || 100
      }));
      const { error: outError } = await supabase.from('project_outreach').insert(outreachInserts);
      if (outError) throw outError;

      // Insert devs
      if (devMemberIds.length > 0) {
        const devInserts = devMemberIds.map(devId => ({
          project_id: projData.id,
          member_id: devId,
          share_pct: devSplits[devId] || 100
        }));
        const { error: devsError } = await supabase.from('project_devs').insert(devInserts);
        if (devsError) throw devsError;
      }

      setIsModalOpen(false);
      navigate(`/projects/${projData.id}`);
    } catch (err) {
      console.error("Error creating project:", err);
      alert("Failed to create project");
      setIsSubmitting(false);
    }
  }

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

  const outreachCandidates = members.filter(m => m.role === 'outreach' || m.role === 'both');
  const devCandidates = members.filter(m => m.role === 'dev' || m.role === 'both');

  const totalDealValue = enhancedProjects.reduce((sum, p) => sum + Number(p.deal_value), 0);
  const totalClubFund = enhancedProjects.reduce((sum, p) => sum + p.clubFund, 0);

  return (
    <div className="flex-1 flex flex-col h-full relative">
      {/* Top Navbar Cluster */}
      <header className="flex justify-between items-center w-full px-[var(--spacing-margin-page)] py-[var(--spacing-stack-md)] bg-surface border-b border-outline-variant shrink-0 z-40 relative">
        <div className="flex items-center gap-4">
          <h2 className="font-headline-md text-headline-md font-bold text-primary">Projects</h2>
          <div className="h-6 w-px bg-outline-variant mx-2 hidden sm:block"></div>
          <div className="flex items-center gap-2 text-on-surface-variant">
            <span className="material-symbols-outlined text-[18px]">search</span>
            <input 
              className="bg-transparent border-none focus:ring-0 text-body-md w-full sm:w-64 placeholder:text-on-surface-variant outline-none" 
              placeholder="Search projects, clients..." 
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>
        <div className="flex items-center gap-4">
          <button 
            onClick={() => setIsModalOpen(true)}
            className="bg-[#6366f1] hover:bg-[#4f46e5] text-white px-4 py-2 rounded-lg font-label-md flex items-center gap-2 transition-transform active:scale-95 shadow-lg shadow-primary-container/10"
          >
            <span className="material-symbols-outlined text-[18px]">add</span>
            <span className="hidden sm:inline">ADD NEW PROJECT</span>
          </button>
        </div>
      </header>

      {/* Project Dashboard Content */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-[var(--spacing-margin-page)]">
        
        {/* Filters & Summary Grid */}
        <div className="flex flex-col gap-6 mb-8">
          <div className="flex items-center justify-between">
            <div className="flex gap-2 p-1 bg-surface-container rounded-lg border border-outline-variant overflow-x-auto">
              {['all', 'scouting', 'confirmed', 'advance_received', 'in_dev', 'delivered', 'completed'].map(status => (
                <button
                  key={status}
                  onClick={() => setFilterStatus(status)}
                  className={`px-4 py-1.5 rounded-md text-label-md transition-colors whitespace-nowrap ${
                    filterStatus === status 
                      ? 'bg-surface-container-high text-primary border border-outline-variant' 
                      : 'text-on-surface-variant hover:bg-surface-container-high'
                  }`}
                >
                  {status === 'all' ? 'All Projects' : status.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                </button>
              ))}
            </div>
          </div>

          {/* Stats Cards (Bento Style) */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-surface/80 backdrop-blur-md border border-outline-variant p-4 rounded-xl flex flex-col justify-between h-32">
              <p className="text-label-sm text-on-surface-variant uppercase">Active Pipelines</p>
              <div className="flex items-baseline justify-between">
                <p className="font-stat-lg text-stat-lg text-on-surface">{projects.filter(p => p.status !== 'completed').length}</p>
              </div>
            </div>
            <div className="bg-surface/80 backdrop-blur-md border border-outline-variant p-4 rounded-xl flex flex-col justify-between h-32">
              <p className="text-label-sm text-on-surface-variant uppercase">Total Deal Value</p>
              <div className="flex items-baseline justify-between">
                <p className="font-stat-lg text-stat-lg text-on-surface">{formatCurrency(totalDealValue)}</p>
              </div>
            </div>
            <div className="bg-surface/80 backdrop-blur-md border border-outline-variant p-4 rounded-xl flex flex-col justify-between h-32">
              <p className="text-label-sm text-on-surface-variant uppercase">In Development</p>
              <div className="flex items-baseline justify-between">
                <p className="font-stat-lg text-stat-lg text-on-surface">{projects.filter(p => p.status === 'in_dev').length}</p>
              </div>
            </div>
            <div className="bg-surface/80 backdrop-blur-md border border-outline-variant p-4 rounded-xl flex flex-col justify-between h-32">
              <p className="text-label-sm text-on-surface-variant uppercase">Club Fund Yield</p>
              <div className="flex items-baseline justify-between">
                <p className="font-stat-lg text-stat-lg text-on-surface">{formatCurrency(totalClubFund)}</p>
                <span className="text-secondary-fixed-dim text-[10px] px-2 py-0.5 bg-on-secondary-container rounded-full font-bold tracking-wider">ESTIMATED</span>
              </div>
            </div>
          </div>
        </div>

        {/* Main Table Section */}
        <div className="bg-surface/80 backdrop-blur-md border border-outline-variant rounded-xl overflow-hidden shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead className="bg-surface-container-high border-b border-outline-variant">
                <tr>
                  <th className="px-6 py-4 text-label-md text-on-surface-variant font-bold uppercase tracking-wider">Client</th>
                  <th className="px-6 py-4 text-label-md text-on-surface-variant font-bold uppercase tracking-wider">Deal Value</th>
                  <th className="px-6 py-4 text-label-md text-on-surface-variant font-bold uppercase tracking-wider">Status</th>
                  <th className="px-6 py-4 text-label-md text-on-surface-variant font-bold uppercase tracking-wider">Outreach</th>
                  <th className="px-6 py-4 text-label-md text-on-surface-variant font-bold uppercase tracking-wider">Dev Team</th>
                  <th className="px-6 py-4 text-label-md text-on-surface-variant font-bold uppercase tracking-wider text-right">Club Cut</th>
                  <th className="px-6 py-4 text-label-md text-on-surface-variant font-bold uppercase tracking-wider text-right">Added</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant">
                {filteredProjects.length === 0 ? (
                  <tr>
                    <td colSpan="7" className="px-6 py-12 text-center text-on-surface-variant">
                      No projects match your criteria.
                    </td>
                  </tr>
                ) : (
                  filteredProjects.map(project => (
                    <tr 
                      key={project.id} 
                      className="hover:bg-surface-container transition-colors group cursor-pointer"
                      onClick={() => navigate(`/projects/${project.id}`)}
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded bg-outline-variant/30 flex items-center justify-center text-on-surface font-bold uppercase">
                            {project.client_name.charAt(0)}
                          </div>
                          <div>
                            <p className="text-body-md font-bold text-on-surface group-hover:text-primary transition-colors">{project.client_name}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 font-body-md text-on-surface font-semibold">{formatCurrency(project.deal_value)}</td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                          project.status === 'completed' || project.status === 'delivered' ? 'bg-secondary/20 text-secondary-fixed-dim' :
                          project.status === 'in_dev' ? 'bg-primary-container/20 text-primary' :
                          project.status === 'scouting' ? 'bg-surface-variant text-on-surface-variant' :
                          project.status === 'confirmed' ? 'bg-primary/20 text-primary-fixed-dim' :
                          'bg-tertiary/20 text-tertiary'
                        }`}>
                          {project.status.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-body-sm text-on-surface-variant">
                        {project.outreachShares.length > 0 ? project.outreachShares.map(o => o.memberName).join(', ') : 'None assigned'}
                      </td>
                      <td className="px-6 py-4 text-body-sm text-on-surface-variant">
                        {project.devs.length > 0 ? project.devs.map(d => d.memberName).join(', ') : 'None assigned'}
                      </td>
                      <td className="px-6 py-4 text-right text-body-sm font-bold text-emerald-400">{formatCurrency(project.clubFund)}</td>
                      <td className="px-6 py-4 text-right text-body-sm text-on-surface-variant">{formatDate(project.created_at)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Add Project Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-surface border border-outline-variant rounded-xl w-full max-w-xl shadow-2xl my-auto animate-in fade-in zoom-in duration-200">
            <div className="p-6 border-b border-outline-variant flex justify-between items-center bg-surface-container-low rounded-t-xl z-10">
              <h2 className="text-headline-sm font-bold text-primary">New Deal</h2>
              <button onClick={() => setIsModalOpen(false)} className="text-on-surface-variant hover:text-primary transition-colors p-1 rounded-full hover:bg-surface-container">
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>
            <form onSubmit={handleCreateProject} className="p-6 space-y-5">
              <div className="grid grid-cols-2 gap-5">
                <div className="col-span-2 sm:col-span-1">
                  <label className="block font-label-md text-on-surface-variant mb-2">CLIENT NAME</label>
                  <input
                    required
                    type="text"
                    value={clientName}
                    onChange={e => setClientName(e.target.value)}
                    className="w-full bg-background border border-outline-variant rounded-lg px-4 py-2 text-on-surface focus:ring-1 focus:ring-primary outline-none text-body-md"
                    placeholder="e.g. Nexus Corp"
                  />
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <label className="block font-label-md text-on-surface-variant mb-2">DEAL VALUE (₹)</label>
                  <input
                    required
                    type="number"
                    min="0"
                    value={dealValue}
                    onChange={e => setDealValue(e.target.value)}
                    className="w-full bg-background border border-outline-variant rounded-lg px-4 py-2 text-on-surface focus:ring-1 focus:ring-primary outline-none text-body-md"
                    placeholder="e.g. 50000"
                  />
                </div>
                
                <div className="col-span-2 sm:col-span-1">
                  <label className="block font-label-md text-on-surface-variant mb-2">DEV CUT %</label>
                  <input
                    required
                    type="number"
                    min="10"
                    max="20"
                    value={devCutPct}
                    onChange={e => setDevCutPct(Number(e.target.value))}
                    className="w-full bg-background border border-outline-variant rounded-lg px-4 py-2 text-on-surface focus:ring-1 focus:ring-primary outline-none text-body-md"
                  />
                  <p className="text-[10px] text-on-surface-variant mt-1 uppercase tracking-wider">Between 10% and 20%</p>
                </div>

                <div className="col-span-2">
                  <label className="block font-label-md text-on-surface-variant mb-2">OUTREACH MEMBERS (Hold Ctrl/Cmd to multi-select)</label>
                  <select
                    multiple
                    required
                    value={outreachMemberIds}
                    onChange={handleOutreachSelection}
                    className="w-full bg-background border border-outline-variant rounded-lg px-4 py-2 text-on-surface focus:ring-1 focus:ring-primary outline-none min-h-[100px] text-body-md"
                  >
                    {outreachCandidates.map(m => (
                      <option key={m.id} value={m.id} className="py-1">{m.name}</option>
                    ))}
                  </select>
                </div>

                {outreachMemberIds.length > 1 && (
                  <div className="col-span-2 bg-surface-container-high p-4 rounded-lg border border-outline-variant grid grid-cols-2 gap-4">
                    <div className="col-span-2 text-label-sm text-tertiary uppercase tracking-wider">Split outreach cut (must sum to 100)</div>
                    {outreachMemberIds.map(id => {
                      const m = outreachCandidates.find(d => d.id === id);
                      return (
                        <div key={id}>
                          <label className="block text-[10px] uppercase font-bold text-on-surface-variant mb-1">{m?.name} Share %</label>
                          <input
                            required
                            type="number"
                            min="0"
                            max="100"
                            value={outreachSplits[id] || ''}
                            onChange={e => handleOutreachSplitChange(id, e.target.value)}
                            className="w-full bg-background border border-outline-variant rounded-lg px-3 py-1.5 text-on-surface focus:ring-1 focus:ring-primary outline-none text-body-md"
                          />
                        </div>
                      );
                    })}
                  </div>
                )}

                <div className="col-span-2">
                  <label className="block font-label-md text-on-surface-variant mb-2">DEV MEMBERS (Hold Ctrl/Cmd to multi-select)</label>
                  <select
                    multiple
                    value={devMemberIds}
                    onChange={handleDevSelection}
                    className="w-full bg-background border border-outline-variant rounded-lg px-4 py-2 text-on-surface focus:ring-1 focus:ring-primary outline-none min-h-[100px] text-body-md"
                  >
                    {devCandidates.map(m => (
                      <option key={m.id} value={m.id} className="py-1">{m.name}</option>
                    ))}
                  </select>
                </div>

                {devMemberIds.length > 1 && (
                  <div className="col-span-2 bg-surface-container-high p-4 rounded-lg border border-outline-variant grid grid-cols-2 gap-4">
                    <div className="col-span-2 text-label-sm text-tertiary uppercase tracking-wider">Split dev cut (must sum to 100)</div>
                    {devMemberIds.map(id => {
                      const m = devCandidates.find(d => d.id === id);
                      return (
                        <div key={id}>
                          <label className="block text-[10px] uppercase font-bold text-on-surface-variant mb-1">{m?.name} Share %</label>
                          <input
                            required
                            type="number"
                            min="0"
                            max="100"
                            value={devSplits[id] || ''}
                            onChange={e => handleDevSplitChange(id, e.target.value)}
                            className="w-full bg-background border border-outline-variant rounded-lg px-3 py-1.5 text-on-surface focus:ring-1 focus:ring-primary outline-none text-body-md"
                          />
                        </div>
                      );
                    })}
                  </div>
                )}

                <div className="col-span-2">
                  <label className="block font-label-md text-on-surface-variant mb-2">NOTES</label>
                  <textarea
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    rows={3}
                    className="w-full bg-background border border-outline-variant rounded-lg px-4 py-2 text-on-surface focus:ring-1 focus:ring-primary outline-none resize-none text-body-md"
                    placeholder="Any additional details..."
                  />
                </div>
              </div>

              <div className="pt-6 border-t border-outline-variant flex gap-3 mt-6">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 py-3 rounded-lg border border-outline-variant text-label-md font-bold text-on-surface hover:bg-surface-container transition-colors uppercase tracking-wider"
                >
                  CANCEL
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 py-3 rounded-lg bg-primary text-on-primary font-label-md font-bold active:scale-95 transition-transform disabled:opacity-50 uppercase tracking-wider flex items-center justify-center gap-2"
                >
                  {isSubmitting ? (
                    <><span className="material-symbols-outlined animate-spin">sync</span> CREATING...</>
                  ) : (
                    'CREATE PROJECT'
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
