import { 
  getSchoolByHsid, 
  getActiveRosterByHsid, 
  getFlipCardFrontStageByHsid 
} from '../src/lib/db';
import axios from 'axios';

const WEBZ_API_TOKEN = process.env.WEBZ_API_TOKEN || 'e293311e-b089-4595-bb2c-1ea330fe1c81';
const BATCH_SIZE = 3; // Keep small to avoid URL length issues

// Sport-specific keywords to REJECT (False positives)
const REJECT_KEYWORDS = [
  'golf', 'pga', 'augusta', 'masters', 'basketball', 'dunk', 'nba', 'touchdown', 'nfl', 'football'
];

// Baseball-specific keywords to REQUIRE (Validation)
const BASEBALL_KEYWORDS = [
  'baseball', 'mlb', 'pitcher', 'batting', 'homerun', 'home run', 'shortstop', 'infielder', 'outfielder', 'catcher', 'inning', 'strikeout', 'rbi'
];

async function ingestNews(hsid: string) {
  console.log(`Starting smart ingest for HSID: ${hsid}`);
  
  const school = await getSchoolByHsid(hsid);
  if (!school) {
    console.error('School not found');
    return;
  }
  
  const schoolName = (school as any).hsname;
  const activeRoster = await getActiveRosterByHsid(hsid);
  const stageRows = await getFlipCardFrontStageByHsid(hsid);
  
  const stageMap = new Map((stageRows as any[]).map(p => [String(p.playerid), p]));
  const players = (activeRoster as any[]).map(p => {
    const stage = stageMap.get(String(p.playerid)) || {};
    return {
      id: String(p.playerid),
      name: `${p.firstname} ${p.lastname}`,
      team: stage.current_team_name || '',
      org: stage.current_org_or_conference_name || '',
      level: stage.level_label || '',
      gradClass: stage.class_of || '',
      status: stage.status_label || 'ACTIVE'
    };
  });

  console.log(`Found ${players.length} active players for ${schoolName}`);

  for (let i = 0; i < players.length; i += BATCH_SIZE) {
    const batch = players.slice(i, i + BATCH_SIZE);
    const query = `(${batch.map(p => `"${p.name}"`).join(' OR ')}) baseball`;
    
    console.log(`Querying Webz.io: ${query}`);
    
    try {
      const response = await axios.get('https://api.webz.io/newsApiLite', {
        params: {
          token: WEBZ_API_TOKEN,
          q: query
        }
      });

      const posts = response.data.posts || [];
      console.log(`Found ${posts.length} potential articles for batch`);

      for (const post of posts) {
        const title = (post.title || '').toLowerCase();
        const text = (post.text || '').toLowerCase();
        const combined = `${title} ${text}`;

        // 1. Find which player this article is about
        const matchedPlayer = batch.find(p => combined.includes(p.name.toLowerCase()));
        if (!matchedPlayer) continue;

        // 2. Smart Filter: Reject other sports
        const hasRejectKeyword = REJECT_KEYWORDS.some(k => combined.includes(k));
        if (hasRejectKeyword) {
          console.log(`REJECTED (Other Sport): ${post.title} for ${matchedPlayer.name}`);
          continue;
        }

        // 3. Smart Filter: Require baseball context
        const hasBaseballContext = BASEBALL_KEYWORDS.some(k => combined.includes(k));
        if (!hasBaseballContext) {
          console.log(`REJECTED (No Baseball Context): ${post.title} for ${matchedPlayer.name}`);
          continue;
        }

        // 4. Smart Filter: School/Team Validation (for non-MLB players)
        if (matchedPlayer.level !== 'MLB') {
          const teamName = matchedPlayer.team.toLowerCase();
          const orgName = matchedPlayer.org.toLowerCase();
          const hasTeamMatch = teamName && combined.includes(teamName);
          const hasOrgMatch = orgName && combined.includes(orgName);
          const hasSchoolMatch = schoolName && combined.includes(schoolName.toLowerCase());

          if (!hasTeamMatch && !hasOrgMatch && !hasSchoolMatch) {
            console.log(`REJECTED (Team/School Mismatch): ${post.title} for ${matchedPlayer.name} (Expected ${matchedPlayer.team})`);
            continue;
          }
        }

        // 5. Title Junk Filter
        if (title === 'facebook' || title === 'twitter' || title.length < 10) {
          console.log(`REJECTED (Junk Title): ${post.title}`);
          continue;
        }

        console.log(`ACCEPTED: ${post.title} for ${matchedPlayer.name}`);
        // Here we would insert into DB...
      }
    } catch (error: any) {
      console.error(`Error batch ${i}:`, error.message);
    }
  }
}

const hsid = process.argv[2] || '5004';
ingestNews(hsid);
