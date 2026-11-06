# Duplicate TBC high-school IDs — review queue (Nov 5, 2026)

**No player assignments changed.** This is a decision sheet for the 715 otherwise-ambiguous player assignments in the isolated PR #691 source snapshot. The 715 records reduce to **72 exact school-name and location duplicates** in `tbc_schools_raw`. Each duplicate pair has two distinct TBC HSID records for the same display name and location. This is strong evidence of duplicate school identities but **not authority to silently choose a canonical HSID**; selecting a primary may require redirecting school hubs and merging known records.

- 382 players already have a card but were held because the source key resolves to two school IDs; do not change their existing verified school relationship until canonicalization is reviewed.
- 333 players have no card and are waiting for a school-ID decision.
- No card identity should be reassigned solely because one duplicate HSID has a numerically smaller ID.
- Review school-program ownership, established microsite/roster, past school identity mappings and existing 2026 alumni before marking a canonical HSID. Then run a separate dry-run for affected player cards and rerun release gates.

| School key | Candidate HSIDs | Existing cards | New cards held | Players | Mascots in two records |
|---|---|---:|---:|---:|---|
| Rocky Mountain (Meridian,ID) | 13600 / 17598 | 21 | 17 | 38 | Grizzlies / Grizzlies |
| Pickerington Central (Pickerington,OH) | 12238 / 18905 | 4 | 28 | 32 | Tigers / Tigers |
| Moanalua (Honolulu,HI) | 10963 / 17734 | 17 | 8 | 25 | Menehunes / Menehune |
| Warwick Valley (Warwick,NY) | 14109 / 16923 | 12 | 13 | 25 | Wildcats / Wildcats |
| Granite City (Granite City,IL) | 2193 / 16828 | 24 | 0 | 24 | Warriors / Warriors |
| PDG Baseball Academy (Fredericksburg,VA) | 18088 / 19231 | 22 | 0 | 22 | - / - |
| Alleman (Rock Island,IL) | 3004 / 18030 | 21 | 0 | 21 | Pioneers / Pioneers |
| Somerset (Somerset,PA) | 2577 / 18626 | 21 | 0 | 21 | Golden Eagles / - |
| Francis T. Maloney (Meriden,CT) | 4711 / 5938 | 0 | 17 | 17 | Spartans / Spartans |
| Valley Center (Valley Center,CA) | 11238 / 16187 | 7 | 10 | 17 | Jaguars / Jaguars |
| Woodrow Wilson (Washington,DC) | 10187 / 16651 | 10 | 7 | 17 | Spartans / Tigers |
| Sauk Rapids-Rice (Sauk Rapids,MN) | 9923 / 12079 | 0 | 16 | 16 | Storm / Storm |
| Buffalo (Buffalo,MN) | 12983 / 18734 | 0 | 14 | 14 | Bison / - |
| Camden County (Kingsland,GA) | 3586 / 16675 | 14 | 0 | 14 | Wildcats / Wildcats |
| Washingtonville (Washingtonville,NY) | 8298 / 17931 | 4 | 10 | 14 | Wizards / Wizards |
| Appomattox County (Appomattox,VA) | 3070 / 15092 | 4 | 9 | 13 | Raiders / Raiders |
| Hendrick Hudson (Montrose,NY) | 11756 / 18478 | 5 | 8 | 13 | Sailors / Sailors |
| Logan County (Russellville,KY) | 312 / 16107 | 13 | 0 | 13 | Cougars / Cougars |
| Brewster (Brewster,WA) | 3456 / 17822 | 12 | 0 | 12 | Bears / Bears |
| Greenbrier (Greenbrier,AR) | 12807 / 16680 | 6 | 6 | 12 | Panthers / Panthers |
| Muscle Shoals (Muscle Shoals,AL) | 10595 / 13566 | 0 | 12 | 12 | Trojans / Trojans |
| Pioneer (Woodland,CA) | 9258 / 16868 | 8 | 4 | 12 | Patriots / Patriots |
| Scotlandville (Baton Rouge,LA) | 7357 / 17811 | 5 | 7 | 12 | Eagles / Hornets |
| Springfield (Springfield,MN) | 7649 / 18458 | 5 | 7 | 12 | Tigers / Tigers |
| Union Pines (Cameron,NC) | 11232 / 18936 | 2 | 10 | 12 | Vikings / Vikings |
| West Florida (Pensacola,FL) | 9378 / 15418 | 9 | 3 | 12 | Jaguars / Jaguars |
| Westside (Anderson,SC) | 11010 / 18816 | 4 | 8 | 12 | Rams / - |
| Giddings (Giddings,TX) | 882 / 18577 | 11 | 0 | 11 | Buffaloes / Buffaloes |
| Lapel (Lapel,IN) | 15382 / 18699 | 11 | 0 | 11 | Bulldogs / - |
| Monroe Area (Monroe,GA) | 6255 / 6261 | 0 | 11 | 11 | Tornadoes / Hurricanes |
| Sweet Home (Amherst,NY) | 7905 / 14171 | 0 | 11 | 11 | Panthers / Panthers |
| Floral Park Memorial (Floral Park,NY) | 4632 / 6137 | 0 | 10 | 10 | - / Knights |
| Northern (Dillsburg,PA) | 6600 / 13117 | 0 | 10 | 10 | Polar Bears / Polar Bears |
| Southern Lehigh (Center Valley,PA) | 11772 / 19167 | 2 | 8 | 10 | Spartans / - |
| Westhampton Beach (Westhampton Beach,NY) | 8447 / 16897 | 5 | 5 | 10 | Hurricanes / Hurricanes |
| Portland (Portland,CT) | 6961 / 19214 | 1 | 7 | 8 | Bulldogs / - |
| South View (Hope Mills,NC) | 7599 / 13655 | 0 | 8 | 8 | Tigers / Tigers |
| Circle (Towanda,KS) | 17004 / 17810 | 7 | 0 | 7 | Thunderbirds / - |
| Scottsdale Christian Academy (Scottsdale,AZ) | 17263 / 18077 | 7 | 0 | 7 | Eagles / Eagles |
| Shakamak (Jasonville,IN) | 10242 / 16460 | 5 | 2 | 7 | Lakers / Lakers |
| Spring Lake Park (Spring Lake Park,MN) | 9727 / 19026 | 1 | 6 | 7 | Panthers / - |
| Decorah (Decorah,IA) | 10795 / 18033 | 2 | 4 | 6 | Vikings / - |
| John Milledge Academy (Milledgeville,GA) | 6204 / 18670 | 2 | 4 | 6 | Trojans / Trojans |
| Massac County (Metropolis,IL) | 16133 / 16140 | 6 | 0 | 6 | Patriots / Patriots |
| Michigan Lutheran (St. Joseph,MI) | 17696 / 18851 | 6 | 0 | 6 | - / - |
| Rayne (Rayne,LA) | 11701 / 18815 | 1 | 5 | 6 | Wolves / - |
| The Meadows School (Las Vegas,NV) | 16563 / 19256 | 6 | 0 | 6 | Mustangs / Mustangs |
| Valencia (Los Lunas,NM) | 14780 / 18874 | 3 | 3 | 6 | Jaguars / - |
| Aurora (Aurora,MO) | 16212 / 18189 | 5 | 0 | 5 | Houn Dawgs / - |
| Detroit Lakes (Detroit Lakes,MN) | 12719 / 14698 | 0 | 5 | 5 | Lakers / Lakers |
| Mexico (Mexico,MO) | 6171 / 16082 | 4 | 1 | 5 | - / Bulldogs |
| Sacred Heart (Vineland,NJ) | 11263 / 14194 | 0 | 5 | 5 | Lions / Lions |
| Bronx School of Law (Bronx,NY) | 16181 / 18916 | 4 | 0 | 4 | - / - |
| Lampasas (Lampasas,TX) | 5645 / 16201 | 3 | 1 | 4 | - / Badgers |
| Mountain Grove (Mountain Grove,MO) | 15516 / 18415 | 4 | 0 | 4 | Panthers / - |
| Prospect Ridge Academy (Broomfield,CO) | 17823 / 18358 | 4 | 0 | 4 | Miners / Miners |
| Raceland (Raceland,KY) | 17018 / 17915 | 4 | 0 | 4 | Rams / Rams |
| Shelby County (Columbiana,AL) | 13025 / 18763 | 1 | 3 | 4 | Wildcats / - |
| South Ridge (Culver,MN) | 17574 / 17874 | 4 | 0 | 4 | Panthers / - |
| Blind Brook (Rye Brook,NY) | 13670 / 15451 | 0 | 3 | 3 | Trojans / Trojans |
| Flatirons Academy (Westminster,CO) | 17189 / 18103 | 3 | 0 | 3 | - / - |
| Kennedy (Mount Angel,OR) | 18341 / 19000 | 3 | 0 | 3 | - / - |
| Unaka (Elizabethton,TN) | 8100 / 17656 | 1 | 2 | 3 | Rangers / - |
| Wellsburg (Wellsburg,WV) | 2546 / 14604 | 2 | 1 | 3 | - / - |
| Whitmire Community (Whitmire,SC) | 2778 / 18942 | 3 | 0 | 3 | Wolverines / - |
| Williamsfield (Williamsfield,IL) | 17976 / 19267 | 3 | 0 | 3 | - / - |
| Apollo-Ridge (Spring Church,PA) | 13582 / 18188 | 1 | 1 | 2 | Vikings / - |
| Bolivar-Richburg (Bolivar,NY) | 14899 / 18961 | 1 | 1 | 2 | Wolverines / - |
| Clinch County (Homerville,GA) | 15081 / 16504 | 1 | 1 | 2 | Panthers / Panthers |
| Spring Hills (Martinsburg,WV) | 16307 / 18311 | 2 | 0 | 2 | Cardinals / - |
| Stonewall (Stonewall,OK) | 13328 / 17218 | 1 | 1 | 2 | Longhorns / - |
| Whitefish (Whitefish,MT) | 18086 / 18453 | 2 | 0 | 2 | - / - |

Source-run ID: `c771515b-cd92-49a0-a6e8-bb045bd9d8fa`. All counts refer to the immutable 208,427-player test capture. Fresh full-source reconciliation remains a separate release gate.
