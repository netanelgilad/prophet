# Whole substring Test262 candidates

All 43 installed complete unmodified files were read and run in pinned Node
v24.21.0 with standard sta/assert and original includes, strict and sloppy
variants (86/86 pass). Whole VM evaluation activates all 14 compatible files
(28 variants); 29 remain inactive with exact errors/stacks in per-run artifacts.
No runner semantic/harness additions, edited test fragments, removals or new skips.

The installed candidate hashes/metadata/argv/status/raw stderr are recorded and
recomputed in evidence. `Unfinished execution` is the runner's honest rejection
of a typed boundary, not a guest throw or passing assertion. Array receiver files
A3_T1–T4 reach the declared exotic conversion guard; A3_T9 reaches partial Math
write metadata. A11/A8/A9 reach direct function hasOwnProperty metadata; descriptor
helpers include propertyHelper.js and remain unsupported by the runner. Other
wrapper/Number-prototype/Function-constructor blockers are listed below.

None of these 43 files requests modern BigInt/Symbol/custom-hook behavior; local
pinned controls cover those conservative gaps, actual UTF-16 and ordered effects.
Quoted BigInt-looking/ordinary keys and unchanged P011 guard regressions remain.

| Whole filename | SHA-256 | VM disposition (both variants) |
| --- | --- | --- |
| S15.5.4.15_A10.js | bd355ea725bd4abcdab76175d4284ffdb9672e60ec8d3b7291ebcaa99a3f9ec0 | Unsupported Test262 includes: propertyHelper.js |
| S15.5.4.15_A11.js | a4b3a961ab30429748aa991e9c0c23f57d10df234f298ee4d6b238eb84023e33 | Unfinished execution in Test262 test |
| S15.5.4.15_A1_T1.js | 0907dba95588a425a2275209ebfef0d27e6d00e5933aabcc0b0df332fc26d3c3 | Object primitive wrapper construction is not yet supported |
| S15.5.4.15_A1_T10.js | 97832c90b0d42a13d45942b5f79e10389dab84ba24721fa6a0be3a894572e949 | active |
| S15.5.4.15_A1_T11.js | fa3f1124c2955c69105c200de993b7aca1eff00691e76ed9efba56890905b6ba | active |
| S15.5.4.15_A1_T12.js | 89767ddaa3bc1475843464f27600190adfb23e63897c96564d5f9f26f5af5269 | String wrapper construction is not yet supported |
| S15.5.4.15_A1_T13.js | f5e7b7c1e42b2657ceb6d30405a8652c7d13cbed73d9f076ba2c9ca2f38869c7 | active |
| S15.5.4.15_A1_T14.js | fb2a3632a1282badb012fbc198ee6c956dc89bda9aa6db3c435ca7c92ed89623 | active |
| S15.5.4.15_A1_T15.js | dd9bd6993de0d21c616a6b15cda83e46d7cb5f9da1d59bad76a67eb383399870 | Unmodeled host property 'substring': Number prototype API |
| S15.5.4.15_A1_T2.js | 44c41f6865e278d695fb5317f15d6a57be2a119b9ee5a9d467855f3c95b74ba2 | Boolean wrapper construction is not yet supported |
| S15.5.4.15_A1_T4.js | d7775003f73b80a94b61b8327674d3e40626a0e1248c36149cfa84219addd230 | active |
| S15.5.4.15_A1_T5.js | 216a114b8c7b2cf6479da377459a53cd48585dfe1f2888e8d0e09f223d5e701b | Function constructor requires concrete string arguments and a body; other argument forms are not yet supported |
| S15.5.4.15_A1_T6.js | e503c362f88ae8b001ae9edfc5689d60c74e45a7c165eca0e236b45cb07bb222 | String wrapper construction is not yet supported |
| S15.5.4.15_A1_T7.js | d403ffd6adc0a5ac1cdc8547c6471e7160a83b68deeddae5ee3c12fca1500153 | active |
| S15.5.4.15_A1_T8.js | f7e5ff6bdc49302f26f26e0ce6019cce7bbe4c2ef12be9a02ccb2af21193ed05 | active |
| S15.5.4.15_A1_T9.js | 91c431d40a7ac20c7ee5939ba1649d4e66acd73d18f1011e1d409f1f888144d5 | String wrapper construction is not yet supported |
| S15.5.4.15_A2_T1.js | b4f3338b2b33140a9b62a282bfb9487ef922ed0a4543f7de5c6366f2f6c284d4 | String wrapper construction is not yet supported |
| S15.5.4.15_A2_T10.js | 0ee8ae77b84389d439b9997bd848f4e518b496428e01038a07814b06e86d6709 | String wrapper construction is not yet supported |
| S15.5.4.15_A2_T2.js | 7ed65a23a9b2be891129d723461656a480f6e544c9e1f2e6553931954cbbe352 | String wrapper construction is not yet supported |
| S15.5.4.15_A2_T3.js | c9878f8a3a0d30791d4af9f407481161084f43047660631b4ea48a7776746bc9 | String wrapper construction is not yet supported |
| S15.5.4.15_A2_T4.js | 2a2e7e455678d3fde3a769f41afdc14db86eaab0fb775c8f88dd8dee320bf2ef | String wrapper construction is not yet supported |
| S15.5.4.15_A2_T5.js | d7f0aa206726880ebe4dc30b42c1cb719c8449b1aca51c72b5d7dd23ccc8ac79 | String wrapper construction is not yet supported |
| S15.5.4.15_A2_T6.js | 5e9e1ec5bac7c83c4d4ee3d0a609844ace333dd60c603ce8c53747ffd2d7637d | String wrapper construction is not yet supported |
| S15.5.4.15_A2_T7.js | 6718794a24dff4823cadac775ec32e26c1533b98eba6fabc1516f173158880a4 | String wrapper construction is not yet supported |
| S15.5.4.15_A2_T8.js | a9cc170310452087099fe884036fcf0f0133db9ab0623c321a62b45754aee765 | String wrapper construction is not yet supported |
| S15.5.4.15_A2_T9.js | 3d0e96c98bc0a0ff2b60a91362eb8eb454dc2a1812109be99bca73f28f998f9c | String wrapper construction is not yet supported |
| S15.5.4.15_A3_T1.js | 77a85007815dca4b6f1202f6817c06d3bab739256a6953a0281dbff67708abc1 | Unfinished execution in Test262 test |
| S15.5.4.15_A3_T10.js | fcbde9b15b54d356923a9af2d3aedce92aedba7ab29706e316928a99f5a89279 | active |
| S15.5.4.15_A3_T11.js | f601f221f308537947ff5d0d3409dae1eab849b39ac6a816816ecb4a12bd03b3 | Boolean wrapper construction is not yet supported |
| S15.5.4.15_A3_T2.js | 7bb7f1eeef68ece364d23d3b761a3b7393425bc673c09da10052917f6d75ca9b | Unfinished execution in Test262 test |
| S15.5.4.15_A3_T3.js | 4f9a479f74dc732f4937accd1ca50301b5c3a5de57e6a4bf069d5796da5a7aac | Unfinished execution in Test262 test |
| S15.5.4.15_A3_T4.js | 0b019dc8ea502ab13201766baa4d804d6fb6d1e4398f28603214d6c051a4fa32 | Unfinished execution in Test262 test |
| S15.5.4.15_A3_T5.js | 90d05d2db9be57db5b51eae1771f9ff2d6f9e6057c570c39101579a653c84057 | active |
| S15.5.4.15_A3_T6.js | 4d6a3c02287b0545c0cc6781278467bfc4bacd1b5095227df0640f7d3a3a8044 | active |
| S15.5.4.15_A3_T7.js | d6eea48b226e723b4347058906d1028f9fdd917b5d0e8e94f608c4b32c1d7b2b | active |
| S15.5.4.15_A3_T8.js | 2c0d6c262a5db28008cff54ac1e67001a3962c448101a672b25a9224433c8304 | Number wrapper construction is not yet supported |
| S15.5.4.15_A3_T9.js | fbee3407dccd6d3775a06882f503dde227df9185095dc63d14715ee1cefba1f8 | Unfinished execution in Test262 test |
| S15.5.4.15_A6.js | 7fbd3f3bb7819097cf978a3618105d99e3b1826893deca152d5e4ac58c9dbc31 | active |
| S15.5.4.15_A7.js | 21e3cc546b23e48e66e571ed0de54c9314d22d9b5cf0759a5eae9d1b6b8e1128 | active |
| S15.5.4.15_A8.js | 3a69d8a0e2d5aac4faafcec131491eb56489b2e3fa5353a210b85529d4620336 | Unfinished execution in Test262 test |
| S15.5.4.15_A9.js | 49f9006e5a47f288ecd3f13a52806026071e6a8fe1f7605922376e3c88994f23 | Unfinished execution in Test262 test |
| name.js | e74ad3c22f240004b6d542968853d0790e4b28262a12b4ae181ae51ff55f5689 | Unsupported Test262 includes: propertyHelper.js |
| this-value-not-obj-coercible.js | 72b97b920286b80567d22966937a8082dabeb30cb58b84516edd463ec2ccc7ff | active |
