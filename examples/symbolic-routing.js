function route(score, record) {
  if (score < 0.5) {
    record.lane = "left";
    record.accepted = true;
    return "left";
  }
  record.lane = "right";
  record.accepted = false;
  return "right";
}

const score = Math.random();
const record = { lane: "pending", accepted: false };
const alias = record;
const lane = route(score, record);

// The lane is unknown, but the return value and the aliased object agree.
const consistent = lane === alias.lane;
const valid = score < 0.5
  ? lane === "left" && alias.accepted
  : lane === "right" && !alias.accepted;
const impossible = score < 0.5 && lane === "right";
const uncertain = lane === "left";
