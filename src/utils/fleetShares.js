// #129: replace-set diff for fleet view-only shares. Given the grantee user_ids
// currently stored and the desired set, return which to add and which to remove.
// Pure + order-independent; deduped via Set.
export function diffShareSet(current = [], desired = []) {
  const cur = new Set((current || []).filter(Boolean));
  const des = new Set((desired || []).filter(Boolean));
  const added = [...des].filter(id => !cur.has(id));
  const removed = [...cur].filter(id => !des.has(id));
  return { added, removed };
}
