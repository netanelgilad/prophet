function min(arr) {
  if (arr.length === 1) return arr[0];
  const tailMin = min(arr.slice(1));
  return arr[0] < tailMin ? arr[0] : tailMin;
}

const d = [
  Math.random(), Math.random(), Math.random(), Math.random(), Math.random(),
  Math.random(), Math.random(), Math.random(), Math.random(), Math.random()
];

const x = d[0] < min(d);
