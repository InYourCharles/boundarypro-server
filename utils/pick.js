// Copies only the listed fields out of a request body. Anything else the client sends (_id,
// createdAt, a made-up field) is ignored, so nobody can write to a field we did not plan for.
export default function pick(source, fields) {
  const picked = {};
  for (const field of fields) {
    if (source[field] !== undefined) picked[field] = source[field];
  }
  return picked;
}
