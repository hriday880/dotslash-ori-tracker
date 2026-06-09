import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../supabaseClient';
import { Plus, Loader2, X, Filter, Search } from 'lucide-react';
import { formatCurrency, formatDate, calculateSplits } from '../lib/utils';
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
  const [outreachCutPct, setOutreachCutPct] = useState(10);
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
        return { ...po, memberName: member?.name };
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
        outreach_cut_pct: outreachCutPct,
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
    return <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 animate-spin text-indigo-500" /></div>;
  }

  const outreachCandidates = members.filter(m => m.role === 'outreach' || m.role === 'both');
  const devCandidates = members.filter(m => m.role === 'dev' || m.role === 'both');

  return (
    <div>
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight">Projects</h1>
          <p className="text-gray-400 mt-1">Manage project lifecycle and financials.</p>
        </div>
        <button
          onClick={() => setIsModalOpen(true)}
          className="bg-[var(--color-accent-indigo)] hover:bg-indigo-500 text-white px-4 py-2 rounded-lg font-medium flex items-center gap-2 transition-colors"
        >
          <Plus className="w-5 h-5" />
          New Project
        </button>
      </div>

      <div className="bg-[var(--color-dark-surface)] border border-[var(--color-dark-border)] rounded-xl shadow-sm mb-6 p-4 flex flex-col xl:flex-row gap-4 justify-between">
        <div className="flex flex-wrap gap-2 bg-[#0f0f0f] p-1 rounded-lg border border-[var(--color-dark-border)]">
          {['all', 'scouting', 'confirmed', 'advance_received', 'in_dev', 'delivered', 'completed'].map(status => (
            <button
              key={status}
              onClick={() => setFilterStatus(status)}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                filterStatus === status 
                  ? 'bg-[var(--color-dark-surface)] text-white shadow-sm' 
                  : 'text-gray-400 hover:text-white hover:bg-[var(--color-dark-surface)]/50'
              }`}
            >
              {status === 'all' ? 'All' : status.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
            </button>
          ))}
        </div>
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            type="text"
            placeholder="Search clients..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="bg-[#0f0f0f] border border-[var(--color-dark-border)] rounded-lg pl-9 pr-4 py-2 text-white text-sm focus:ring-1 focus:ring-[var(--color-accent-indigo)] outline-none w-full xl:w-64"
          />
        </div>
      </div>

      <div className="bg-[var(--color-dark-surface)] border border-[var(--color-dark-border)] rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse whitespace-nowrap">
            <thead>
              <tr className="bg-[#1a1a1a] border-b border-[var(--color-dark-border)]">
                <th className="px-6 py-4 text-sm font-semibold text-gray-300">Client</th>
                <th className="px-6 py-4 text-sm font-semibold text-gray-300">Deal Value</th>
                <th className="px-6 py-4 text-sm font-semibold text-gray-300">Status</th>
                <th className="px-6 py-4 text-sm font-semibold text-gray-300">Outreach</th>
                <th className="px-6 py-4 text-sm font-semibold text-gray-300">Devs</th>
                <th className="px-6 py-4 text-sm font-semibold text-gray-300 text-right">Club Fund Cut</th>
                <th className="px-6 py-4 text-sm font-semibold text-gray-300 text-right">Date Added</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-dark-border)]">
              {filteredProjects.length === 0 ? (
                <tr>
                  <td colSpan="7" className="px-6 py-12 text-center text-gray-500">
                    No projects match your filters.
                  </td>
                </tr>
              ) : (
                filteredProjects.map(project => (
                  <tr key={project.id} className="hover:bg-[#2a2a2a] transition-colors group cursor-pointer" onClick={() => navigate(`/projects/${project.id}`)}>
                    <td className="px-6 py-4 font-medium text-white group-hover:text-indigo-400 transition-colors">
                      {project.client_name}
                    </td>
                    <td className="px-6 py-4 font-medium text-white">
                      {formatCurrency(project.deal_value)}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`text-xs px-2.5 py-1 rounded-full border font-medium ${getStatusColor(project.status)}`}>
                        {project.status.replace('_', ' ').toUpperCase()}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-gray-300">
                      {project.outreachShares.length > 0
                        ? project.outreachShares.map(o => o.memberName).join(', ')
                        : 'None assigned'}
                    </td>
                    <td className="px-6 py-4 text-gray-300">
                      {project.devs.length > 0 
                        ? project.devs.map(d => d.memberName).join(', ')
                        : 'None assigned'}
                    </td>
                    <td className="px-6 py-4 text-right font-medium text-emerald-400">
                      {formatCurrency(project.clubFund)}
                    </td>
                    <td className="px-6 py-4 text-right text-sm text-gray-400">
                      {formatDate(project.created_at)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Project Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 overflow-y-auto py-10">
          <div className="bg-[var(--color-dark-surface)] border border-[var(--color-dark-border)] rounded-xl w-full max-w-xl shadow-2xl my-auto">
            <div className="p-6 border-b border-[var(--color-dark-border)] flex justify-between items-center bg-[var(--color-dark-surface)] rounded-t-xl z-10">
              <h2 className="text-xl font-bold text-white">Add New Project</h2>
              <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-white transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleCreateProject} className="p-6 space-y-5">
              <div className="grid grid-cols-2 gap-5">
                <div className="col-span-2 sm:col-span-1">
                  <label className="block text-sm font-medium text-gray-300 mb-1">Client Name</label>
                  <input
                    required
                    type="text"
                    value={clientName}
                    onChange={e => setClientName(e.target.value)}
                    className="w-full bg-[var(--color-dark-bg)] border border-[var(--color-dark-border)] rounded-lg px-4 py-2 text-white focus:ring-1 focus:ring-[var(--color-accent-indigo)] outline-none"
                    placeholder="e.g. Acme Corp"
                  />
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <label className="block text-sm font-medium text-gray-300 mb-1">Deal Value (₹)</label>
                  <input
                    required
                    type="number"
                    min="0"
                    value={dealValue}
                    onChange={e => setDealValue(e.target.value)}
                    className="w-full bg-[var(--color-dark-bg)] border border-[var(--color-dark-border)] rounded-lg px-4 py-2 text-white focus:ring-1 focus:ring-[var(--color-accent-indigo)] outline-none"
                    placeholder="e.g. 50000"
                  />
                </div>
                
                <div className="col-span-2 sm:col-span-1">
                  <label className="block text-sm font-medium text-gray-300 mb-1">Outreach Cut %</label>
                  <input
                    required
                    type="number"
                    min="1"
                    max="100"
                    value={outreachCutPct}
                    onChange={e => setOutreachCutPct(Number(e.target.value))}
                    className="w-full bg-[var(--color-dark-bg)] border border-[var(--color-dark-border)] rounded-lg px-4 py-2 text-white focus:ring-1 focus:ring-[var(--color-accent-indigo)] outline-none"
                  />
                </div>

                <div className="col-span-2 sm:col-span-1">
                  <label className="block text-sm font-medium text-gray-300 mb-1">Dev Cut %</label>
                  <input
                    required
                    type="number"
                    min="10"
                    max="20"
                    value={devCutPct}
                    onChange={e => setDevCutPct(Number(e.target.value))}
                    className="w-full bg-[var(--color-dark-bg)] border border-[var(--color-dark-border)] rounded-lg px-4 py-2 text-white focus:ring-1 focus:ring-[var(--color-accent-indigo)] outline-none"
                  />
                  <p className="text-xs text-gray-500 mt-1">Between 10% and 20%</p>
                </div>

                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-300 mb-1">Outreach Members (Hold Ctrl/Cmd to multi-select)</label>
                  <select
                    multiple
                    required
                    value={outreachMemberIds}
                    onChange={handleOutreachSelection}
                    className="w-full bg-[var(--color-dark-bg)] border border-[var(--color-dark-border)] rounded-lg px-4 py-2 text-white focus:ring-1 focus:ring-[var(--color-accent-indigo)] outline-none min-h-[100px]"
                  >
                    {outreachCandidates.map(m => (
                      <option key={m.id} value={m.id} className="py-1">{m.name}</option>
                    ))}
                  </select>
                </div>

                {outreachMemberIds.length > 1 && (
                  <div className="col-span-2 bg-[#2a2a2a]/30 p-4 rounded-lg border border-[#2a2a2a] grid grid-cols-2 gap-4">
                    <div className="col-span-2 text-sm text-amber-400 font-medium">Split outreach cut (must sum to 100)</div>
                    {outreachMemberIds.map(id => {
                      const m = outreachCandidates.find(d => d.id === id);
                      return (
                        <div key={id}>
                          <label className="block text-xs font-medium text-gray-400 mb-1">{m?.name} Share %</label>
                          <input
                            required
                            type="number"
                            min="0"
                            max="100"
                            value={outreachSplits[id] || ''}
                            onChange={e => handleOutreachSplitChange(id, e.target.value)}
                            className="w-full bg-[#0f0f0f] border border-[var(--color-dark-border)] rounded-lg px-3 py-1.5 text-white focus:ring-1 focus:ring-[var(--color-accent-indigo)] outline-none"
                          />
                        </div>
                      );
                    })}
                  </div>
                )}

                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-300 mb-1">Dev Members (Hold Ctrl/Cmd to multi-select)</label>
                  <select
                    multiple
                    value={devMemberIds}
                    onChange={handleDevSelection}
                    className="w-full bg-[var(--color-dark-bg)] border border-[var(--color-dark-border)] rounded-lg px-4 py-2 text-white focus:ring-1 focus:ring-[var(--color-accent-indigo)] outline-none min-h-[100px]"
                  >
                    {devCandidates.map(m => (
                      <option key={m.id} value={m.id} className="py-1">{m.name}</option>
                    ))}
                  </select>
                </div>

                {devMemberIds.length > 1 && (
                  <div className="col-span-2 bg-[#2a2a2a]/30 p-4 rounded-lg border border-[#2a2a2a] grid grid-cols-2 gap-4">
                    <div className="col-span-2 text-sm text-amber-400 font-medium">Split dev cut (must sum to 100)</div>
                    {devMemberIds.map(id => {
                      const m = devCandidates.find(d => d.id === id);
                      return (
                        <div key={id}>
                          <label className="block text-xs font-medium text-gray-400 mb-1">{m?.name} Share %</label>
                          <input
                            required
                            type="number"
                            min="0"
                            max="100"
                            value={devSplits[id] || ''}
                            onChange={e => handleDevSplitChange(id, e.target.value)}
                            className="w-full bg-[#0f0f0f] border border-[var(--color-dark-border)] rounded-lg px-3 py-1.5 text-white focus:ring-1 focus:ring-[var(--color-accent-indigo)] outline-none"
                          />
                        </div>
                      );
                    })}
                  </div>
                )}

                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-300 mb-1">Notes</label>
                  <textarea
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    rows={3}
                    className="w-full bg-[var(--color-dark-bg)] border border-[var(--color-dark-border)] rounded-lg px-4 py-2 text-white focus:ring-1 focus:ring-[var(--color-accent-indigo)] outline-none resize-none"
                    placeholder="Any additional details..."
                  />
                </div>
              </div>

              <div className="pt-4 mt-2 border-t border-[var(--color-dark-border)] flex justify-end gap-3 bg-[var(--color-dark-surface)] pb-2">
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
                  className="bg-[var(--color-accent-indigo)] hover:bg-indigo-500 disabled:opacity-50 text-white px-6 py-2 rounded-lg font-medium transition-colors"
                >
                  {isSubmitting ? 'Creating...' : 'Create Project'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
