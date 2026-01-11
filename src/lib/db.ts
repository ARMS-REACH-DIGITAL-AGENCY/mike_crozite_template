// Replace this:
// export async function query<T = any>(text: string, params: any[] = []): Promise<QueryResult<T>> {
//   return pool.query<T>(text, params);
// }

// With this:
export async function query<T = any>(
  text: string,
  params: any[] = []
): Promise<QueryResult<T>> {
  // Don’t pass a generic into pool.query; it causes TS constraint errors in some pg/@types combos.
  return pool.query(text, params) as Promise<QueryResult<T>>;
}