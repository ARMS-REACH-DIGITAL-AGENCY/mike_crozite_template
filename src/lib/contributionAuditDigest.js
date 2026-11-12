// Human-readable, read-only presentation of append-only contribution audit data.
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, c => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[c]));

const asObject = (value) => value && typeof value === 'object' && !Array.isArray(value)
  ? value : value == null ? {} : { value };

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
  }
  return value;
}
const same = (a, b) => JSON.stringify(stable(a)) === JSON.stringify(stable(b));

const fieldLabels = {
  status: 'Status', display_status: 'Displayed status', team: 'Team',
  org: 'Organization', level: 'Level', teamid: 'Team ID',
  source: 'Data source', value: 'Value'
};
const fieldLabel = (key) => fieldLabels[key] || key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

function valueLabel(value) {
  if (value === null || value === undefined || value === '') return 'blank';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  const string = typeof value === 'object' ? JSON.stringify(value) : String(value);
  if (string.length <= 140) return string;
  return `${string.slice(0, 115)}…${string.slice(-15)}`;
}

function changedParts(before, after) {
  const oldValues = asObject(before);
  const newValues = asObject(after);
  const keys = [...new Set([...Object.keys(oldValues), ...Object.keys(newValues)])]
    .filter(key => !same(oldValues[key], newValues[key]));
  if (keys.includes('status') && keys.includes('display_status') &&
      same(oldValues.status, oldValues.display_status) &&
      same(newValues.status, newValues.display_status)) {
    keys.splice(keys.indexOf('display_status'), 1);
  }
  if (keys.includes('team') && keys.includes('teamid')) {
    keys.splice(keys.indexOf('teamid'), 1); // Show meaningful team names rather than numeric IDs.
  }
  if (keys.includes('team') && keys.includes('org') &&
      same(oldValues.team, oldValues.org) && same(newValues.team, newValues.org)) {
    keys.splice(keys.indexOf('org'), 1);
  }
  if (keys.includes('source') && keys.length > 1) {
    keys.splice(keys.indexOf('source'), 1); // The data source is shown after the change.
  }
  const priority = ['status', 'team', 'org', 'level', 'teamid', 'source'];
  keys.sort((a, b) => {
    const x = priority.indexOf(a); const y = priority.indexOf(b);
    return (x < 0 ? 100 : x) - (y < 0 ? 100 : y) || a.localeCompare(b);
  });
  return keys.map(key => `${fieldLabel(key)}: ${valueLabel(oldValues[key])} → ${valueLabel(newValues[key])}`);
}

function sourceLabel(value) {
  if (value === 'mlb_api') return 'MLB roster sync';
  if (value === 'mlb_api_afl') return 'Arizona Fall League sync';
  if (!value || value === 'unknown') return 'UNKNOWN SOURCE';
  return value.replace(/_/g, ' ');
}

function recordLabel(record) {
  const id = record.playerid || record.entity_id;
  const name = record.player_name || (record.entity_type === 'player' ? 'Player' : fieldLabel(record.entity_type || 'Record'));
  return `${name} (#${id})${record.school_name ? ` · ${record.school_name}` : ''}`;
}

function localTime(value) {
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat('en-US', { timeZone: 'America/Phoenix', hour: 'numeric', minute: '2-digit', hour12: true }).format(date)
    : 'Time unknown';
}

