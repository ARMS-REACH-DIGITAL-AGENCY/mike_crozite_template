import { neon } from '@neondatabase/serverless';
import * as dotenv from 'dotenv';
import axios from 'axios';

dotenv.config({ path: '.env.local' });

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://neondb_owner:npg_DO64PBRUgnTE@ep-tiny-bird-a44r67gp-pooler.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require';
const WEBZ_API_TOKEN = 'e293311e-b089-4595-bb2c-1ea330fe1c81';

const sql = neon(DATABASE_URL);

async function ingestNews(hsid: string) {
  console.log(`Starting news ingest for HSID: ${hsid}`);

  // 1. Get active players for this school with their metadata
  const players = await sql`
    SELECT playerid, display_name, first_name, last_name, class_of, level_label, status_label, current_team_name, current_org_or_conference_name, roster_years
    FROM flip_card_front_stage
    WHERE hsid = ${hsid} AND status_label = 'ACTIVE'
  `;

  console.log(`Found ${players.length} active players.`);

  // 2. Batch players to avoid long URLs (3 per batch)
  const batchSize = 3;
  for (let i = 0; i < players.length; i += batchSize) {
    const batch = players.slice(i, i + batchSize);
    const queryParts = batch.map(p => `"${p.display_name}"`);
    const query = `(${queryParts.join(' OR ')}) baseball`;

    console.log(`Querying Webz.io for batch ${Math.floor(i/batchSize) + 1}: ${query}`);

    try {
      const response = await axios.get('https://api.webz.io/newsApiLite', {
        params: {
          token: WEBZ_API_TOKEN,
          q: query,
          sort: 'relevancy'
        }
      });

      const posts = response.data.posts || [];
      console.log(`Found ${posts.length} articles for this batch.`);

      for (const post of posts) {
        // 3. Advanced Filtering
        const title = post.title || '';
        const text = post.text || '';
        
        // Filter 1: Junk titles
        if (['facebook', 'twitter', 'instagram', 'linkedin'].includes(title.toLowerCase())) continue;

        // Filter 2: Proximity/Relevance check (e.g., Drew Swift vs "drew swift criticism")
        // We check if at least one player in the batch is actually mentioned in a baseball context
        const isRelevant = batch.some(p => {
          const nameRegex = new RegExp(p.display_name, 'i');
          if (!nameRegex.test(title) && !nameRegex.test(text)) return false;
          
          const baseballTerms = ['baseball', 'mlb', 'pitcher', 'batting', 'homerun', 'shortstop', 'roster', 'game', 'league', 'team'];
          return baseballTerms.some(term => text.toLowerCase().includes(term) || title.toLowerCase().includes(term));
        });

        if (!isRelevant) {
          console.log(`Skipping irrelevant article: ${title}`);
          continue;
        }

        // 4. Match article to specific player in batch
        const matchedPlayer = batch.find(p => {
          const nameRegex = new RegExp(p.display_name, 'i');
          return nameRegex.test(title) || nameRegex.test(text);
        });

        if (matchedPlayer) {
          // 5. Insert into DB with metadata
          try {
            await sql`
              INSERT INTO news_articles (
                uuid, playerid, player_name, hsid, title, source, source_full, 
                published_at, url, image_url, snippet, sentiment,
                class_of, level_label, status_label, current_team_name, 
                current_org_or_conference_name, roster_years
              ) VALUES (
                ${post.uuid}, ${matchedPlayer.playerid}, ${matchedPlayer.display_name}, ${hsid}, 
                ${post.title}, ${post.thread.site}, ${post.thread.site_full}, 
                ${post.published}, ${post.url}, ${post.thread.main_image}, 
                ${post.highlightText}, ${post.sentiment},
                ${matchedPlayer.class_of}, ${matchedPlayer.level_label}, ${matchedPlayer.status_label}, 
                ${matchedPlayer.current_team_name}, ${matchedPlayer.current_org_or_conference_name}, 
                ${matchedPlayer.roster_years}
              ) ON CONFLICT (uuid) DO UPDATE SET
                class_of = EXCLUDED.class_of,
                level_label = EXCLUDED.level_label,
                status_label = EXCLUDED.status_label,
                current_team_name = EXCLUDED.current_team_name,
                current_org_or_conference_name = EXCLUDED.current_org_or_conference_name,
                roster_years = EXCLUDED.roster_years
            `;
            console.log(`Inserted/Updated article: ${post.title} for ${matchedPlayer.display_name}`);
          } catch (dbErr) {
            console.error(`DB Insert error for ${post.uuid}:`, dbErr);
          }
        }
      }
    } catch (apiErr) {
      console.error(`Webz.io API error for batch:`, apiErr.response?.data || apiErr.message);
    }
    
    // Small delay to be nice to the API
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  console.log('Ingest complete.');
}

const hsid = process.argv[2] || '5004';
ingestNews(hsid).catch(console.error);
