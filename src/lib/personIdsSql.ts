// YAT ID key transition, step 4 (docs/yat-key-transition.md; Pete, Nov 18
// 2026): one person, every card. Readers that still match rows by a player
// number (source tables keep the source's own number) match every number the
// registry attaches to the person instead of one card's number.
// `param` is the SQL placeholder holding any id of the person (YAT ID, TBC
// number or old card number). Each branch is an indexed lookup.
export function personIdsSql(param = '$1'): string {
  return `(SELECT ids.source_id FROM public.yat_registry_ids ids
            WHERE ids.yatid = public.yat_id_for(${param}::text)
              AND ids.source IN ('tbc','yat_card','yat_legacy')
           UNION SELECT public.yat_id_for(${param}::text)
           UNION SELECT ${param}::text)`;
}
