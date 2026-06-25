export function formatCurrency(amount) {
  if (amount === undefined || amount === null) return '₹0';
  
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatDate(dateString) {
  if (!dateString) return '';
  const date = new Date(dateString);
  return new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  }).format(date);
}

// Determines the quarter string (e.g. "2026-Q1") for a given date
export function getQuarter(dateString) {
  const d = new Date(dateString);
  const q = Math.floor(d.getMonth() / 3) + 1;
  return `${d.getFullYear()}-Q${q}`;
}

// Calculates dynamic commission rate based on deals closed in the same quarter
export function calculateOutreachCommissionRate(memberId, targetProject, allProjects, allOutreachShares) {
  const memberProjectIds = allOutreachShares
    .filter(po => po.member_id === memberId)
    .map(po => po.project_id);

  const targetDate = targetProject.closed_at || targetProject.created_at;
  const targetQuarter = getQuarter(targetDate);

  const closedStatuses = ['advance_received', 'in_dev', 'delivered', 'completed'];
  const closedProjectsInQuarter = allProjects.filter(p => {
    if (!memberProjectIds.includes(p.id)) return false;
    // We include the target project even if it's not closed yet to project its rate
    if (!closedStatuses.includes(p.status) && p.id !== targetProject.id) return false;
    const pDate = p.closed_at || p.created_at;
    return getQuarter(pDate) === targetQuarter;
  });

  // Sort by closed date (or created fallback)
  closedProjectsInQuarter.sort((a, b) => new Date(a.closed_at || a.created_at) - new Date(b.closed_at || b.created_at));

  const index = closedProjectsInQuarter.findIndex(p => p.id === targetProject.id);

  let dealNumber;
  if (index !== -1) {
    dealNumber = index + 1;
  } else {
    // If it's somehow not in the list (e.g., brand new unsaved project), it would be the next one
    dealNumber = closedProjectsInQuarter.length + 1;
  }

  // Base 20%, +1% for each deal beyond the 1st
  const rate = 20 + (dealNumber - 1);
  return Math.min(rate, 30); // Capped at 30%
}

// Business Logic Calculations
export function calculateSplits(dealValue, outreachPct, outreachShares, devPct, devShares, transportClaimed) {
  // We calculate individual outreach cuts based on their dynamically computed rate
  // If no dynamic rate is provided, fallback to the old global outreachPct
  const outreachCuts = (outreachShares || []).map(share => {
    const rate = share.rate !== undefined ? share.rate : outreachPct;
    return {
      memberId: share.member_id,
      amount: (dealValue * (rate / 100)) * (share.share_pct / 100)
    };
  });
  
  const outreachCutTotal = outreachCuts.reduce((sum, cut) => sum + cut.amount, 0);
  
  const devCutTotal = (dealValue * (devPct / 100)) || 0;
  const transportCap = dealValue * 0.10;
  const actualTransport = Math.min(transportClaimed || 0, transportCap);
  
  const devCuts = (devShares || []).map(share => ({
    memberId: share.member_id,
    amount: devCutTotal * (share.share_pct / 100)
  }));
  
  const clubFund = dealValue - outreachCutTotal - devCutTotal - actualTransport;

  return {
    outreachCutTotal,
    outreachCuts,
    devCutTotal,
    devCuts,
    transportCap,
    actualTransport,
    clubFund
  };
}
