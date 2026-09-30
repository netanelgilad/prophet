// The runner supplies d as a nonempty dense array of unknown length. Each
// element is an unknown finite number in [0, 1), like a Math.random() result.
// The VM receives no information about what these functions compute.
function min(arr) {
  if (arr.length === 1) return arr[0];
  const rest = min(arr.slice(1));
  return arr[0] < rest ? arr[0] : rest;
}

function max(arr) {
  if (arr.length === 1) return arr[0];
  const rest = max(arr.slice(1));
  if (arr[0] > rest) return arr[0];
  return rest;
}

const x = d[0] < min(d);
const aboveMaximum = d[0] > max(d);
const minimum = min(d);
const strict = minimum < d[0];
const length = d.length;
