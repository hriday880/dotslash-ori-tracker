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

// Business Logic Calculations
export function calculateSplits(dealValue, outreachPct, outreachShares, devPct, devShares, transportClaimed) {
  const outreachCutTotal = (dealValue * (outreachPct / 100)) || 0;
  const devCutTotal = (dealValue * (devPct / 100)) || 0;
  const transportCap = dealValue * 0.10;
  const actualTransport = Math.min(transportClaimed || 0, transportCap);
  
  const outreachCuts = (outreachShares || []).map(share => ({
    memberId: share.member_id,
    amount: outreachCutTotal * (share.share_pct / 100)
  }));

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
