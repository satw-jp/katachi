from pathlib import Path
import sys,unittest,json,time
P=Path(__file__).parent;variant=sys.argv[1]
sys.path[:0]=[str(P/variant),str(P/'deps'),str(P.parent/'MINIL_LOWZ50_SAVED_LIGHT_GCODE_DIAGNOSTIC_20261023/runtime')]
names=['test_causal_v1','test_continuous_area','test_light_gcode_diagnostic_v1','test_arc_precision','test_followup_extrusions']
if variant=='p2':names.append('test_p2')
suite=unittest.TestSuite(unittest.defaultTestLoader.loadTestsFromName(n) for n in names)
with (P/('TEST_RESULTS.txt' if variant=='p2' else 'PERF_TEST_RESULTS.txt')).open('w') as f:r=unittest.TextTestRunner(stream=f,verbosity=2).run(suite)
print(dict(variant=variant,tests=r.testsRun,pass_all=r.wasSuccessful()));sys.exit(0 if r.wasSuccessful() else 1)