function buildAuditEmail(day, groups, exceptionalEvents, sourceCounts) {
  const net = groups.filter(group => !same(group.before_data, group.after_data));
  const reverted = groups.filter(group => group.event_count > 1 && same(group.before_data, group.after_data));
  const noOps = groups.filter(group => group.event_count === 1 && same(group.before_data, group.after_data));
  const aflReversions = reverted.filter(group => group.entity_type === 'player' &&
    group.sources?.includes('mlb_api') && group.sources?.includes('mlb_api_afl') &&
    group.event_count >= 4 && !group.unknown_events && !group.attributed_events);
  const otherReversions = reverted.filter(group => !aflReversions.includes(group));
  const totalEvents = groups.reduce((sum, group) => sum + Number(group.event_count || 0), 0);
  const attributed = groups.reduce((sum, group) => sum + Number(group.attributed_events || 0), 0);
  const aflEvents = aflReversions.reduce((sum, group) => sum + Number(group.event_count || 0), 0);
  const reviewCount = exceptionalEvents.length + otherReversions.length + (aflReversions.length ? 1 : 0);
  const subject = `YAT?STATS Daily Change Summary — ${day} (${net.length} net, ${reviewCount} review)`;
  const lines = (items) => items.length ? `<ul style="margin:6px 0 14px;padding-left:24px">${items.map(item =>
    `<li style="padding:4px 0;line-height:1.5">${escapeHtml(item)}</li>`).join('')}</ul>` : '<p>None.</p>';
  const netLines = net.map(group => `${recordLabel(group)} — ${changedParts(group.before_data, group.after_data).join('; ') || 'Record changed'} [${sourceLabel(group.latest_source)}; ${group.event_count} event${group.event_count === 1 ? '' : 's'}]`);
  const reviewLines = exceptionalEvents.map(event => `${localTime(event.occurred_at)} — ${recordLabel(event)} — ${changedParts(event.before_data, event.after_data).join('; ') || 'Change logged'} [${sourceLabel(event.source)}${event.actor_email || event.actor_uid ? `; by ${event.actor_email || event.actor_uid}` : '; no actor recorded'}]`);
  const otherReversionLines = otherReversions.map(group => `${recordLabel(group)} — ${group.event_count} changes were reversed; ending record matches its starting record [${(group.sources || []).map(sourceLabel).join(' / ')}]`);
  const aflExamples = aflReversions.slice(0, 6).map(record => record.player_name || `#${record.playerid}`).join(', ');
  const aflNote = aflReversions.length ? `<p><strong>${aflReversions.length} player${aflReversions.length === 1 ? '' : 's'} / ${aflEvents} automated writes:</strong> regular MLB/MiLB roster data repeatedly replaced Arizona Fall League data and vice versa. Their starting and ending audit values match. Examples: ${escapeHtml(aflExamples)}. This recurring overwrite pattern needs technical review; it is not ${aflEvents} genuine transfers.</p>` : '';
  const sourceLine = sourceCounts.length ? sourceCounts.map(row => `${sourceLabel(row.source)}: ${Number(row.events)}`).join(' · ') : 'No activity';
  const html = `<div style="font:15px/1.5 Arial,Helvetica,sans-serif;color:#222;max-width:760px">
    <h2 style="margin:0 0 8px">YAT?STATS Daily Change Summary — ${escapeHtml(day)}</h2>
    <p style="margin:0 0 14px"><strong>${totalEvents} logged events · ${groups.length} affected records · ${net.length} net change${net.length === 1 ? '' : 's'} · ${reverted.length} fully reverted · ${noOps.length} no-op · ${attributed} attributed to a user</strong></p>
    <h3 style="margin:20px 0 6px">Review these changes (${reviewCount})</h3>
    ${lines(reviewLines)}${aflNote}${otherReversions.length ? `<p><strong>Other reversed activity:</strong></p>${lines(otherReversionLines)}` : ''}
    <h3 style="margin:20px 0 6px">What actually changed (${net.length})</h3>
    ${lines(netLines)}
    <p style="margin-top:16px;font-size:13px;color:#555"><strong>Sources:</strong> ${escapeHtml(sourceLine)}</p>
    <p style="font-size:13px;color:#555">Times are Arizona time. This report compares each record's first "before" and last "after" value for the day. Intermediate unknown-source or attributed edits are listed above. All individual events remain in the append-only contribution_change_audit database; this summary does not modify player records.</p>
  </div>`;
  return { subject, html, totalEvents, netCount: net.length, revertedCount: reverted.length,
    reviewCount, aflRevertedCount: aflReversions.length, attributedCount: attributed, noOpCount: noOps.length };
}

module.exports = { buildAuditEmail, changedParts, same };
