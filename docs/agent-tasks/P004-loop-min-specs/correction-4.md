# P004 boundary observability / pinned oracle correction

Final bounded spec-review addition: boundary checks must assert the returned minimum value as well as x/lowerBound. Otherwise NaN and undefined can be interchanged and still pass those comparisons. Independently verify pinned Node and VM values for NaN-first=>NaN, NaN-later=>1, first-hole/empty=>undefined, later-hole=>1, infinity and signed zero. Use explicit kind/value or existing oracle encodings; preserve NaN/undefined/-0 distinction. Also call assertPinnedNode() inside nativeObservation before execFileSync (Jest 24 beforeAll alone is insufficient; existing commonjs/oracle.ts explains this). These are test changes only. Finish the file/wiki/evidence handoff after these corrections, without additional exploratory scope.

## Domain/completion review refinement

Small correction to root's suggested witness values: use [0.25, 0.75] and [0.75, 0.25], rather than [1, 2]/[2, 1], so both witnesses stay within Math.random's [0,1) domain. Root supplied the integer examples; record this as a review refinement, not a worker-origin mistake. In scope(), also reject a forked completion/any nested boundary before reading the final scope; a stopped or thrown sibling cannot be counted as normal completion. No need to expand beyond these checks or reread broader VM code.
